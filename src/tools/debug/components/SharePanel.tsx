import { Copy, Download } from "lucide-react";
import type { ReportFormat } from "../../../lib/debugkit/report";

const FORMATS: { id: ReportFormat; label: string }[] = [
  { id: "ai", label: "AI chat" },
  { id: "issue", label: "GitHub issue" },
  { id: "plain", label: "Support ticket" },
];

export default function SharePanel({
  format,
  onFormat,
  text,
  onCopy,
  onDownload,
  onFakeDoor,
}: {
  format: ReportFormat;
  onFormat: (f: ReportFormat) => void;
  text: string;
  onCopy: () => void;
  onDownload: () => void;
  onFakeDoor: (which: "cli" | "team") => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-1 self-start rounded-lg border border-border-subtle bg-raised/60 p-1">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid={`debug-share-format-${f.id}`}
            aria-pressed={format === f.id}
            onClick={() => onFormat(f.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              format === f.id ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <pre
        data-testid="debug-share-preview"
        className="max-h-[50vh] min-h-[10rem] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border-subtle bg-canvas/60 p-3 font-mono text-[12px] leading-5 text-ink-dim"
      >
        {text}
      </pre>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="btn-debug-copy-report"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          Copy report
        </button>
        <button
          type="button"
          data-testid="btn-debug-download-report"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:bg-surface hover:text-ink"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Download .md
        </button>
      </div>
      <p className="text-xs text-ink-faint">Replace the [Describe …] line with what you were doing — it helps whoever reads it.</p>

      <div data-testid="debug-fakedoor" className="rounded-lg border border-dashed border-border-subtle bg-raised/30 p-3">
        <p className="text-xs text-ink-dim">Not built yet — we're checking if people want these:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="btn-fakedoor-cli"
            onClick={() => onFakeDoor("cli")}
            className="rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink"
          >
            Run this in your terminal &amp; CI →
          </button>
          <button
            type="button"
            data-testid="btn-fakedoor-team"
            onClick={() => onFakeDoor("team")}
            className="rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:text-ink"
          >
            Shared redaction rules for your team →
          </button>
        </div>
      </div>
    </div>
  );
}
