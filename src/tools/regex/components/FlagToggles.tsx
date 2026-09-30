import type { UiFlags } from "../../../lib/regex";

// "All matches" vs "First match" is a deliberate abstraction over the raw
// `g` flag rather than a checkbox for it — see lib/regex.ts's module
// notes. i/m/s stay as independent, self-explanatory toggles since none
// of them carry the same footgun.
export default function FlagToggles({ flags, onChange }: { flags: UiFlags; onChange: (next: UiFlags) => void }) {
  function toggle(key: "caseInsensitive" | "multiline" | "dotAll") {
    onChange({ ...flags, [key]: !flags[key] });
  }

  const CHIPS: { key: "caseInsensitive" | "multiline" | "dotAll"; label: string; testId: string }[] = [
    { key: "caseInsensitive", label: "Case-insensitive", testId: "regex-flag-i" },
    { key: "multiline", label: "Multiline", testId: "regex-flag-m" },
    { key: "dotAll", label: "Dot matches newline", testId: "regex-flag-s" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div
        data-testid="regex-match-mode"
        className="flex items-center gap-1 rounded-lg border border-border-subtle bg-raised/60 p-1"
      >
        <button
          type="button"
          data-testid="regex-mode-all"
          onClick={() => onChange({ ...flags, allMatches: true })}
          aria-pressed={flags.allMatches}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            flags.allMatches ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
          }`}
        >
          All matches
        </button>
        <button
          type="button"
          data-testid="regex-mode-first"
          onClick={() => onChange({ ...flags, allMatches: false })}
          aria-pressed={!flags.allMatches}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            !flags.allMatches ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
          }`}
        >
          First match
        </button>
      </div>

      {CHIPS.map((f) => (
        <button
          key={f.key}
          type="button"
          data-testid={f.testId}
          onClick={() => toggle(f.key)}
          aria-pressed={flags[f.key]}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            flags[f.key]
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-raised text-ink-dim hover:text-ink"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
