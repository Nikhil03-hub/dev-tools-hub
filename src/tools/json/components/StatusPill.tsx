import { AlertCircle, CheckCircle2, FileJson } from "lucide-react";
import type { JsonSyntaxError } from "../lib/jsonParse";
import { formatBytes } from "../lib/format";

export interface StatusMeta {
  bytes: number;
  nodes: number;
  depth: number;
}

export default function StatusPill({
  isEmpty,
  error,
  meta,
}: {
  isEmpty: boolean;
  error: JsonSyntaxError | null;
  meta: StatusMeta | null;
}) {
  if (isEmpty) {
    return (
      <div data-testid="status-pill" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
        <FileJson className="h-3.5 w-3.5" strokeWidth={2} />
        Paste, type, or drop a .json file to begin
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="status-pill" data-status="invalid" className="flex min-w-0 items-center gap-1.5 text-xs text-err">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span className="shrink-0 font-medium">
          Line {error.line}, Col {error.column}:
        </span>
        <span className="truncate text-err/90">{error.message}</span>
      </div>
    );
  }

  return (
    <div data-testid="status-pill" data-status="valid" className="flex items-center gap-3 text-xs text-ink-dim">
      <span className="flex items-center gap-1.5 font-medium text-ok">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
        Valid JSON
      </span>
      {meta && (
        <span className="hidden items-center gap-2 text-ink-faint sm:flex">
          <span>{formatBytes(meta.bytes)}</span>
          <span>·</span>
          <span>{meta.nodes.toLocaleString()} nodes</span>
          <span>·</span>
          <span>depth {meta.depth}</span>
        </span>
      )}
    </div>
  );
}
