import { AlertCircle, CheckCircle2, Copy, Download, Loader2, Search, Trash2 } from "lucide-react";
import { HASH_ALGORITHMS, type HashAlgorithm, type HashResult } from "../../../lib/hash";

export default function HashPanel({
  input,
  onInputChange,
  algorithm,
  onAlgorithmChange,
  result,
  computing,
  onLoadSample,
  onClear,
  onCopyOutput,
  onDownloadOutput,
}: {
  input: string;
  onInputChange: (v: string) => void;
  algorithm: HashAlgorithm;
  onAlgorithmChange: (a: HashAlgorithm) => void;
  result: HashResult | null;
  computing: boolean;
  onLoadSample: () => void;
  onClear: () => void;
  onCopyOutput: () => void;
  onDownloadOutput: () => void;
}) {
  const isEmpty = input.trim() === "";

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-2 lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-hash-sample"
              onClick={onLoadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Load sample
            </button>
            <button
              type="button"
              data-testid="btn-hash-clear"
              onClick={onClear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-dim">Algorithm</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {HASH_ALGORITHMS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-testid={`hash-algorithm-${a.id}`}
                  onClick={() => onAlgorithmChange(a.id)}
                  aria-pressed={algorithm === a.id}
                  title={a.caution}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    algorithm === a.id ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
                  }`}
                >
                  {a.label}
                  {a.caution && <span className="ml-1 text-[10px] font-normal text-warn">({a.caution})</span>}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              None of these are appropriate for hashing passwords — use a dedicated, deliberately-slow algorithm (bcrypt, scrypt, Argon2) for that.
            </p>
          </div>

          {isEmpty ? (
            <div data-testid="hash-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              Type or paste text to hash
            </div>
          ) : computing ? (
            <div data-testid="hash-status" data-status="computing" className="flex items-center gap-1.5 text-xs text-ink-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Hashing…
            </div>
          ) : result && !result.ok ? (
            <div data-testid="hash-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result.error}</span>
            </div>
          ) : result?.ok ? (
            <div data-testid="hash-status" data-status="valid" className="flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              {algorithm} digest ({result.data.length / 2} bytes)
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          <textarea
            data-testid="hash-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label="Text to hash"
            placeholder="Type or paste text to hash…"
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </section>

      <section className="flex min-h-[30vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 border-b border-border-subtle p-2">
          <span className="px-2 py-1.5 text-xs font-medium text-ink-dim">Digest</span>
          {result?.ok && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
              <button
                type="button"
                data-testid="btn-copy-hash-output"
                onClick={onCopyOutput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                data-testid="btn-download-hash-output"
                onClick={onDownloadOutput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 p-3">
          {!result?.ok ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">
              {isEmpty ? "The digest will appear here." : computing ? "Computing…" : "Fix the input on the left to see a digest here."}
            </div>
          ) : (
            <p data-testid="hash-output" className="break-all rounded-lg border border-border bg-raised p-3 font-mono text-[13px] leading-6 text-ink">
              {result.data}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
