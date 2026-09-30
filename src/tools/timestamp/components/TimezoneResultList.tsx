import { Copy } from "lucide-react";
import type { TimezoneRow } from "../../../lib/timestamp";

// The DISPLAY half of the INTERPRET-vs-DISPLAY split: each row is the same
// underlying instant, independently formatted in its own zone. Nothing
// here ever feeds back into parsing — that's deliberate, so there's no way
// for "how it's shown" to quietly change "what it is."
export default function TimezoneResultList({
  rows,
  pinnedZones,
  onCopy,
  onRemove,
}: {
  rows: TimezoneRow[];
  pinnedZones: string[];
  onCopy: (label: string, value: string) => void;
  onRemove: (zone: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="p-4 text-center text-sm text-ink-faint">No timezones selected — add one below.</p>;
  }

  return (
    <ul data-testid="timestamp-zone-rows" className="divide-y divide-border-subtle">
      {rows.map((row) => (
        <li key={row.zone} data-testid={`timestamp-zone-row-${row.zone}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.label}</p>
            <p data-testid={`timestamp-zone-datetime-${row.zone}`} className="truncate font-mono text-[13px] text-ink-dim">
              {row.dateTime}
            </p>
            <p className="text-[11px] text-ink-faint">
              {row.utcOffset} · {row.relative}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid={`btn-copy-zone-${row.zone}`}
              onClick={() => onCopy(row.label, row.dateTime)}
              title={`Copy ${row.label}`}
              className="rounded-lg border border-border bg-raised p-1.5 text-ink-dim hover:text-ink"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            {pinnedZones.length > 1 && (
              <button
                type="button"
                data-testid={`btn-remove-zone-${row.zone}`}
                onClick={() => onRemove(row.zone)}
                title={`Remove ${row.label}`}
                className="rounded-lg border border-border bg-raised px-2 py-1.5 text-[11px] font-medium text-ink-dim hover:border-err/40 hover:text-err"
              >
                Remove
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
