import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, Sparkles, Trash2 } from "lucide-react";
import JsonEditor from "../../components/JsonEditor";
import Segmented from "../../components/Segmented";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import type { ResultError } from "../../core/result";
import type { ToolHandle } from "../../lib/toolHandle";
import type { ToolProps } from "../../registry/types";
import { takeHandoff } from "../../shell/handoff";
import { downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { guessDirection, jsonToYaml, yamlToJson, type Direction } from "../../core/yaml/yaml";

const YAML_SAMPLE = `# kubernetes-style manifest
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: demo
spec:
  ports:
    - 80
    - 443
  enabled: yes
`;

const JSON_SAMPLE = '{"name":"demo","count":3,"tags":["a","b"],"active":true,"note":null}';

/** Above this the tool stops recomputing on every keystroke (P2 shared rule). */
const MANUAL_THRESHOLD = 1_000_000;

interface Output {
  text: string;
  notes: string[];
  documents: number;
}

type Parsed = { ok: true; output: Output } | { ok: false; error: ResultError };

const YamlJsonApp = forwardRef<ToolHandle, ToolProps>(function YamlJsonApp(props, ref) {
  const [src, setSrc] = useState("");
  const [direction, setDirection] = useState<Direction>("yaml-to-json");
  const [indent, setIndent] = useState<2 | 4>(2);
  // The snapshot the Convert button committed while the input was oversized.
  const [committed, setCommitted] = useState("");

  const isEmpty = src.trim() === "";
  const manual = src.length > MANUAL_THRESHOLD;
  const debounced = useDebouncedValue(src, 150);
  const active = manual ? committed : debounced;
  const isStale = manual && committed !== "" && committed !== src;

  const parsed: Parsed | null = useMemo(() => {
    if (active.trim() === "") return null;
    if (direction === "yaml-to-json") {
      const r = yamlToJson(active, indent);
      return r.ok ? { ok: true, output: { text: r.value.json, notes: r.value.notes, documents: r.value.documents } } : { ok: false, error: r.error };
    }
    const r = jsonToYaml(active, indent);
    return r.ok ? { ok: true, output: { text: r.value, notes: [], documents: 1 } } : { ok: false, error: r.error };
  }, [active, direction, indent]);

  // Leaving manual mode drops the snapshot so re-entering it starts from "press Convert".
  useEffect(() => {
    if (!manual) setCommitted("");
  }, [manual]);

  function clear() {
    setSrc("");
    setCommitted("");
    toast("Cleared");
  }

  function loadSample(which: "yaml" | "json" = "yaml") {
    const text = which === "yaml" ? YAML_SAMPLE : JSON_SAMPLE;
    setSrc(text);
    setDirection(guessDirection(text));
    setCommitted("");
    toast(which === "yaml" ? "Loaded sample YAML" : "Loaded sample JSON");
  }

  const copyOutput = useCallback(async () => {
    if (!parsed?.ok) {
      toast("Nothing to copy yet");
      return;
    }
    await copyAndNotify(parsed.output.text, "Copied result");
  }, [parsed]);

  async function downloadOutput() {
    if (!parsed?.ok) {
      toast("Nothing to download yet");
      return;
    }
    const asYaml = direction === "json-to-yaml";
    const filename = asYaml ? "converted.yaml" : "converted.json";
    await downloadText(filename, parsed.output.text, asYaml ? "text/yaml" : "application/json");
    toast(`Downloaded ${filename}`);
  }

  function acceptHandoff(text: string) {
    setSrc(text);
    setDirection(guessDirection(text));
    setCommitted("");
  }

  // Apply a one-shot hand-off from the home page (see shell/handoff.ts).
  useEffect(() => {
    if (!props.isActive) return;
    const handoff = takeHandoff("yaml-json");
    if (handoff) acceptHandoff(handoff.text);
  }, [props.isActive]);

  const commands: Command[] = [
    { id: "yaml-json-sample", label: "Load sample YAML", group: "YAML ⇄ JSON", action: () => loadSample("yaml") },
    { id: "yaml-json-sample-json", label: "Load sample JSON", group: "YAML ⇄ JSON", action: () => loadSample("json") },
    { id: "yaml-json-clear", label: "Clear input", group: "YAML ⇄ JSON", action: clear },
    ...(parsed?.ok ? [{ id: "yaml-json-copy-output", label: "Copy output", group: "YAML ⇄ JSON", action: copyOutput }] : []),
    { id: "yaml-json-to-json", label: "Convert YAML to JSON", group: "YAML ⇄ JSON", action: () => setDirection("yaml-to-json") },
    { id: "yaml-json-to-yaml", label: "Convert JSON to YAML", group: "YAML ⇄ JSON", action: () => setDirection("json-to-yaml") },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const outputLabel = direction === "yaml-to-json" ? "JSON" : "YAML";

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <div data-testid="yaml-json-direction">
              <Segmented
                label="Conversion direction"
                value={direction}
                onChange={setDirection}
                options={[
                  { id: "yaml-to-json", label: "YAML → JSON" },
                  { id: "json-to-yaml", label: "JSON → YAML" },
                ]}
              />
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-dim">
              <span>Indent</span>
              <select
                data-testid="yaml-json-indent"
                value={indent}
                onChange={(e) => setIndent(e.target.value === "4" ? 4 : 2)}
                className="focus-ring rounded-lg border border-border bg-raised px-2 py-1 text-xs text-ink"
              >
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-yaml-json-sample"
              onClick={() => loadSample(direction === "json-to-yaml" ? "json" : "yaml")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Load sample</span>
              <span className="sm:hidden">Sample</span>
            </button>
            <button
              type="button"
              data-testid="btn-yaml-json-clear"
              onClick={clear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
            {manual && (
              <button
                type="button"
                data-testid="yaml-json-run"
                onClick={() => setCommitted(src)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-warn"
              >
                {isStale ? "Convert again" : "Convert"} {Math.round(src.length / 1000)}k chars
              </button>
            )}
          </div>

          {isEmpty ? (
            <div data-testid="yaml-json-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              Paste YAML on the left to get JSON, or JSON to get YAML
            </div>
          ) : parsed?.ok ? (
            <div data-testid="yaml-json-status" data-status="valid" className="flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              Converted to {outputLabel}
              {parsed.output.documents > 1 ? ` (${parsed.output.documents} documents)` : ""}
            </div>
          ) : parsed ? (
            <div data-testid="yaml-json-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>
                {parsed.error.message}
                {parsed.error.line
                  ? ` (line ${parsed.error.line}${parsed.error.column ? `, column ${parsed.error.column}` : ""})`
                  : ""}
              </span>
            </div>
          ) : manual ? (
            <div data-testid="yaml-json-status" data-status="idle" className="text-xs text-ink-faint">
              This input is over {MANUAL_THRESHOLD.toLocaleString("en-US")} characters, so nothing converts until you press Convert.
            </div>
          ) : null}

          {isStale && (
            <div data-testid="yaml-json-stale" className="text-xs text-warn">
              The input changed after the last run — press Convert to update the result.
            </div>
          )}
        </div>

        <div data-testid="yaml-json-input" className="relative min-h-0 flex-1">
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) setDirection(guessDirection(text));
            }}
            aria-label={direction === "yaml-to-json" ? "YAML input" : "JSON input"}
            placeholder={direction === "yaml-to-json" ? "Paste YAML here…" : "Paste JSON here…"}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
          />
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-2">
          <span className="px-1 text-xs font-medium text-ink-dim">{outputLabel}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="yaml-json-copy"
              onClick={copyOutput}
              disabled={!parsed?.ok}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy
            </button>
            <button
              type="button"
              data-testid="yaml-json-download"
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
            <div data-testid="yaml-json-output" className="min-h-0 flex-1">
              <JsonEditor
                value={parsed.output.text}
                readOnly
                language={direction === "yaml-to-json" ? "json" : "text"}
                ariaLabel={direction === "yaml-to-json" ? "JSON output" : "YAML output"}
                lint={false}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">
              {isEmpty
                ? "Nothing here yet — paste something on the left, or load a sample."
                : manual
                  ? `Press Convert to turn these ${Math.round(src.length / 1000)}k characters into ${outputLabel}.`
                  : "Fix the error on the left and the result will appear here."}
            </div>
          )}
          {parsed?.ok && parsed.output.notes.length > 0 && (
            <ul data-testid="yaml-json-notes" className="border-t border-border-subtle p-2.5 text-xs text-ink-dim">
              {parsed.output.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
});

export default YamlJsonApp;
