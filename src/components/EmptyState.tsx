import type { ReactNode } from "react";

export default function EmptyState({
  icon,
  title,
  hint,
  samples,
}: {
  icon?: ReactNode;
  title: string;
  hint: string;
  samples?: { label: string; onPick: () => void }[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      <p className="max-w-[42ch] text-[13px] text-ink-dim">{hint}</p>
      {samples && samples.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {samples.slice(0, 3).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={s.onPick}
              className="focus-ring rounded-full border border-border bg-raised px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:border-accent/40 hover:text-ink"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
