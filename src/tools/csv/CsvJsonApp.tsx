import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, Sparkles, Trash2 } from "lucide-react";
import JsonEditor from "../../components/JsonEditor";
import Segmented from "../../components/Segmented";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import type { ResultError } from "../../core/result";
import { csvToJson, jsonToCsv, type InputDelimiter, type OutDelimiter } from "../../core/csv/csv";
import { downloadText } from "../../lib/clipboard";
import type { ToolHandle } from "../../lib/toolHandle";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { ToolProps } from "../../registry/types";
import { takeHandoff } from "../../shell/handoff";

type Direction = "csv-to-json" | "json-to-csv";

const CSV_SAMPLE = `id,name,note,qty
00123,"Rivera, Ana","said ""hi""",4
00124,Bo,"line one
line two",
00125,Kim,-=SUM(A1),7
`;

const JSON_SAMPLE = '[{"id":"00123","name":"Rivera, Ana","qty":4,"tags":["a","b"]}]';

/** Above this the tool stops recomputing on every keystroke (P2 shared rule). */
const MANUAL_THRESHOLD = 1_000_000;
/** The Table tab is a preview, not a virtualised grid (T-206 spec). */
const TABLE_ROWS = 200;

const DELIMITER_LABEL: Record<string, string> = {
  ",": "Comma",
  ";": "Semicolon",
  "\t": "Tab",
  "|": "Pipe",
};

const IN_DELIMITERS: InputDelimiter[] = ["auto", ",", ";", "\t", "|"];
const OUT_DELIMITERS: OutDelimiter[] = [",", ";", "\t", "|"];

function guessDirection(text: string): Direction {
  const trimmed = text.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{") ? "json-to-csv" : "csv-to-json";
}

interface Table {
  columns: string[];
  rows: string[][];
}

interface Output {
  text: string;
  notes: string[];
  summary: string;
}

type Parsed = { ok: true; output: Output } | { ok: false; error: ResultError };

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Reads the produced JSON back into a grid. Only runs while the Table tab is
 *  open, so the common path never pays for a second parse. */
function toTable(json: string): Table | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const rows = parsed.slice(0, TABLE_ROWS);
  if (rows.length === 0) return null;
  if (Array.isArray(rows[0])) {
    const width = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
    return {
      columns: Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
      rows: rows.map((r) => Array.from({ length: width }, (_, i) => cellText(Array.isArray(r) ? r[i] : undefined))),
    };
  }
  const columns: string[] = [];
  for (const row of parsed) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
  }
  return {
    columns,
    rows: rows.map((row) => columns.map((key) => cellText((row as Record<string, unknown>)?.[key]))),
  };
}

