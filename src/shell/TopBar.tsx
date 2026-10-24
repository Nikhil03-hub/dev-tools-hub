import { useState } from "react";
import { Github, Menu, Moon, Search, Sun, Monitor } from "lucide-react";
import Kbd from "../components/Kbd";
import IconButton from "../components/IconButton";
import PrivacyPopover from "./PrivacyPopover";
import { getThemePref, nextThemePref, setThemePref, type ThemePref } from "./theme";

const THEME_ICON: Record<ThemePref, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };
const REPO_URL = "https://github.com/Nikhil03-hub/dev-tools-hub";

export default function TopBar({
  onOpenPalette,
  onOpenMenu,
  showMenu,
}: {
  onOpenPalette: () => void;
  onOpenMenu: () => void;
  showMenu: boolean;
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
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 border-b border-border-subtle bg-canvas/85 px-3 backdrop-blur">
      {showMenu && (
        <IconButton
          label="Open navigation"
          testId="btn-menu"
          onClick={onOpenMenu}
          icon={<Menu className="h-4 w-4" strokeWidth={2} />}
        />
      )}

      <button
        type="button"
        data-testid="btn-open-palette"
        onClick={onOpenPalette}
        className="focus-ring flex h-8 items-center gap-2 rounded-full border border-border bg-raised px-3 text-xs text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        aria-label="Search tools"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">Search tools…</span>
        <span className="hidden sm:inline-flex">
          <Kbd keys={["mod", "K"]} />
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PrivacyPopover />
        <IconButton
          label={`Theme: ${themePref}. Click to switch.`}
          testId="btn-theme"
          onClick={cycleTheme}
          icon={<ThemeIcon className="h-3.5 w-3.5" strokeWidth={2} />}
        />
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source code on GitHub"
          title="Source code on GitHub"
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <Github className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
