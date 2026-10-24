import { useState } from "react";
import { Braces, Command, Monitor, Moon, Sun } from "lucide-react";
import PrivacyBadge from "./PrivacyBadge";
import { getThemePref, nextThemePref, setThemePref, type ThemePref } from "../shell/theme";
import { TOOLS } from "../registry/tools";

const THEME_ICON: Record<ThemePref, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

// This top-tab header is temporary: T-105 replaces it with the sidebar shell.
// Until then it keeps the exact V1 ordering and labels so V1 behaviour and its
// e2e checks survive the move to the registry unchanged.
const TAB_ORDER = ["json-workbench", "jwt-decoder", "regex-tester", "timestamp-converter", "encode-generate", "debug-report"];
const TAB_LABEL: Record<string, string> = {
  "json-workbench": "JSON Workbench",
  "jwt-decoder": "JWT Decoder",
  "regex-tester": "Regex Tester",
  "timestamp-converter": "Timestamp Converter",
  "encode-generate": "Generators & Converters",
  "debug-report": "Debug Report",
};
const TAB_SHORT: Record<string, string> = {
  "json-workbench": "JSON",
  "jwt-decoder": "JWT",
  "regex-tester": "Regex",
  "timestamp-converter": "Timestamp",
  "encode-generate": "Generators",
  "debug-report": "Debug",
};

const TABS = TAB_ORDER.map((id) => TOOLS.find((t) => t.id === id)).filter((t) => t !== undefined);

export default function Header({
  activeToolId,
  onSelectTool,
  onOpenPalette,
}: {
  activeToolId: string;
  onSelectTool: (id: string) => void;
  onOpenPalette: () => void;
}) {
  // Repainting is done by the CSS variables in src/theme/tokens.css once
  // `data-theme` changes; this state only exists so the button can show and
  // cycle the stored preference.
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const ThemeIcon = THEME_ICON[themePref];

  function cycleTheme() {
    const next = nextThemePref(themePref);
    setThemePref(next);
    setThemePrefState(next);
  }

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
        {TABS.map((tool) => {
          const active = tool.id === activeToolId;
          return (
            <button
              key={tool.id}
              type="button"
              data-testid={`tool-tab-${tool.legacyHash ?? tool.id}`}
              onClick={() => onSelectTool(tool.id)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              <span className="hidden sm:inline">{TAB_LABEL[tool.id] ?? tool.navTitle}</span>
              <span className="sm:hidden">{TAB_SHORT[tool.id] ?? tool.navTitle}</span>
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
        <button
          type="button"
          data-testid="btn-theme"
          onClick={cycleTheme}
          aria-label={`Theme: ${themePref}. Click to switch.`}
          title={`Theme: ${themePref}. Click to switch.`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-raised text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <ThemeIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <PrivacyBadge />
      </div>
    </header>
  );
}
