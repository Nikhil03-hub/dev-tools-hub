import { useMemo, useState } from "react";
import { GitCompare, Eye, EyeOff } from "lucide-react";
import JsonEditor from "../../../components/JsonEditor";
import { parseJsonWithDiagnostics } from "../lib/jsonParse";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { diffJson, type DiffEntry } from "../lib/diff";
import { previewValue } from "../lib/preview";
import { SAMPLE_JSON_MODIFIED } from "../lib/sample";

const KIND_STYLE: Record<DiffEntry["kind"], { rowBg: string; mark: string; label: string }> = {
  added: { rowBg: "bg-ok/[0.06]", mark: "text-ok", label: "+" },
  removed: { rowBg: "bg-err/[0.06]", mark: "text-err", label: "−" },
  changed: { rowBg: "bg-warn/[0.06]", mark: "text-warn", label: "~" },
  unchanged: { rowBg: "", mark: "text-ink-faint", label: " " },
};

export default function DiffView({
  leftText,
  rightText,
  onRightChange,
}: {
  leftText: string;
  rightText: string;
  onRightChange: (v: string) => void;
}) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const debouncedLeft = useDebouncedValue(leftText, 250);
  const debouncedRight = useDebouncedValue(rightText, 250);

  const leftParsed = useMemo(() => parseJsonWithDiagnostics(debouncedLeft), [debouncedLeft]);
  const rightParsed = useMemo(() => parseJsonWithDiagnostics(debouncedRight), [debouncedRight]);

  const result = useMemo(() => {
    if (!leftParsed.ok || !rightParsed.ok) return null;
    return diffJson(leftParsed.value, rightParsed.value);
  }, [leftParsed, rightParsed]);

  const visibleEntries = result ? result.entries.filter((e) => showUnchanged || e.kind !== "unchanged") : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-subtle p-3">
        <p className="mb-2 text-xs font-medium text-ink-dim">
          Comparing the main editor (left) against this JSON:
        </p>
        <div data-testid="diff-right-editor" className="h-40 overflow-hidden rounded-lg border border-border">
          <JsonEditor
            value={rightText}
            onChange={onRightChange}
            ariaLabel="JSON to compare against"
            allowDrop
            minHeight="160px"
            placeholder="Paste or drop the JSON you want to compare against…"
          />
        </div>
        {rightText.trim() === "" && (
          <button
            className="mt-2 text-xs font-medium text-accent hover:text-accent-hover"
            onClick={() => onRightChange(JSON.stringify(SAMPLE_JSON_MODIFIED, null, 2))}
          >
            Load an example to compare
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {(!leftParsed.ok || !rightParsed.ok) && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-faint">
            <GitCompare className="h-6 w-6" strokeWidth={1.5} />
            <p>
              {!leftParsed.ok && "Fix the JSON error in the main editor"}
              {!leftParsed.ok && !rightParsed.ok && " and "}
              {!rightParsed.ok && "paste valid JSON above"}
              {" "}
              to see a diff.
            </p>
          </div>
        )}

        {result && (
          <div data-testid="diff-result">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip color="ok" count={result.summary.added} label="added" />
              <Chip color="err" count={result.summary.removed} label="removed" />
              <Chip color="warn" count={result.summary.changed} label="changed" />
              <button
                onClick={() => setShowUnchanged((v) => !v)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
              >
                {showUnchanged ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showUnchanged ? "Hide" : "Show"} {result.summary.unchanged} unchanged
              </button>
            </div>

            {result.summary.added + result.summary.removed + result.summary.changed === 0 && (
              <p className="text-sm text-ink-dim">These two documents are identical.</p>
            )}

            <div className="space-y-0.5 font-mono text-[12.5px]">
              {visibleEntries.map((e, i) => {
                const style = KIND_STYLE[e.kind];
                return (
                  <div
                    key={`${e.path}-${i}`}
                    className={`flex items-start gap-2 rounded px-2 py-1 ${style.rowBg}`}
                    style={{ paddingLeft: `${8 + Math.min(e.depth, 10) * 10}px` }}
                  >
                    <span className={`w-3 shrink-0 select-none font-bold ${style.mark}`}>{style.label}</span>
                    <span className="shrink-0 text-ink-dim">{e.path}</span>
                    {e.kind === "changed" ? (
                      <span className="min-w-0 truncate">
                        <span className="text-err/80 line-through decoration-err/50">{previewValue(e.oldValue)}</span>
                        <span className="mx-1.5 text-ink-faint">→</span>
                        <span className="text-ok">{previewValue(e.newValue)}</span>
                      </span>
                    ) : e.kind === "added" ? (
                      <span className="min-w-0 truncate text-ok">{previewValue(e.newValue)}</span>
                    ) : e.kind === "removed" ? (
                      <span className="min-w-0 truncate text-err">{previewValue(e.oldValue)}</span>
                    ) : (
                      <span className="min-w-0 truncate text-ink-faint">{previewValue(e.oldValue)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, count, label }: { color: "ok" | "err" | "warn"; count: number; label: string }) {
  const styles = {
    ok: "border-ok/30 bg-ok/10 text-ok",
    err: "border-err/30 bg-err/10 text-err",
    warn: "border-warn/30 bg-warn/10 text-warn",
  } as const;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${styles[color]}`}>
      {count} {label}
    </span>
  );
}
