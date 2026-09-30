import type { EditorView } from "@codemirror/view";

/**
 * Replace an editor's entire document imperatively.
 *
 * Why not just update React state and let the controlled `value` prop flow
 * back down? @uiw/react-codemirror briefly ignores external `value` changes
 * for ~200ms after the user's last keystroke (it defers to avoid fighting
 * live typing) and only applies the pending update once that window closes.
 * That's invisible for a human clicking "Format" a second or two after
 * pasting, but it means a fast, automated, or simply quick follow-up click
 * could appear to do nothing. Dispatching straight to the view sidesteps
 * that window entirely — this always takes effect immediately, and the
 * view's own change listener still calls onChange normally to keep React
 * state in sync.
 */
export function replaceEditorContent(view: EditorView, text: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
}
