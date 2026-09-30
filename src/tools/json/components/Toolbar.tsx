import type { ReactNode } from "react";
import { AlignLeft, Minimize2, Copy, Download, Sparkles, Trash2 } from "lucide-react";

function ToolbarButton({
  onClick,
  icon,
  label,
  shortcut,
  disabled,
  variant = "ghost",
  testId,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  variant?: "ghost" | "accent";
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "accent"
          ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
          : "border-border bg-raised text-ink-dim hover:border-border hover:bg-surface hover:text-ink"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function Toolbar({
  onFormat,
  onMinify,
  onCopy,
  onDownload,
  onLoadSample,
  onClear,
  hasContent,
  isValid,
}: {
  onFormat: () => void;
  onMinify: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onLoadSample: () => void;
  onClear: () => void;
  hasContent: boolean;
  isValid: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ToolbarButton
        onClick={onFormat}
        icon={<AlignLeft className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Format"
        shortcut="⌘⇧F"
        disabled={!hasContent || !isValid}
        variant="accent"
        testId="btn-format"
      />
      <ToolbarButton
        onClick={onMinify}
        icon={<Minimize2 className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Minify"
        shortcut="⌘⇧M"
        disabled={!hasContent || !isValid}
        testId="btn-minify"
      />
      <ToolbarButton
        onClick={onCopy}
        icon={<Copy className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Copy"
        disabled={!hasContent}
        testId="btn-copy"
      />
      <ToolbarButton
        onClick={onDownload}
        icon={<Download className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Download"
        disabled={!hasContent}
        testId="btn-download"
      />
      <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <ToolbarButton
        onClick={onLoadSample}
        icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Load sample"
        testId="btn-load-sample"
      />
      <ToolbarButton
        onClick={onClear}
        icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={2} />}
        label="Clear"
        disabled={!hasContent}
        testId="btn-clear"
      />
    </div>
  );
}
