import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, Eye, EyeOff, Sparkles, Trash2 } from "lucide-react";
import JsonEditor from "../../components/JsonEditor";
import Segmented from "../../components/Segmented";
import Toggle from "../../components/Toggle";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import type { ResultError } from "../../core/result";
import { CURL_TARGETS, convertCurl, type ConvertResult, type CurlTarget } from "./lib/convert";
import { parseCurl } from "../../lib/debugkit/parse";
import { Redactor } from "../../lib/debugkit/redact";
import type { ToolHandle } from "../../lib/toolHandle";
import type { ToolProps } from "../../registry/types";
import { takeHandoff } from "../../shell/handoff";
import { downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

/** What "Copy as cURL" produces in DevTools, with one secret-shaped value to show redaction working. */
const SAMPLE_CURL = `curl 'https://api.example.com/v1/items?page=2' \\
  -H 'authorization: Bearer demo-token-abc123' \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: demo-key-9f3a7b2c' \\
  --compressed`;

/** Above this the tool stops recomputing on every keystroke (P2 shared rule). */
const MANUAL_THRESHOLD = 1_000_000;

const EXT: Record<CurlTarget, { file: string; mime: string }> = {
  fetch: { file: "request.js", mime: "text/javascript" },
  axios: { file: "request.js", mime: "text/javascript" },
  python: { file: "request.py", mime: "text/x-python" },
  go: { file: "main.go", mime: "text/x-go" },
};

type Parsed = { ok: true; value: ConvertResult } | { ok: false; error: ResultError };

/** A short, redaction-safe reading of what the command actually asks for. */
interface RequestFace {
  method: string;
  url: string;
  headers: number;
  body: string;
}

function describeRequest(text: string, redact: boolean): RequestFace | null {
  const { exchange } = parseCurl(text, 1);
  const rawUrl = exchange.url ?? "";
  if (rawUrl === "" && (exchange.requestHeaders ?? []).length === 0 && !exchange.requestBody) return null;
  const body = exchange.requestBody ?? "";
  let bodyKind = "no body";
  if (body !== "") {
    const ct = (exchange.requestHeaders ?? []).find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
    bodyKind = /json/i.test(ct) ? "JSON body" : /=(.*)&|=$/.test(body) ? "form body" : "text body";
  }
  return {
    method: exchange.method || (body ? "POST" : "GET"),
    url: redact ? new Redactor().redactText(rawUrl) : rawUrl,
    headers: (exchange.requestHeaders ?? []).length,
    body: bodyKind,
  };
}

const CurlConverterApp = forwardRef<ToolHandle, ToolProps>(function CurlConverterApp(props, ref) {
  const [src, setSrc] = useState("");
  const [target, setTarget] = useState<CurlTarget>("fetch");
  const [redact, setRedact] = useState(true);
  const [committed, setCommitted] = useState<{ text: string; target: CurlTarget; redact: boolean } | null>(null);

  const isEmpty = src.trim() === "";
  const manual = src.length > MANUAL_THRESHOLD;
  const debounced = useDebouncedValue(src, 150);
  // null means "not run yet": in manual mode nothing converts until Compare.
  const activeText = manual ? (committed ? committed.text : null) : debounced;
  const activeTarget = manual && committed ? committed.target : target;
  const activeRedact = manual && committed ? committed.redact : redact;
  const isStale =
    manual && committed !== null && (committed.text !== src || committed.target !== target || committed.redact !== redact);

  const parsed: Parsed | null = useMemo(() => {
    if (activeText === null || activeText.trim() === "") return null;
    const r = convertCurl(activeText, activeTarget, { redact: activeRedact });
    return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
  }, [activeText, activeTarget, activeRedact]);

  const face = useMemo(() => {
    if (!parsed?.ok || activeText === null) return null;
    return describeRequest(activeText, activeRedact);
  }, [parsed, activeText, activeRedact]);

  // A hand-off from the home paste box (see shell/handoff.ts).
  useEffect(() => {
    if (!props.isActive) return;
    const handoff = takeHandoff("curl-converter");
    if (handoff) {
      setSrc(handoff.text);
      setCommitted(null);
    }
  }, [props.isActive]);

  function clear() {
    setSrc("");
    setCommitted(null);
    toast("Cleared");
  }

  function loadSample() {
    setSrc(SAMPLE_CURL);
    setCommitted(null);
    toast("Loaded sample cURL command");
  }

  const copyOutput = useCallback(async () => {
    if (!parsed?.ok) {
      toast("Nothing to copy yet");
      return;
    }
    await copyAndNotify(parsed.value.code, "Copied the code");
  }, [parsed]);

  async function downloadOutput() {
    if (!parsed?.ok) {
      toast("Nothing to download yet");
      return;
    }
    const { file, mime } = EXT[target];
    await downloadText(file, parsed.value.code, mime);
    toast(`Downloaded ${file}`);
  }

  const commands: Command[] = [
    { id: "curl-converter-sample", label: "Load sample cURL command", group: "cURL Converter", action: loadSample },
    { id: "curl-converter-clear", label: "Clear input", group: "cURL Converter", action: clear },
    ...(parsed?.ok ? [{ id: "curl-converter-copy-cmd", label: "Copy output", group: "cURL Converter", action: copyOutput }] : []),
    { id: "curl-converter-toggle-redact", label: redact ? "Turn redaction off" : "Turn redaction on", group: "cURL Converter", action: () => setRedact((v) => !v) },
    ...CURL_TARGETS.map((t) => ({ id: `curl-converter-target-${t.id}`, label: `Convert to ${t.label}`, group: "cURL Converter", action: () => setTarget(t.id) })),
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const outputLabel = target === "python" ? "Python" : target === "go" ? "Go" : target === "axios" ? "axios" : "fetch";

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <div data-testid="curl-converter-target">
              <Segmented
                label="Target language"
                value={target}
                onChange={setTarget}
                options={CURL_TARGETS.map((t) => ({ id: t.id, label: t.label }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-curl-converter-sample"
              onClick={loadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Load sample</span>
              <span className="sm:hidden">Sample</span>
            </button>
            <button
              type="button"
              data-testid="btn-curl-converter-clear"
              onClick={clear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-raised px-2.5 py-1.5">
              <span data-testid="curl-converter-redact">
                <Toggle checked={redact} onChange={setRedact} label="Redact secrets" />
              </span>
              {redact ? <Eye className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5 text-warn" strokeWidth={2} aria-hidden="true" />}
            </div>
            {manual && (
              <button
                type="button"
                data-testid="curl-converter-run"
                onClick={() => setCommitted({ text: src, target, redact })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-warn"
              >
                {isStale ? "Convert again" : "Convert"} {Math.round(src.length / 1000)}k chars
              </button>
            )}
          </div>

          {!redact && !isEmpty && (
            <div data-testid="curl-converter-plain-warning" className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-warn">
              Output contains your real credentials.
            </div>
          )}

          {isEmpty ? (
            <div data-testid="curl-converter-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              Paste a cURL command — Chrome and Firefox “Copy as cURL” both work, bash or cmd style
            </div>
          ) : parsed?.ok ? (
            <div data-testid="curl-converter-status" data-status="valid" className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Converted to {outputLabel}
              {parsed.value.redactions > 0 ? ` · ${parsed.value.redactions} ${parsed.value.redactions === 1 ? "secret" : "secrets"} redacted` : ""}
            </div>
          ) : parsed ? (
            <div data-testid="curl-converter-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{parsed.error.message}</span>
            </div>
          ) : (
            <div data-testid="curl-converter-status" data-status="idle" className="text-xs text-ink-faint">
              This command is over {MANUAL_THRESHOLD.toLocaleString("en-US")} characters, so nothing converts until you press Convert.
            </div>
          )}
        </div>

        <div data-testid="curl-converter-input" className="relative min-h-0 flex-1">
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            aria-label="cURL command"
            placeholder={"curl 'https://api.example.com/v1/items' \\\n  -H 'authorization: Bearer …'"}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
          />
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        {face && (
          <div data-testid="curl-converter-parsed" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle bg-raised/40 px-3 py-2 text-[11px] text-ink-dim">
            <span className="font-mono font-medium text-ink">{face.method}</span>
            <span className="max-w-full truncate font-mono" title={face.url}>
              {face.url}
            </span>
            <span>
              {face.headers} header{face.headers === 1 ? "" : "s"} · {face.body}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-2">
          <span className="px-1 text-xs font-medium text-ink-dim">{outputLabel}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="curl-converter-copy"
              onClick={copyOutput}
              disabled={!parsed?.ok}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy
            </button>
            <button
              type="button"
              data-testid="curl-converter-download"
              onClick={downloadOutput}
              disabled={!parsed?.ok}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Download
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {parsed?.ok ? (
            <div data-testid="curl-converter-output" className="min-h-0 flex-1">
              <JsonEditor
                value={parsed.value.code}
                readOnly
                language={target === "fetch" || target === "axios" ? "ts" : "text"}
                ariaLabel={`${outputLabel} code`}
                lint={false}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">
              {isEmpty
                ? "Nothing here yet — paste a command on the left, or load the sample."
                : manual
                  ? "Press Convert to generate the code."
                  : "Fix the command on the left and the code will appear here."}
            </div>
          )}

          {parsed?.ok && parsed.value.notes.length > 0 && (
            <ul data-testid="curl-converter-notes" className="max-h-[28vh] space-y-1 overflow-auto border-t border-border-subtle p-2.5 text-xs text-ink-dim">
              {parsed.value.notes.map((n) => (
                <li key={n} className="flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-warn" strokeWidth={2} aria-hidden="true" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          {isStale && (
            <p data-testid="curl-converter-stale" className="border-t border-border-subtle p-2.5 text-xs text-warn">
              The command, target or redaction changed since the last run — press Convert to update.
            </p>
          )}
        </div>
      </section>
    </main>
  );
});

export default CurlConverterApp;
