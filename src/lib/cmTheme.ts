import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { colors } from "../theme/colors.js";

export const cmDarkTheme = EditorView.theme(
  {
    "&": {
      color: colors.ink,
      backgroundColor: colors.surface,
      height: "100%",
      fontSize: "13.5px",
    },
    ".cm-content": {
      fontFamily:
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      caretColor: colors.accent,
      padding: "14px 0",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.accent },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: colors.accentMuted,
    },
    ".cm-panels": { backgroundColor: colors.raised, color: colors.ink },
    ".cm-gutters": {
      backgroundColor: colors.surface,
      color: colors.inkFaint,
      border: "none",
      borderRight: `1px solid ${colors.borderSubtle}`,
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: colors.inkDim },
    ".cm-activeLine": { backgroundColor: "rgba(124,108,246,0.05)" },
    ".cm-foldPlaceholder": {
      backgroundColor: colors.raised,
      border: `1px solid ${colors.border}`,
      color: colors.inkDim,
    },
    ".cm-tooltip": {
      backgroundColor: colors.raised,
      border: `1px solid ${colors.border}`,
      color: colors.ink,
    },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      textDecoration: `underline wavy ${colors.err}`,
    },
    ".cm-diagnostic-error": {
      borderLeft: `3px solid ${colors.err}`,
      backgroundColor: colors.raised,
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-editor.cm-focused": { outline: "none" },
  },
  { dark: true }
);

export const cmHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "#7dd3fc" },
  { tag: t.string, color: "#a3e635" },
  { tag: t.number, color: "#fbbf24" },
  { tag: [t.bool, t.null], color: "#f472b6" },
  { tag: t.punctuation, color: colors.inkDim },
  { tag: t.comment, color: colors.inkFaint, fontStyle: "italic" },
  { tag: t.keyword, color: "#c4b5fd" },
  { tag: t.typeName, color: "#7dd3fc" },
  { tag: t.definition(t.typeName), color: "#93c5fd" },
]);

export const cmTheme = [cmDarkTheme, syntaxHighlighting(cmHighlightStyle)];
