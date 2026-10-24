import { Download } from "lucide-react";
import { downloadText } from "../lib/clipboard";

export default function DownloadButton({
  filename,
  getText,
  mime = "application/json",
  label = "Download",
  testId,
}: {
  filename: string;
  getText: () => string;
  mime?: string;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void downloadText(filename, getText(), mime)}
      data-testid={testId}
      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 text-[12px] font-medium text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  );
}
