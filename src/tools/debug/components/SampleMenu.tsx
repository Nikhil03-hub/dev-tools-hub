import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { DEBUG_SAMPLES, type DebugSample } from "../../../lib/debugkit/samples";

export default function SampleMenu({ onPick }: { onPick: (s: DebugSample) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        data-testid="btn-debug-sample"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">Load sample</span>
        <span className="sm:hidden">Sample</span>
      </button>
      {open && (
        <div
          role="menu"
          data-testid="debug-sample-menu"
          className="absolute left-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] animate-slide-up rounded-xl border border-border bg-raised p-2 text-sm shadow-pop"
        >
          {DEBUG_SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              data-testid={`debug-sample-option-${s.id}`}
              onClick={() => {
                setOpen(false);
                onPick(s);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface"
            >
              <span className="block font-medium text-ink">{s.label}</span>
              <span className="block text-xs text-ink-dim">{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
