import { useEffect, useRef, type ReactNode } from "react";

/**
 * Full-height navigation drawer for <768px. Mounted only while open, so there is
 * never a second copy of the tool links in the DOM. Escape and the scrim close
 * it, Tab is trapped inside, and focus returns to whatever opened it.
 */
export default function MobileDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);

    const timer = window.setTimeout(() => focusables()[0]?.focus(), 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] md:hidden">
      <div
        className="absolute inset-0 bg-canvas/70"
        onClick={onClose}
        data-testid="drawer-scrim"
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        data-testid="mobile-drawer"
        className="relative h-full w-[264px] max-w-[80vw] overflow-y-auto border-r border-border bg-canvas shadow-pop"
      >
        {children}
      </div>
    </div>
  );
}
