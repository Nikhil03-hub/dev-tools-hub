import { useState, type MouseEvent } from "react";
import { ChevronRight, ChevronDown, Copy, Link2 } from "lucide-react";
import { typeOf } from "../lib/types";
import { formatJsonPath } from "../lib/path";
import { copyText } from "../../../lib/clipboard";
import { toast } from "../../../lib/toastBus";
import { previewValue as valuePreview } from "../lib/preview";

const PAGE_SIZE = 100;

const PRIMITIVE_COLOR: Record<string, string> = {
  string: "text-lime-300",
  number: "text-amber-300",
  boolean: "text-pink-300",
  null: "text-ink-faint",
};

function TreeNode({
  nodeKey,
  value,
  path,
  depth,
}: {
  nodeKey: string | number | null;
  value: unknown;
  path: string;
  depth: number;
}) {
  const t = typeOf(value);
  const isContainer = t === "object" || t === "array";
  const [open, setOpen] = useState(depth < 2);
  const [showAll, setShowAll] = useState(false);

  async function copyValue(e: MouseEvent) {
    e.stopPropagation();
    await copyText(isContainer ? JSON.stringify(value, null, 2) : JSON.stringify(value));
    toast("Copied value");
  }

  async function copyPath(e: MouseEvent) {
    e.stopPropagation();
    await copyText(path);
    toast(`Copied path ${path}`);
  }

  const entries: [string | number, unknown][] = isContainer
    ? t === "array"
      ? (value as unknown[]).map((v, i): [number, unknown] => [i, v])
      : Object.entries(value as Record<string, unknown>)
    : [];
  const visible = showAll ? entries : entries.slice(0, PAGE_SIZE);

  return (
    <div className="font-mono text-[13px] leading-6">
      <div
        className={`group -mx-1 flex items-center gap-1 rounded px-1 hover:bg-raised ${
          isContainer ? "cursor-pointer" : ""
        }`}
        onClick={() => isContainer && setOpen((o) => !o)}
      >
        {isContainer ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" strokeWidth={2} />
          )
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}
        {nodeKey !== null && (
          <>
            <span className="text-sky-200">{typeof nodeKey === "number" ? `[${nodeKey}]` : nodeKey}</span>
            <span className="text-ink-faint">:</span>
          </>
        )}
        {isContainer ? (
          <span className="text-ink-faint">{valuePreview(value)}</span>
        ) : (
          <span className={PRIMITIVE_COLOR[t] ?? "text-ink"}>{valuePreview(value)}</span>
        )}
        <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button onClick={copyPath} title="Copy path" className="rounded p-1 text-ink-faint hover:bg-surface hover:text-ink">
            <Link2 className="h-3 w-3" strokeWidth={2} />
          </button>
          <button onClick={copyValue} title="Copy value" className="rounded p-1 text-ink-faint hover:bg-surface hover:text-ink">
            <Copy className="h-3 w-3" strokeWidth={2} />
          </button>
        </span>
      </div>
      {isContainer && open && (
        <div className="ml-[7px] border-l border-border-subtle pl-3">
          {entries.length === 0 && <div className="py-0.5 text-xs text-ink-faint">(empty)</div>}
          {visible.map(([k, v]) => (
            <TreeNode key={String(k)} nodeKey={k} value={v} path={formatJsonPath(path, k)} depth={depth + 1} />
          ))}
          {entries.length > PAGE_SIZE && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="py-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              Show {entries.length - PAGE_SIZE} more…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function JsonTree({ value }: { value: unknown }) {
  return (
    <div data-testid="json-tree" className="h-full overflow-auto p-3">
      <TreeNode nodeKey={null} value={value} path="$" depth={0} />
    </div>
  );
}
