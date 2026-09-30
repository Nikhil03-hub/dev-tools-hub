import { Copy, Download } from "lucide-react";
import type { ReplacementResult } from "../../../lib/regex";

export default function ReplacePanel({
  replacement,
  onReplacementChange,
  result,
  onCopy,
  onDownload,
}: {
  replacement: string;
  onReplacementChange: (value: string) => void;
  result: ReplacementResult;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-subtle p-3">
        <label className="mb-1.5 block text-xs font-medium text-ink-dim" htmlFor="regex-replacement-input">
          Replacement (supports $1, $&lt;name&gt;, $&amp;)
        </label>
        <input
          id="regex-replacement-input"
          data-testid="regex-replacement-input"
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          placeholder="$1 at $2"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-raised px-3 py-1.5 font-mono text-[13px] text-ink outline-none focus:border-accent/50 placeholder:text-ink-faint"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border-subtle p-2">
        <span data-testid="regex-replace-status" className="px-1 text-xs text-ink-faint">
          {!result.ok ? "Fix the pattern to preview a replacement." : result.changed ? "Preview" : "No matches — output is unchanged."}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="btn-copy-replacement"
            onClick={onCopy}
            disabled={!result.ok}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            Copy
          </button>
          <button
            type="button"
            data-testid="btn-download-replacement"
            onClick={onDownload}
            disabled={!result.ok}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Download
          </button>
        </div>
      </div>

      <pre
        data-testid="regex-replace-output"
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3.5 font-mono text-[13px] leading-6 text-ink"
      >
        {result.ok ? result.output : ""}
      </pre>
    </div>
  );
}
