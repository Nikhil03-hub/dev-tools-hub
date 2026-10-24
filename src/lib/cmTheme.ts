import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// The editor chrome and the syntax colours are read from the same CSS variables
// the rest of the UI uses (src/theme/tokens.css), so a theme switch repaints the
// editor without a second theme object or a rebuild. `rgb(var(--c-x))` is legal
// in the inline styles CodeMirror injects, and style-src 'unsafe-inline' already
// allows them.
export const cmDarkTheme = EditorView.theme({
  "&": {
    color: "rgb(var(--c-ink))",
    backgroundColor: "rgb(var(--c-surface))",
    height: "100%",
    fontSize: "13.5px",
  },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    caretColor: "rgb(var(--c-accent))",
    padding: "14px 0",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "rgb(var(--c-accent))" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgb(var(--c-accent) / 0.25)",
  },
  ".cm-panels": { backgroundColor: "rgb(var(--c-raised))", color: "rgb(var(--c-ink))" },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--c-surface))",
    color: "rgb(var(--c-ink-faint))",
    border: "none",
    borderRight: "1px solid rgb(var(--c-border-subtle))",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "rgb(var(--c-ink-dim))" },
  ".cm-activeLine": { backgroundColor: "rgb(var(--c-accent) / 0.05)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "rgb(var(--c-raised))",
    border: "1px solid rgb(var(--c-border))",
    color: "rgb(var(--c-ink-dim))",
  },
  ".cm-tooltip": {
    backgroundColor: "rgb(var(--c-raised))",
    border: "1px solid rgb(var(--c-border))",
    color: "rgb(var(--c-ink))",
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy rgb(var(--c-err))",
  },
  ".cm-diagnostic-error": {
    borderLeft: "3px solid rgb(var(--c-err))",
    backgroundColor: "rgb(var(--c-raised))",
  },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-editor.cm-focused": { outline: "none" },
});

export const cmHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "rgb(var(--c-syn-prop))" },
  { tag: t.string, color: "rgb(var(--c-syn-string))" },
  { tag: t.number, color: "rgb(var(--c-syn-number))" },
  { tag: [t.bool, t.null], color: "rgb(var(--c-syn-bool))" },
  { tag: t.punctuation, color: "rgb(var(--c-ink-dim))" },
  { tag: t.comment, color: "rgb(var(--c-ink-faint))", fontStyle: "italic" },
  { tag: t.keyword, color: "rgb(var(--c-syn-keyword))" },
  { tag: t.typeName, color: "rgb(var(--c-syn-prop))" },
  { tag: t.definition(t.typeName), color: "rgb(var(--c-syn-typedef))" },
]);

export const cmTheme = [cmDarkTheme, syntaxHighlighting(cmHighlightStyle)];
