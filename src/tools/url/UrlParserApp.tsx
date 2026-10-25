import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, Copy, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import { buildUrl, parseUrlText, type QueryEntry, type UrlParts } from "../../core/url/url";
import { isSecretKey } from "../../lib/debugkit/redact";
import type { ToolHandle } from "../../lib/toolHandle";
import type { ToolProps } from "../../registry/types";
import { takeHandoff } from "../../shell/handoff";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const SAMPLE_URL = "https://example.com/reports/2026?format=json&token=abc123def&tag=live&tag=ops#summary";

/** The parts shown as cards. Order matters: it reads left to right, most useful first. */
const CARD_FIELDS: { key: keyof UrlParts; label: string }[] = [
  { key: "protocol", label: "Protocol" },
  { key: "hostname", label: "Host" },
  { key: "port", label: "Port" },
  { key: "pathname", label: "Path" },
  { key: "hash", label: "Fragment" },
  { key: "origin", label: "Origin" },
];

const UrlParserApp = forwardRef<ToolHandle, ToolProps>(function UrlParserApp(props, ref) {
  const [src, setSrc] = useState("");
  // Edits are remembered against the href they were made from, so typing a new
  // URL can never silently keep the previous URL's parameters.
  const [draft, setDraft] = useState<{ href: string; rows: QueryEntry[] } | null>(null);

  const debounced = useDebouncedValue(src, 150);
  const parsed = useMemo(() => {
    if (debounced.trim() === "") return null;
    const r = parseUrlText(debounced);
    return r.ok ? r.value : null;
  }, [debounced]);
  const invalid = debounced.trim() !== "" && parsed === null;

  const rows: QueryEntry[] = useMemo(() => {
    if (!parsed) return [];
    if (draft && draft.href === parsed.href) return draft.rows;
    return parsed.query;
  }, [parsed, draft]);

  const built = useMemo(() => (parsed ? buildUrl({ ...parsed, query: rows }) : ""), [parsed, rows]);

  // Recomputed over the *edited* rows, not the parsed ones: renaming a parameter
  // to "password" has to raise the warning, and removing the offending row has to
  // clear it. The core still reports warnings for a freshly parsed URL, which is
  // what the CLI and the tests consume.
  const warnings = useMemo(() => {
    if (!parsed) return [];
    const out: string[] = [];
    if (parsed.username !== "" || parsed.password !== "") {
      out.push("Contains a username/password — avoid sharing this URL.");
    }
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const { key } of rows) {
      if (key.trim() === "") continue;
      if (isSecretKey(key)) out.push(`Query parameter '${key}' looks like a secret.`);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    for (const key of duplicates) out.push(`Duplicate parameter '${key}'.`);
    return [...new Set(out)];
  }, [parsed, rows]);

  useEffect(() => {
    if (!props.isActive) return;
    const handoff = takeHandoff("url-parser");
    if (handoff) {
      setSrc(handoff.text);
      setDraft(null);
    }
  }, [props.isActive]);

  function updateRow(index: number, field: keyof QueryEntry, value: string) {
    if (!parsed) return;
    setDraft({ href: parsed.href, rows: rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)) });
  }

  function removeRow(index: number) {
    if (!parsed) return;
    setDraft({ href: parsed.href, rows: rows.filter((_, i) => i !== index) });
  }

  function addRow() {
    if (!parsed) return;
    setDraft({ href: parsed.href, rows: [...rows, { key: "", value: "" }] });
  }

  function resetRows() {
    setDraft(parsed ? { href: parsed.href, rows: parsed.query } : null);
  }

  function clear() {
    setSrc("");
    setDraft(null);
    toast("Cleared");
  }

  function loadSample() {
    setSrc(SAMPLE_URL);
    setDraft(null);
    toast("Loaded sample URL");
  }

  const copyOutput = useCallback(async () => {
    if (built === "") {
      toast("Nothing to copy yet");
      return;
    }
    await copyAndNotify(built, "Copied the rebuilt URL");
  }, [built]);

  const commands: Command[] = [
    { id: "url-parser-sample", label: "Load sample URL", group: "URL Parser", action: loadSample },
    { id: "url-parser-clear", label: "Clear input", group: "URL Parser", action: clear },
    ...(built !== "" ? [{ id: "url-parser-copy-cmd", label: "Copy output", group: "URL Parser", action: copyOutput }] : []),
    { id: "url-parser-add", label: "Add a query parameter", group: "URL Parser", action: addRow },
    { id: "url-parser-reset", label: "Undo parameter edits", group: "URL Parser", action: resetRows },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const edited = draft !== null && parsed !== null && draft.rows !== parsed.query;

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:gap-3 lg:overflow-hidden lg:p-4">
      <section className="rounded-xl border border-border bg-surface p-3 shadow-panel">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="btn-url-parser-sample"
            onClick={loadSample}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Load sample</span>
            <span className="sm:hidden">Sample</span>
          </button>
          <button
            type="button"
            data-testid="btn-url-parser-clear"
            onClick={clear}
            disabled={src === ""}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            Clear
          </button>
          {src.trim() === "" ? (
            <span data-testid="url-parser-status" data-status="empty" className="ml-1 text-xs text-ink-faint">
              Paste a URL to split it into parts
            </span>
          ) : parsed ? (
            <span data-testid="url-parser-status" data-status="valid" className="ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-ok">
              <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
              {parsed.hostname === "" ? `A ${parsed.protocol.replace(":", "")} URL` : parsed.hostname}
              {warnings.length > 0 ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}
            </span>
          ) : invalid ? (
            <span data-testid="url-parser-status" data-status="invalid" className="ml-1 inline-flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              This isn't a valid URL.
            </span>
          ) : null}
        </div>

        <input
          id="url-parser-field"
          data-testid="url-parser-input"
          type="text"
          value={src}
          onChange={(e) => {
            setSrc(e.target.value);
            setDraft(null);
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="URL to parse"
          placeholder="https://example.com/path?a=1&b=2#frag"
          className="focus-ring w-full rounded-lg border border-border bg-canvas px-3 py-2.5 font-mono text-[13px] text-ink placeholder:text-ink-faint"
        />

        {warnings.length > 0 && (
          <ul data-testid="url-parser-warnings" className="mt-2 space-y-1">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 text-xs font-medium text-warn">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(380px,1.15fr)] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div data-testid="url-parser-parts" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CARD_FIELDS.map(({ key, label }) => {
              const value = String(parsed?.[key] ?? "");
              return (
                <div key={label} className="rounded-lg border border-border-subtle bg-surface px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
                  <p className="mt-0.5 break-all font-mono text-[12px] text-ink">{value === "" ? "—" : value}</p>
                </div>
              );
            })}
          </div>

          {parsed && parsed.segments.length > 0 && (
            <div className="rounded-lg border border-border-subtle bg-surface px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">Path segments</p>
              <ol className="mt-1 flex flex-wrap gap-1.5">
                {parsed.segments.map((s, i) => (
                  <li key={`${s}-${i}`} className="rounded border border-border bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-dim">
                    {i + 1}. {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {parsed && (parsed.username !== "" || parsed.password !== "") && (
            <div className="rounded-lg border border-err/30 bg-err/10 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-err">Credentials in the URL</p>
              <p className="mt-0.5 break-all font-mono text-[12px] text-ink">
                {parsed.username}
                {parsed.password !== "" ? ` :${parsed.password}` : ""}
              </p>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <h2 className="text-xs font-semibold text-ink">Query parameters</h2>
            <div className="flex items-center gap-1.5">
              {edited && (
                <button
                  type="button"
                  data-testid="url-parser-reset"
                  onClick={resetRows}
                  className="rounded-lg border border-border bg-raised px-2 py-1 text-[11px] text-ink-dim hover:text-ink"
                >
                  Undo edits
                </button>
              )}
              <button
                type="button"
                data-testid="url-parser-add"
                onClick={addRow}
                disabled={!parsed}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-raised px-2 py-1 text-[11px] font-medium text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                Add parameter
              </button>
            </div>
          </div>

          <div data-testid="url-parser-table" className="min-h-0 flex-1 overflow-y-auto p-2">
            {!parsed ? (
              <p className="flex h-full items-center justify-center p-4 text-center text-sm text-ink-faint">
                {invalid ? "Nothing to edit until the URL parses." : "Parameters appear here once you paste a URL."}
              </p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-faint">This URL has no query parameters. Add one.</p>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                    <th className="px-1 pb-1 font-medium">Key</th>
                    <th className="px-1 pb-1 font-medium">Value</th>
                    <th className="w-8 px-1 pb-1" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="p-0.5 align-top">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => updateRow(i, "key", e.target.value)}
                          aria-label={`Query parameter ${i + 1} name`}
                          spellCheck={false}
                          className="focus-ring w-full rounded border border-border bg-canvas px-2 py-1 font-mono text-[12px] text-ink"
                        />
                      </td>
                      <td className="p-0.5 align-top">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => updateRow(i, "value", e.target.value)}
                          aria-label={`Query parameter ${i + 1} value`}
                          spellCheck={false}
                          className="focus-ring w-full rounded border border-border bg-canvas px-2 py-1 font-mono text-[12px] text-ink"
                        />
                      </td>
                      <td className="p-0.5 align-top">
                        <button
                          type="button"
                          data-testid={`url-parser-delete-${i}`}
                          onClick={() => removeRow(i)}
                          aria-label={`Remove parameter ${i + 1}`}
                          className="focus-ring rounded border border-border bg-raised p-1 text-ink-dim hover:text-err"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-border-subtle p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-ink-faint">Rebuilt URL</span>
              <button
                type="button"
                data-testid="url-parser-copy"
                onClick={copyOutput}
                disabled={built === ""}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
            </div>
            <p
              data-testid="url-parser-output"
              className="max-h-24 overflow-auto break-all rounded-lg border border-border-subtle bg-canvas px-2.5 py-2 font-mono text-[12px] leading-5 text-ink"
            >
              {built === "" ? "Paste a URL to rebuild it here." : built}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
});

export default UrlParserApp;
