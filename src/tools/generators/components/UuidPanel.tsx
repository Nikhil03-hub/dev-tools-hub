import { Copy, Download, RefreshCw, Trash2 } from "lucide-react";

const COUNT_OPTIONS = [1, 5, 10, 50];

export default function UuidPanel({
  count,
  onCountChange,
  uppercase,
  onUppercaseChange,
  hyphens,
  onHyphensChange,
  results,
  onGenerate,
  onClear,
  onCopyOne,
  onCopyAll,
  onDownloadAll,
}: {
  count: number;
  onCountChange: (n: number) => void;
  uppercase: boolean;
  onUppercaseChange: (v: boolean) => void;
  hyphens: boolean;
  onHyphensChange: (v: boolean) => void;
  results: string[];
  onGenerate: () => void;
  onClear: () => void;
  onCopyOne: (value: string) => void;
  onCopyAll: () => void;
  onDownloadAll: () => void;
}) {
  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-2 lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[30vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-3 p-3">
          <button
            type="button"
            data-testid="btn-uuid-generate"
            onClick={onGenerate}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Generate
          </button>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-dim">How many</p>
            <div data-testid="uuid-count-toggle" className="flex items-center gap-1 self-start rounded-lg border border-border-subtle bg-raised/60 p-1">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid={`uuid-count-${n}`}
                  onClick={() => onCountChange(n)}
                  aria-pressed={count === n}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    count === n ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-dim">Format</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="uuid-format-uppercase"
                onClick={() => onUppercaseChange(!uppercase)}
                aria-pressed={uppercase}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  uppercase ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
                }`}
              >
                Uppercase
              </button>
              <button
                type="button"
                data-testid="uuid-format-hyphens"
                onClick={() => onHyphensChange(!hyphens)}
                aria-pressed={hyphens}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  hyphens ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
                }`}
              >
                Hyphens
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">Changing format re-styles the list on the right — it doesn't generate new values.</p>
          </div>

          <button
            type="button"
            data-testid="btn-uuid-clear"
            onClick={onClear}
            disabled={results.length === 0}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            Clear
          </button>
        </div>
      </section>

      <section className="flex min-h-[30vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 border-b border-border-subtle p-2">
          <span className="px-2 py-1.5 text-xs font-medium text-ink-dim" data-testid="uuid-result-count">
            {results.length === 0 ? "No UUIDs yet" : `${results.length} UUID${results.length === 1 ? "" : "s"}`}
          </span>
          {results.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
              <button
                type="button"
                data-testid="btn-copy-uuid-all"
                onClick={onCopyAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy all
              </button>
              <button
                type="button"
                data-testid="btn-download-uuid-all"
                onClick={onDownloadAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">Click Generate to create some UUIDs.</div>
          ) : (
            <ul data-testid="uuid-results" className="flex flex-col gap-1.5">
              {results.map((value, i) => (
                <li key={`${i}-${value}`} data-testid={`uuid-row-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-raised px-2.5 py-1.5">
                  <span className="truncate font-mono text-[12px] text-ink">{value}</span>
                  <button
                    type="button"
                    data-testid={`btn-copy-uuid-${i}`}
                    onClick={() => onCopyOne(value)}
                    title="Copy"
                    className="shrink-0 rounded-md border border-border bg-surface p-1 text-ink-dim hover:text-ink"
                  >
                    <Copy className="h-3 w-3" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
