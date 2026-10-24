export type ThemePref = "system" | "light" | "dark";

const KEY = "dth.theme";

// Reading the preference must never throw: localStorage is unavailable in some
// embeds and in private browsing, and a corrupt value is not worth a white screen.
// Both are treated as "system", which needs no stored value at all.
export function getThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "system" || raw === "light" || raw === "dark") return raw;
  } catch {
    /* fall through to the default */
  }
  return "system";
}

export function setThemePref(p: ThemePref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage refused: still apply the theme for this session */
  }
  applyTheme(p);
}

// "system" removes the attribute instead of writing "system", so the
// `prefers-color-scheme` block in src/theme/tokens.css takes over again.
export function applyTheme(p: ThemePref): void {
  if (p === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = p;
}

// The order the header button cycles through.
export function nextThemePref(p: ThemePref): ThemePref {
  if (p === "system") return "light";
  if (p === "light") return "dark";
  return "system";
}
