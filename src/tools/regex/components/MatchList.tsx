import { Copy } from "lucide-react";
import type { CaptureGroup, RegexMatch } from "../../../lib/regex";

function GroupRow({ group, onCopy }: { group: CaptureGroup; onCopy: (label: string, text: string) => void }) {
  const label = group.name ? `${group.number} "${group.name}"` : `${group.number}`;
  const matched = group.value !== null;
  return (
    <div data-testid={`regex-group-${group.number}`} data-matched={matched} className="flex items-center gap-2 py-1 pl-4 text-xs">
      <span className="w-24 shrink-0 text-ink-faint">Group {label}</span>
      {matched ? (
        <>
          <span className="flex-1 truncate font-mono text-ink-dim" title={group.value ?? ""}>
            {group.value === "" ? <em className="text-ink-faint">(empty)</em> : group.value}
          </span>
          <span className="shrink-0 text-ink-faint" title="Start–end, JS (UTF-16) string index">
            {group.start}–{group.end}
          </span>
          <button
            type="button"
            onClick={() => onCopy(`group ${label}`, group.value ?? "")}
            className="shrink-0 text-ink-faint hover:text-ink"
            aria-label={`Copy group ${label}`}
          >
            <Copy className="h-3 w-3" strokeWidth={2} />
          </button>
        </>
      ) : (
        <span data-testid={`regex-group-${group.number}-unmatched`} className="flex-1 text-ink-faint italic">
          did not match
        </span>
      )}
    </div>
  );
}

export default function MatchList({
  matches,
  onCopy,
}: {
  matches: RegexMatch[];
  onCopy: (label: string, text: string) => void;
}) {
  if (matches.length === 0) {
    return <p className="p-4 text-center text-sm text-ink-faint">No matches yet.</p>;
  }
  return (
    <div data-testid="regex-match-list" className="h-full min-h-0 flex-1 overflow-auto p-2">
      {matches.map((m, i) => (
        <div key={i} data-testid={`regex-match-${i}`} className="mb-1.5 rounded-lg border border-border-subtle bg-raised/40 p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent">
              Match {i + 1}
            </span>
            <span className="flex-1 truncate font-mono text-ink" title={m.text}>
              {m.text === "" ? <em className="text-ink-faint">(empty match)</em> : m.text}
            </span>
            <span className="shrink-0 text-ink-faint" title="Start–end, JS (UTF-16) string index">
              {m.start}–{m.end} (JS index)
            </span>
            <button
              type="button"
              onClick={() => onCopy(`match ${i + 1}`, m.text)}
              className="shrink-0 text-ink-faint hover:text-ink"
              aria-label={`Copy match ${i + 1}`}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          {m.groups.length > 0 && (
            <div className="mt-1.5 border-t border-border-subtle pt-1.5">
              {m.groups.map((g) => (
                <GroupRow key={g.number} group={g} onCopy={onCopy} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
