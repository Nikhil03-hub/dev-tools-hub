import { useRef, useState, type ReactNode } from "react";

/**
 * Hover/focus tooltip with a 400 ms delay. Deliberately never the only carrier
 * of meaning: the trigger must already have an accessible name, and the label
 * here is supplementary.
 */
export default function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  function show() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 400);
  }

  function hide() {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-raised px-1.5 py-0.5 text-[11px] text-ink shadow-pop"
        >
          {label}
        </span>
      )}
    </span>
  );
}
