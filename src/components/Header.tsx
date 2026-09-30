import { Braces, Command } from "lucide-react";
import PrivacyBadge from "./PrivacyBadge";

export interface HubTool {
  id: string;
  label: string;
  shortLabel: string;
}

export default function Header({
  tools,
  activeTool,
  onSelectTool,
  onOpenPalette,
}: {
  tools: HubTool[];
  activeTool: string;
  onSelectTool: (id: string) => void;
  onOpenPalette: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle bg-canvas/80 px-4 py-3 backdrop-blur sm:gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Braces className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <h1 className="whitespace-nowrap text-sm font-semibold text-ink">Dev Tools Hub</h1>
      </div>

      <nav
        data-testid="tool-switcher"
        aria-label="Tools"
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border-subtle bg-raised/60 p-1"
      >
        {tools.map((tool) => {
          const active = tool.id === activeTool;
          return (
            <button
              key={tool.id}
              type="button"
              data-testid={`tool-tab-${tool.id}`}
              onClick={() => onSelectTool(tool.id)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              <span className="hidden sm:inline">{tool.label}</span>
              <span className="sm:hidden">{tool.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          data-testid="btn-open-palette"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-full border border-border bg-raised px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Command className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">Commands</span>
          <kbd className="kbd hidden sm:inline-flex">⌘K</kbd>
        </button>
        <PrivacyBadge />
      </div>
    </header>
  );
}
