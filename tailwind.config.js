import { colors } from "./src/theme/colors.js";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: colors.canvas,
        surface: colors.surface,
        raised: colors.raised,
        border: {
          DEFAULT: colors.border,
          subtle: colors.borderSubtle,
        },
        accent: {
          DEFAULT: colors.accent,
          hover: colors.accentHover,
          muted: colors.accentMuted,
        },
        ok: colors.ok,
        warn: colors.warn,
        err: colors.err,
        ink: {
          DEFAULT: colors.ink,
          dim: colors.inkDim,
          faint: colors.inkFaint,
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        pop: "0 20px 60px -15px rgba(0,0,0,0.7)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
        "slide-up": "slide-up 140ms ease-out",
      },
    },
  },
  plugins: [],
};