const CsvJsonApp = forwardRef<ToolHandle, ToolProps>(function CsvJsonApp(props, ref) {
  const [src, setSrc] = useState("");
  const [direction, setDirection] = useState<Direction>("csv-to-json");
  const [header, setHeader] = useState(true);
  const [inDelimiter, setInDelimiter] = useState<InputDelimiter>("auto");
  const [outDelimiter, setOutDelimiter] = useState<OutDelimiter>(",");
  const [detectNumbers, setDetectNumbers] = useState(false);
  const [protectFormulas, setProtectFormulas] = useState(false);
  const [tab, setTab] = useState<"json" | "table">("json");
  // The snapshot the Convert button committed while the input was oversized.
  const [committed, setCommitted] = useState("");

  const isEmpty = src.trim() === "";
  const manual = src.length > MANUAL_THRESHOLD;
  const debounced = useDebouncedValue(src, 150);
  const active = manual ? committed : debounced;
  const isStale = manual && committed !== "" && committed !== src;

  // Every option is a primitive, so this memo re-runs on a real change and not
  // on every render — an options object literal here would defeat it.
  const parsed: Parsed | null = useMemo(() => {
    if (active.trim() === "") return null;
    if (direction === "csv-to-json") {
      const r = csvToJson(active, { header, delimiter: inDelimiter, dynamicTyping: detectNumbers });
      if (!r.ok) return { ok: false, error: r.error };
      const d = DELIMITER_LABEL[r.value.delimiter] ?? `"${r.value.delimiter}"`;
      return {
        ok: true,
        output: {
          text: r.value.json,
          notes: r.value.warnings,
          summary: `${r.value.rows.toLocaleString("en-US")} row${r.value.rows === 1 ? "" : "s"} · delimiter ${d} · ${
            header ? `${r.value.columns.length} named column${r.value.columns.length === 1 ? "" : "s"}` : "arrays of values"
          }`,
        },
      };
    }
    const r = jsonToCsv(active, { delimiter: outDelimiter, protectFormulas });
    if (!r.ok) return { ok: false, error: r.error };
    const lines = r.value.csv === "" ? 0 : r.value.csv.split("\r\n").length;
    return {
      ok: true,
      output: {
        text: r.value.csv,
        notes: r.value.warnings,
        summary: `${lines.toLocaleString("en-US")} line${lines === 1 ? "" : "s"} · delimiter ${DELIMITER_LABEL[outDelimiter]} · ${
          protectFormulas ? "formula protection on" : "formula protection off"
        }`,
      },
    };
  }, [active, direction, header, inDelimiter, outDelimiter, detectNumbers, protectFormulas]);

  const table = useMemo(
    () => (parsed?.ok && direction === "csv-to-json" && tab === "table" ? toTable(parsed.output.text) : null),
    [parsed, direction, tab]
  );

  // Leaving manual mode drops the snapshot so re-entering it starts from "press Convert".
  useEffect(() => {
    if (!manual) setCommitted("");
  }, [manual]);

  function applyText(text: string, next?: Direction) {
    setSrc(text);
    setCommitted("");
    setTab("json");
    if (next) setDirection(next);
  }

  function clear() {
    applyText("", direction);
    toast("Cleared");
  }

  function loadSample(which: "csv" | "json" = direction === "json-to-csv" ? "json" : "csv") {
    applyText(which === "csv" ? CSV_SAMPLE : JSON_SAMPLE, which === "csv" ? "csv-to-json" : "json-to-csv");
    toast(which === "csv" ? "Loaded sample CSV" : "Loaded sample JSON");
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
    const asJson = direction === "csv-to-json";
    await downloadText(asJson ? "converted.json" : "converted.csv", parsed.output.text, asJson ? "application/json" : "text/csv");
    toast(`Downloaded ${asJson ? "converted.json" : "converted.csv"}`);
  }

  // Apply a one-shot hand-off from the home page (see shell/handoff.ts).
  useEffect(() => {
    if (!props.isActive) return;
    const handoff = takeHandoff("csv-json");
    if (handoff) applyText(handoff.text, guessDirection(handoff.text));
  }, [props.isActive]);

  const commands: Command[] = [
    { id: "csv-json-sample", label: "Load sample CSV", group: "CSV ⇄ JSON", action: () => loadSample("csv") },
    { id: "csv-json-sample-json", label: "Load sample JSON", group: "CSV ⇄ JSON", action: () => loadSample("json") },
    { id: "csv-json-clear", label: "Clear input", group: "CSV ⇄ JSON", action: clear },
    ...(parsed?.ok ? [{ id: "csv-json-copy-output", label: "Copy output", group: "CSV ⇄ JSON", action: copyOutput }] : []),
    { id: "csv-json-to-json", label: "Convert CSV to JSON", group: "CSV ⇄ JSON", action: () => setDirection("csv-to-json") },
    { id: "csv-json-to-csv", label: "Convert JSON to CSV", group: "CSV ⇄ JSON", action: () => setDirection("json-to-csv") },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const outputLabel = direction === "csv-to-json" ? "JSON" : "CSV";

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <div data-testid="csv-json-direction">
              <Segmented
                label="Conversion direction"
                value={direction}
                onChange={setDirection}
                options={[
                  { id: "csv-to-json", label: "CSV → JSON" },
                  { id: "json-to-csv", label: "JSON → CSV" },
                ]}
              />
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-dim">
              <span>Delimiter</span>
              <select
                data-testid="csv-json-delimiter"
                value={direction === "csv-to-json" ? inDelimiter : outDelimiter}
                onChange={(e) => {
                  const value = e.target.value;
                  if (direction === "csv-to-json") setInDelimiter(value as InputDelimiter);
                  else setOutDelimiter(value as OutDelimiter);
                }}
                className="focus-ring rounded-lg border border-border bg-raised px-2 py-1 text-xs text-ink"
              >
                {direction === "csv-to-json"
                  ? IN_DELIMITERS.map((d) => (
                      <option key={d} value={d}>
                        {d === "auto" ? "Detect" : DELIMITER_LABEL[d]}
                      </option>
                    ))
                  : OUT_DELIMITERS.map((d) => (
                      <option key={d} value={d}>
                        {DELIMITER_LABEL[d]}
                      </option>
                    ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-csv-json-sample"
              onClick={() => loadSample()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Load sample</span>
              <span className="sm:hidden">Sample</span>
            </button>
            <button
              type="button"
              data-testid="btn-csv-json-clear"
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
                data-testid="csv-json-run"
                onClick={() => setCommitted(src)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-warn"
              >
                {isStale ? "Convert again" : "Convert"} {Math.round(src.length / 1000)}k chars
              </button>
            )}

            <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                data-testid="csv-json-header"
                checked={header}
                onChange={(e) => setHeader(e.target.checked)}
                disabled={direction === "json-to-csv"}
                className="focus-ring h-3.5 w-3.5 rounded border-border bg-raised accent-accent disabled:opacity-40"
              />
              <span>Header row</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                data-testid="csv-json-numbers"
                checked={detectNumbers}
                onChange={(e) => setDetectNumbers(e.target.checked)}
                disabled={direction === "json-to-csv"}
                className="focus-ring h-3.5 w-3.5 rounded border-border bg-raised accent-accent disabled:opacity-40"
              />
              <span>Detect numbers</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                data-testid="csv-json-protect"
                checked={protectFormulas}
                onChange={(e) => setProtectFormulas(e.target.checked)}
                disabled={direction === "csv-to-json"}
                className="focus-ring h-3.5 w-3.5 rounded border-border bg-raised accent-accent disabled:opacity-40"
              />
              <span>Formula protection</span>
            </label>
          </div>

          {isEmpty ? (
            <div data-testid="csv-json-status" data-status="empty" className="text-xs text-ink-faint">
              Paste CSV on the left to get JSON, or a JSON array to get CSV
            </div>
          ) : parsed?.ok ? (
            <div data-testid="csv-json-status" data-status="valid" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ok">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {outputLabel} ready
              </span>
              <span data-testid="csv-json-summary" className="text-ink-dim">
                {parsed.output.summary}
              </span>
            </div>
          ) : parsed ? (
            <div data-testid="csv-json-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>
                {parsed.error.message}
                {parsed.error.line ? ` (line ${parsed.error.line}${parsed.error.column ? `, column ${parsed.error.column}` : ""})` : ""}
              </span>
            </div>
          ) : manual ? (
            <div data-testid="csv-json-status" data-status="idle" className="text-xs text-ink-faint">
              This input is over {MANUAL_THRESHOLD.toLocaleString("en-US")} characters, so nothing converts until you press Convert.
            </div>
          ) : null}

          {isStale && (
            <div data-testid="csv-json-stale" className="text-xs text-warn">
              The input changed after the last run — press Convert to update the result.
            </div>
          )}
        </div>

        <div data-testid="csv-json-input" className="relative min-h-0 flex-1">
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) setDirection(guessDirection(text));
            }}
            aria-label={direction === "csv-to-json" ? "CSV input" : "JSON input"}
            placeholder={direction === "csv-to-json" ? "Paste CSV or TSV here…" : "Paste a JSON array here…"}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
          />
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle p-2">
          <div className="flex items-center gap-2">
            <span className="px-1 text-xs font-medium text-ink-dim">{outputLabel}</span>
            {direction === "csv-to-json" && (
              <div data-testid="csv-json-tabs">
                <Segmented
                  label="Output view"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { id: "json", label: "JSON" },
                    { id: "table", label: "Table" },
                  ]}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="csv-json-copy"
              onClick={copyOutput}
              disabled={!parsed?.ok}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy
            </button>
            <button
              type="button"
              data-testid="csv-json-download"
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
            tab === "table" && direction === "csv-to-json" ? (
              <div data-testid="csv-json-table" className="min-h-0 flex-1 overflow-auto p-2">
                {table ? (
                  <table className="w-full border-collapse text-[12px]">
                    <caption className="sr-only">First {Math.min(TABLE_ROWS, table.rows.length).toLocaleString("en-US")} rows of the converted data</caption>
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                        {table.columns.map((column, i) => (
                          <th key={`${column}-${i}`} scope="col" className="whitespace-nowrap px-1.5 pb-1 font-medium">
                            {column === "" ? "(blank)" : column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={r} className="border-t border-border-subtle">
                          {row.map((cell, c) => (
                            <td key={c} className="max-w-[22ch] truncate px-1.5 py-1 align-top font-mono text-ink" title={cell}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="flex h-full items-center justify-center p-4 text-center text-sm text-ink-faint">
                    The converted JSON has no rows to put in a table.
                  </p>
                )}
              </div>
            ) : (
              <div data-testid="csv-json-output" className="min-h-0 flex-1">
                <JsonEditor
                  value={parsed.output.text}
                  readOnly
                  language={direction === "csv-to-json" ? "json" : "text"}
                  ariaLabel={direction === "csv-to-json" ? "JSON output" : "CSV output"}
                  lint={false}
                />
              </div>
            )
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
            <ul data-testid="csv-json-notes" className="max-h-40 shrink-0 overflow-y-auto border-t border-border-subtle p-2.5 text-xs text-ink-dim">
              {parsed.output.notes.map((n) => (
                <li key={n} className="py-0.5">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
});

export default CsvJsonApp;
