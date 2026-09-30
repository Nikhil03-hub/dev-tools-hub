import { useState } from "react";
import { Plus, Search } from "lucide-react";

// Add-only: removing a pinned zone happens per-row in TimezoneResultList,
// right next to the value it removes, rather than duplicating that control
// here. Capped at 8 results — this is a quick jump-to-a-zone search, not a
// full directory browser, and IANA zone names contain a "/" (e.g.
// "America/New_York") which is a perfectly safe, literal character in an
// HTML attribute value, so it's used as-is in data-testid rather than
// slugified.
export default function TimezonePicker({
  allZones,
  pinnedZones,
  onAdd,
}: {
  allZones: string[];
  pinnedZones: string[];
  onAdd: (zone: string) => void;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const results = q === "" ? [] : allZones.filter((z) => !pinnedZones.includes(z) && z.toLowerCase().includes(q)).slice(0, 8);
  const hasAnyMatch = q !== "" && allZones.some((z) => z.toLowerCase().includes(q));

  function add(zone: string) {
    onAdd(zone);
    setQuery("");
  }

  return (
    <div className="border-t border-border-subtle p-3">
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-dim" htmlFor="timestamp-zone-search">
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add a timezone
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" strokeWidth={2} />
        <input
          id="timestamp-zone-search"
          data-testid="timestamp-zone-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search IANA zones, e.g. Tokyo, Paris…"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-raised py-1.5 pl-8 pr-3 text-xs text-ink outline-none focus:border-accent/50 placeholder:text-ink-faint"
        />
      </div>
      {results.length > 0 && (
        <ul data-testid="timestamp-zone-results" className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-border-subtle bg-raised">
          {results.map((zone) => (
            <li key={zone}>
              <button
                type="button"
                data-testid={`timestamp-zone-option-${zone}`}
                onClick={() => add(zone)}
                className="block w-full truncate px-3 py-1.5 text-left text-xs text-ink-dim hover:bg-surface hover:text-ink"
              >
                {zone}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q !== "" && results.length === 0 && (
        <p className="mt-1.5 text-xs text-ink-faint">{hasAnyMatch ? "Already added." : "No matching timezone."}</p>
      )}
    </div>
  );
}
