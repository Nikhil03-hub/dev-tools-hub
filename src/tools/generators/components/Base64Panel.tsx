import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Download, Search, Trash2 } from "lucide-react";
import type { Base64Result } from "../../../lib/base64";

type Direction = "encode" | "decode";

export default function Base64Panel({
  direction,
  onDirectionChange,
  input,
  onInputChange,
  urlSafe,
  onUrlSafeChange,
  result,
  onLoadSample,
  onClear,
  onCopyOutput,
  onDownloadOutput,
}: {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  input: string;
  onInputChange: (v: string) => void;
  urlSafe: boolean;
  onUrlSafeChange: (v: boolean) => void;
  result: Base64Result | null;
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
              data-testid="btn-base64-sample"
              onClick={onLoadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Load sample
            </button>
            <button
              type="button"
              data-testid="btn-base64-clear"
              onClick={onClear}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div data-testid="base64-direction-toggle" className="flex items-center gap-1 rounded-lg border border-border-subtle bg-raised/60 p-1">
              <button
                type="button"
                data-testid="base64-direction-encode"
                onClick={() => onDirectionChange("encode")}
                aria-pressed={direction === "encode"}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  direction === "encode" ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
                }`}
              >
                Encode
              </button>
              <button
                type="button"
                data-testid="base64-direction-decode"
                onClick={() => onDirectionChange("decode")}
                aria-pressed={direction === "decode"}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  direction === "decode" ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
                }`}
              >
                Decode
              </button>
            </div>
            {direction === "encode" && (
              <button
                type="button"
                data-testid="base64-url-safe-toggle"
                onClick={() => onUrlSafeChange(!urlSafe)}
                aria-pressed={urlSafe}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  urlSafe ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:text-ink"
                }`}
              >
                URL-safe
              </button>
            )}
            {direction === "decode" && <span className="text-[11px] text-ink-faint">Accepts standard or URL-safe input automatically.</span>}
          </div>

          {isEmpty ? (
            <div data-testid="base64-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              {direction === "encode" ? "Type or paste text to encode" : "Paste Base64 to decode"}
            </div>
          ) : result && !result.ok ? (
            <div data-testid="base64-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result.error}</span>
            </div>
          ) : result?.warning ? (
            <div data-testid="base64-status" data-status="warning" className="flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result.warning}</span>
            </div>
          ) : (
            <div data-testid="base64-status" data-status="valid" className="flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              {direction === "encode" ? "Encoded" : "Decoded"}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <textarea
            data-testid="base64-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            aria-label={direction === "encode" ? "Text to encode" : "Base64 to decode"}
            placeholder={direction === "encode" ? "Type or paste text to encode…" : "Paste Base64 to decode…"}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </section>

      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 border-b border-border-subtle p-2">
          <span className="px-2 py-1.5 text-xs font-medium text-ink-dim">Result</span>
          {result?.ok && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
              <button
                type="button"
                data-testid="btn-copy-base64-output"
                onClick={onCopyOutput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                data-testid="btn-download-base64-output"
                onClick={onDownloadOutput}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {!result?.ok ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">
              {isEmpty ? "The result will appear here." : "Fix the input on the left to see a result here."}
            </div>
          ) : (
            <textarea
              data-testid="base64-output"
              value={result.data}
              readOnly
              aria-label="Result"
              spellCheck={false}
              className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none"
            />
          )}
        </div>
      </section>
    </main>
  );
}
