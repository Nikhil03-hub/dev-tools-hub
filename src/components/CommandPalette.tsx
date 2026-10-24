import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { rankItems, type SearchItem } from "../core/search/fuzzy";

export interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  action: () => void;
}

// Display order when the query is empty. Anything with an unknown group is
// appended after these, so a new tool's commands never disappear.
const GROUP_ORDER = ["Recent", "Tools", "Actions", "General"];

function orderGroups(groups: string[]): string[] {
  const known = GROUP_ORDER.filter((g) => groups.includes(g));
  const extra = groups.filter((g) => !GROUP_ORDER.includes(g));
  return [...known, ...extra];
}

export default function CommandPalette({
  open,
  onClose,
  commands,
  recentIds = [],
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  recentIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items: (Command & SearchItem)[] = useMemo(
    () => commands.map((c) => ({ ...c, text: c.label, keywords: [c.group] })),
    [commands]
  );

  // One flat list drives both rendering and keyboard navigation; when the query
  // is empty it is group-ordered, otherwise it is score-ordered.
  const visible: (Command & SearchItem)[] = useMemo(() => {
    if (query.trim()) return rankItems(query, items, recentIds);
    const byGroup = new Map<string, (Command & SearchItem)[]>();
    for (const c of items) {
      const list = byGroup.get(c.group) ?? [];
      list.push(c);
      byGroup.set(c.group, list);
    }
    return orderGroups([...byGroup.keys()]).flatMap((g) => byGroup.get(g) ?? []);
  }, [items, query, recentIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  function run(cmd: Command) {
    onClose();
    cmd.action();
  }

  const showHeaders = !query.trim();
  let renderIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-canvas/70 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        data-testid="command-palette"
        className="w-full max-w-lg animate-slide-up overflow-hidden rounded-xl border border-border bg-raised shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools and commands…"
            aria-label="Search tools and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={visible[activeIndex] ? `palette-option-${visible[activeIndex].id}` : undefined}
            className="focus-ring w-full rounded bg-transparent text-sm text-ink placeholder:text-ink-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                // Enter always runs the first row unless the user has moved with
                // the arrow keys; the index resets to 0 on every query change.
                const cmd = visible[activeIndex] ?? visible[0];
                if (cmd) run(cmd);
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1.5">
          {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-faint">No matching actions.</p>}

          {visible.map((cmd) => {
            renderIndex += 1;
            const index = renderIndex;
            const previous = index > 0 ? visible[index - 1] : undefined;
            const header = showHeaders && (!previous || previous.group !== cmd.group) ? cmd.group : null;
            const active = index === activeIndex;
            return (
              <div key={cmd.id}>
                {header && (
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{header}</p>
                )}
                <button
                  type="button"
                  id={`palette-option-${cmd.id}`}
                  role="option"
                  aria-selected={active}
                  data-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(cmd)}
                  className={`focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-accent-soft text-ink" : "text-ink-dim"
                  }`}
                >
                  <span className="flex-1 truncate">{cmd.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">{cmd.group}</span>
                  {cmd.shortcut && <kbd className="kbd shrink-0">{cmd.shortcut}</kbd>}
                  {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
