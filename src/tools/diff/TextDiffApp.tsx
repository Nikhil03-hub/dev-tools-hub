import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { AlertCircle, ArrowLeftRight, CheckCircle2, Copy, Download, Sparkles, Trash2 } from "lucide-react";
import Segmented from "../../components/Segmented";
import Toggle from "../../components/Toggle";
import { copyAndNotify } from "../../components/CopyButton";
import type { Command } from "../../components/CommandPalette";
import type { ResultError } from "../../core/result";
import { computeDiff, unifiedPatch, hasChanges, type DiffMode, type DiffPart, type DiffResult } from "../../core/diff/diff";
import type { ToolHandle } from "../../lib/toolHandle";
import type { ToolProps } from "../../registry/types";
import { downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const SAMPLE_A = `line 1
line 2
line 3
shared tail
`;

const SAMPLE_B = `line 1
line two
line 3
shared tail
line 5
`;

/** Above this the tool stops recomputing on every keystroke (P2 shared rule). */
const MANUAL_THRESHOLD = 1_000_000;

/**
 * The spec promises tens of thousands of lines in line mode, and the engine
 * delivers that — but a DOM row per line does not. Past this many rows the view
 * says what it stopped at instead of taking the tab down with it.
 */
const MAX_ROWS = 2_000;

type View = "split" | "inline";

const MODE_UNIT: Record<DiffMode, string> = { line: "lines", word: "words", char: "characters" };

const PART_CLASS: Record<DiffPart["kind"], string> = {
  same: "text-ink-dim",
  added: "bg-ok/15 text-ink",
  removed: "bg-err/15 text-ink",
};

interface Cell {
  text: string;
  kind: DiffPart["kind"];
  num: number;
}

interface Row {
  left: Cell | null;
  right: Cell | null;
}

function partLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Line-mode side-by-side: same lines pair up, additions and deletions get a blank opposite. */
function alignRows(parts: DiffPart[]): Row[] {
  const rows: Row[] = [];
  let leftNum = 1;
  let rightNum = 1;
  for (const part of parts) {
    const lines = partLines(part.value);
    if (part.kind === "same") {
      lines.forEach((text) => {
        rows.push({ left: { text, kind: "same", num: leftNum++ }, right: { text, kind: "same", num: rightNum++ } });
      });
    } else if (part.kind === "removed") {
      lines.forEach((text) => {
        rows.push({ left: { text, kind: "removed", num: leftNum++ }, right: null });
      });
    } else {
      lines.forEach((text) => {
        rows.push({ left: null, right: { text, kind: "added", num: rightNum++ } });
      });
    }
  }
  return rows;
}

type Parsed = { ok: true; result: DiffResult } | { ok: false; error: ResultError };

const TextDiffApp = forwardRef<ToolHandle, ToolProps>(function TextDiffApp(_props, ref) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mode, setMode] = useState<DiffMode>("line");
  const [view, setView] = useState<View>("split");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  // The pair the Convert button committed while the input was oversized.
  const [committed, setCommitted] = useState<{ a: string; b: string } | null>(null);

  const isEmpty = a.trim() === "" && b.trim() === "";
  const manual = a.length + b.length > MANUAL_THRESHOLD;
  const debouncedA = useDebouncedValue(a, 150);
  const debouncedB = useDebouncedValue(b, 150);
  // null means "not run yet": in manual mode nothing is diffed until Compare.
  const activeA = manual ? (committed ? committed.a : null) : debouncedA;
  const activeB = manual ? (committed ? committed.b : null) : debouncedB;
  const isStale = manual && committed !== null && (committed.a !== a || committed.b !== b);

  const parsed: Parsed | null = useMemo(() => {
    if (activeA === null || activeB === null) return null;
    if (activeA === "" && activeB === "") return null;
    const r = computeDiff(activeA, activeB, { mode, ignoreWhitespace, ignoreCase });
    return r.ok ? { ok: true, result: r.value } : { ok: false, error: r.error };
  }, [activeA, activeB, mode, ignoreWhitespace, ignoreCase]);

  const rows = useMemo(() => (parsed?.ok && mode === "line" ? alignRows(parsed.result.parts) : null), [parsed, mode]);

  // Built on demand rather than in a memo keyed on the live text: the diff is
  // debounced, and a patch recomputed on every keystroke would quietly undo that.
  // It is generated from the same pair that is on screen, so it always matches
  // what the user is being shown.
  function currentPatch(): string | null {
    if (!parsed?.ok || activeA === null || activeB === null) return null;
    return unifiedPatch(activeA, activeB);
  }

  function clear() {
    setA("");
    setB("");
    setCommitted(null);
    toast("Cleared");
  }

  function loadSample() {
    setA(SAMPLE_A);
    setB(SAMPLE_B);
    setCommitted(null);
    toast("Loaded sample texts");
  }

  function swap() {
    setA(b);
    setB(a);
    setCommitted(null);
    toast("Swapped the two sides");
  }

  const copyPatch = useCallback(async () => {
    if (!parsed?.ok) {
      toast("Nothing to copy yet");
      return;
    }
    if (!hasChanges(parsed.result)) {
      await copyAndNotify("", "The two texts are identical");
      return;
    }
    const patch = currentPatch();
    if (patch === null) return;
    await copyAndNotify(patch, "Copied the patch");
  }, [parsed]);

  async function downloadPatch() {
    if (!parsed?.ok || !hasChanges(parsed.result)) {
      toast("Nothing to download yet");
      return;
    }
    const patch = currentPatch();
    if (patch === null) return;
    await downloadText("changes.patch", patch, "text/plain");
    toast("Downloaded changes.patch");
  }

  const commands: Command[] = [
    { id: "text-diff-sample", label: "Load sample texts", group: "Text Diff", action: loadSample },
    { id: "text-diff-clear", label: "Clear both texts", group: "Text Diff", action: clear },
    ...(parsed?.ok ? [{ id: "text-diff-copy", label: "Copy output", group: "Text Diff", action: copyPatch }] : []),
    { id: "text-diff-swap", label: "Swap left and right", group: "Text Diff", action: swap },
    { id: "text-diff-mode-line", label: "Compare by lines", group: "Text Diff", action: () => setMode("line") },
    { id: "text-diff-mode-word", label: "Compare by words", group: "Text Diff", action: () => setMode("word") },
    { id: "text-diff-mode-char", label: "Compare by characters", group: "Text Diff", action: () => setMode("char") },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  const stats = parsed?.ok
    ? `+${parsed.result.added} −${parsed.result.removed} ${MODE_UNIT[mode]}`
    : "";

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:gap-3 lg:overflow-hidden lg:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-2.5">
        <Segmented
          label="Compare granularity"
          value={mode}
          onChange={setMode}
          options={[
            { id: "line", label: "Lines" },
            { id: "word", label: "Words" },
            { id: "char", label: "Characters" },
          ]}
        />
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { id: "split", label: "Side by side" },
            { id: "inline", label: "Inline" },
          ]}
        />
        <div className="flex items-center gap-3">
          <Toggle checked={ignoreWhitespace} onChange={setIgnoreWhitespace} label="Ignore whitespace" />
          <Toggle checked={ignoreCase} onChange={setIgnoreCase} label="Ignore case" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="btn-text-diff-sample"
            onClick={loadSample}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Load sample</span>
            <span className="sm:hidden">Sample</span>
          </button>
          <button
            type="button"
            data-testid="btn-text-diff-swap"
            onClick={swap}
            disabled={isEmpty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} />
            Swap
          </button>
          <button
            type="button"
            data-testid="btn-text-diff-clear"
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
              data-testid="text-diff-run"
              onClick={() => setCommitted({ a, b })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-warn"
            >
              {isStale ? "Compare again" : "Compare"} {Math.round((a.length + b.length) / 1000)}k chars
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section className="flex min-h-[26vh] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
          <label htmlFor="text-diff-a" className="border-b border-border-subtle px-3 py-2 text-xs font-medium text-ink-dim">
            Original
          </label>
          <textarea
            id="text-diff-a"
            data-testid="text-diff-a"
            value={a}
            onChange={(e) => setA(e.target.value)}
            aria-label="Original text"
            placeholder="Paste the original text…"
            spellCheck={false}
            className="min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
          />
        </section>
        <section className="flex min-h-[26vh] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
          <label htmlFor="text-diff-b" className="border-b border-border-subtle px-3 py-2 text-xs font-medium text-ink-dim">
            Changed
          </label>
          <textarea
            id="text-diff-b"
            data-testid="text-diff-b"
            value={b}
            onChange={(e) => setB(e.target.value)}
            aria-label="Changed text"
            placeholder="Paste the changed text…"
            spellCheck={false}
            className="min-h-0 w-full flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-6 text-ink placeholder:text-ink-faint"
          />
        </section>
      </div>

      <section className="flex min-h-[30vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle p-2">
          <div className="flex flex-wrap items-center gap-2">
            {isEmpty ? (
              <span data-testid="text-diff-status" data-status="empty" className="text-xs text-ink-faint">
                Paste text on either side to see the differences
              </span>
            ) : parsed?.ok ? (
              <>
                <span data-testid="text-diff-status" data-status="valid" className="inline-flex items-center gap-1.5 text-xs font-medium text-ok">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                  {hasChanges(parsed.result) ? "Differences found" : "The two texts are identical"}
                </span>
                <span data-testid="text-diff-stats" className="rounded-full border border-border bg-raised px-2 py-0.5 font-mono text-[11px] text-ink-dim">
                  {stats}
                </span>
              </>
            ) : parsed ? (
              <span data-testid="text-diff-status" data-status="invalid" className="inline-flex items-start gap-1.5 text-xs text-err">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
                {parsed.error.message}
              </span>
            ) : (
              <span data-testid="text-diff-status" data-status="idle" className="text-xs text-ink-faint">
                These texts total over {MANUAL_THRESHOLD.toLocaleString("en-US")} characters, so nothing compares until you press Compare.
              </span>
            )}
            {isStale && (
              <span data-testid="text-diff-stale" className="text-xs text-warn">
                The text changed after the last run — press Compare to update.
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="text-diff-copy"
              onClick={copyPatch}
              disabled={!parsed?.ok}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy patch
            </button>
            <button
              type="button"
              data-testid="text-diff-download"
              onClick={downloadPatch}
              disabled={!parsed?.ok || !hasChanges(parsed.result)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              .patch
            </button>
          </div>
        </div>

        <div data-testid="text-diff-output" className="min-h-0 flex-1 overflow-auto">
          {!parsed?.ok ? (
            <p className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">
              {isEmpty
                ? "Nothing here yet — paste text on either side, or load the sample."
                : manual
                  ? "Press Compare to diff these texts."
                  : "The result will appear here."}
            </p>
          ) : mode === "line" && view === "split" ? (
            <SplitView rows={rows ?? []} totalRows={rows?.length ?? 0} />
          ) : (
            <InlineView parts={parsed.result.parts} strike={view === "inline"} />
          )}
        </div>
      </section>
    </main>
  );
});

function SplitView({ rows, totalRows }: { rows: Row[]; totalRows: number }) {
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div className="grid min-h-full grid-cols-2 font-mono text-[12.5px] leading-[20px]">
      <div className="border-r border-border-subtle">
        <table className="w-full border-collapse">
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                <td className="w-9 select-none border-r border-border-subtle px-1.5 text-right text-ink-faint tabular-nums">
                  {row.left?.num ?? ""}
                </td>
                <td className={`w-full whitespace-pre-wrap break-words px-2 ${row.left ? PART_CLASS[row.left.kind] : "bg-raised/40"}`}>
                  {row.left?.text ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <table className="w-full border-collapse">
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                <td className="w-9 select-none border-r border-border-subtle px-1.5 text-right text-ink-faint tabular-nums">
                  {row.right?.num ?? ""}
                </td>
                <td className={`w-full whitespace-pre-wrap break-words px-2 ${row.right ? PART_CLASS[row.right.kind] : "bg-raised/40"}`}>
                  {row.right?.text ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalRows > shown.length && (
        <p className="col-span-2 border-t border-border-subtle p-2.5 text-[12px] text-ink-dim">
          Showing the first {shown.length.toLocaleString("en-US")} of {totalRows.toLocaleString("en-US")} rows. Download the .patch for
          all of it.
        </p>
      )}
    </div>
  );
}

function InlineView({ parts, strike }: { parts: DiffPart[]; strike: boolean }) {
  return (
    <pre className="min-h-full whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-[20px]">
      {parts.map((part, i) => (
        <span
          key={i}
          className={`${PART_CLASS[part.kind]} ${part.kind === "removed" && strike ? "line-through decoration-err/70" : ""}`}
        >
          {part.value}
        </span>
      ))}
    </pre>
  );
}

export default TextDiffApp;
