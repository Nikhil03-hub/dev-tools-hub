import type { Preset } from "../../../lib/timestamp";

// A flat row of fixed, deterministic jump-points (today, this week, the
// epoch itself, …). Deliberately not a dropdown — there are only six of
// them, and buttons make every option visible without an extra click.
//
// `selectedId` marks whichever preset last produced the value currently
// shown, so clicking one gives lasting feedback rather than a highlight
// that flashes and vanishes — the same chip-active language already used
// for the flag toggles elsewhere in this hub. It's cleared (by the caller)
// the moment anything else could make the value no longer match that
// preset: editing a field by hand, or changing the epoch unit.
export default function PresetButtons({
  presets,
  selectedId,
  onApply,
}: {
  presets: Preset[];
  selectedId: string | null;
  onApply: (preset: Preset) => void;
}) {
  return (
    <div data-testid="timestamp-presets" className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`timestamp-preset-${p.id}`}
            onClick={() => onApply(p)}
            aria-pressed={active}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              active ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-raised text-ink-dim hover:border-accent/40 hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
