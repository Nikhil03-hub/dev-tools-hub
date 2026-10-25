/** @type {import('tailwindcss').Config} */
// Every colour is an RGB triplet CSS variable from src/theme/tokens.css, so a
// single `data-theme` attribute repaints the whole app and components never
// carry a literal colour. `<alpha-value>` is what makes `bg-accent/15` work.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)",
        border: {
          DEFAULT: "rgb(var(--c-border) / <alpha-value>)",
          subtle: "rgb(var(--c-border-subtle) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          hover: "rgb(var(--c-accent-hover) / <alpha-value>)",
          strong: {
            DEFAULT: "rgb(var(--c-accent-strong) / <alpha-value>)",
            // Background for a hovered filled control. Separate from `hover`,
            // which is a foreground token and needs the opposite luminance in
            // dark mode.
            hover: "rgb(var(--c-accent-strong-hover) / <alpha-value>)",
          },
          muted: "rgb(var(--c-accent) / 0.2)",
          soft: "rgb(var(--c-accent) / var(--c-soft-alpha))",
        },
        "on-accent": "rgb(var(--c-on-accent) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        err: "rgb(var(--c-err) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          dim: "rgb(var(--c-ink-dim) / <alpha-value>)",
          faint: "rgb(var(--c-ink-faint) / <alpha-value>)",
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
