import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  function run(cmd: Command) {
    onClose();
    cmd.action();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        data-testid="command-palette"
        className="w-full max-w-lg animate-slide-up overflow-hidden rounded-xl border border-border bg-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = filtered[activeIndex];
                if (cmd) run(cmd);
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-faint">No matching actions.</p>}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => run(cmd)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? "bg-accent/15 text-ink" : "text-ink-dim"
              }`}
            >
              <span className="flex-1 truncate">{cmd.label}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">{cmd.group}</span>
              {cmd.shortcut && <kbd className="kbd shrink-0">{cmd.shortcut}</kbd>}
              {i === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
