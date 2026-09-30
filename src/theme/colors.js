// Single source of truth for the app's color tokens — imported by both
// tailwind.config.js (Node/ESM, no TS) and the CodeMirror theme (TS), so
// the editor chrome and the rest of the UI never drift apart.
export const colors = {
  canvas: "#0a0a0d",
  surface: "#111116",
  raised: "#17171e",
  border: "#25252e",
  borderSubtle: "#1c1c23",
  accent: "#7c6cf6",
  accentHover: "#8f81f8",
  accentMuted: "#7c6cf633",
  ok: "#34d399",
  warn: "#fbbf24",
  err: "#f87171",
  ink: "#e8e8ec",
  inkDim: "#9a9aa8",
  inkFaint: "#5c5c6a",
};
