import { useMemo, useState, type DragEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { cmTheme } from "../lib/cmTheme";
// JsonEditor is otherwise tool-agnostic (any tool can render read-only
// formatted text through it), but its built-in JSON linter — only ever
// active when a caller uses language="json" with lint left on — has to
// reach into the JSON tool's own parser for diagnostics. JWT's read-only
// panels pass lint={false} specifically so they never take this path.
import { parseJsonWithDiagnostics } from "../tools/json/lib/jsonParse";
import { UploadCloud } from "lucide-react";

const jsonLinter = linter((view) => {
  const text = view.state.doc.toString();
  if (text.trim() === "") return [];
  const result = parseJsonWithDiagnostics(text);
  if (result.ok) return [];
  const from = Math.min(Math.max(result.error.index, 0), text.length);
  const to = Math.min(from + Math.max(result.error.length, 1), text.length);
  const diagnostics: Diagnostic[] = [
    { from, to: to > from ? to : from + 1 > text.length ? from : from + 1, severity: "error", message: result.error.message },
  ];
  return diagnostics;
});

export interface JsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  placeholder?: string;
  ariaLabel: string;
  language?: "json" | "ts";
  allowDrop?: boolean;
  lint?: boolean;
  onReady?: (view: EditorView) => void;
}

export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "100%",
  placeholder,
  ariaLabel,
  language = "json",
  allowDrop = false,
  lint = true,
  onReady,
}: JsonEditorProps) {
  const [dragOver, setDragOver] = useState(false);

  const extensions = useMemo(() => {
    const base = [
      language === "json" ? jsonLang() : javascript({ typescript: true }),
      EditorView.lineWrapping,
    ];
    if (lint && language === "json") base.push(jsonLinter);
    return base;
  }, [language, lint]);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!allowDrop || !onChange) return;
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.text().then((text) => onChange(text));
  }

  return (
    <div
      className="relative h-full min-h-0 flex-1 overflow-hidden"
      onDragOver={(e) => {
        if (!allowDrop) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={cmTheme}
        height="100%"
        minHeight={minHeight}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: false,
          closeBrackets: !readOnly,
        }}
        extensions={extensions}
        aria-label={ariaLabel}
        style={{ height: "100%" }}
        className="h-full [&_.cm-editor]:h-full"
        onCreateEditor={onReady}
      />
      {allowDrop && dragOver && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-canvas/90 text-accent">
          <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
          <p className="text-sm font-medium">Drop your JSON file</p>
        </div>
      )}
    </div>
  );
}
