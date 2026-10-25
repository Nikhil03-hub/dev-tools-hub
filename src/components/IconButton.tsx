import type { ReactNode } from "react";

/**
 * Icon-only control. `label` is mandatory and becomes both aria-label and the
 * tooltip: an icon alone is never the only carrier of meaning (UX_SPEC §9).
 */
export default function IconButton({
  label,
  icon,
  onClick,
  active = false,
  testId,
  className = "",
  expanded,
  controls,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  testId?: string;
  className?: string;
  /** Set on a disclosure trigger so the collapsed/expanded state is announced. */
  expanded?: boolean;
  /** id of the element this trigger shows or hides. */
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      data-testid={testId}
      className={`focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-ink-dim transition-colors hover:bg-raised hover:text-ink ${
        active ? "bg-raised text-ink" : ""
      } ${className}`}
    >
      {icon}
    </button>
  );
}
