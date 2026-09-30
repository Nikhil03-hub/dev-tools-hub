import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import Toolbar from "./components/Toolbar";
import StatusPill from "./components/StatusPill";
import JsonEditor from "../../components/JsonEditor";
import JsonTree from "./components/JsonTree";
import DiffView from "./components/DiffView";
import SchemaView from "./components/SchemaView";
import TsView from "./components/TsView";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { parseJsonWithDiagnostics } from "./lib/jsonParse";
import { formatJson, minifyJson, byteSize, countNodes, maxDepth } from "./lib/format";
import { replaceEditorContent } from "../../lib/cmUtil";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { SAMPLE_JSON } from "./lib/sample";
import { TreeDeciduous, GitCompare, ShieldCheck, FileCode2 } from "lucide-react";

type TabId = "tree" | "diff" | "schema" | "ts";

const TABS: { id: TabId; label: string; icon: typeof TreeDeciduous }[] = [
  { id: "tree", label: "Tree", icon: TreeDeciduous },
  { id: "diff", label: "Diff", icon: GitCompare },
  { id: "schema", label: "Schema", icon: ShieldCheck },
  { id: "ts", label: "TypeScript", icon: FileCode2 },
];

const PLACEHOLDER = 'Paste JSON here, or drop a .json file…\n\n{\n  "hello": "world"\n}';

// The original single-tool App.tsx, unchanged in behavior — it just no
// longer owns the page header, the command palette UI, or the toast host,
// since those are now hub-level singletons shared with every tool. It
// still owns every JSON-specific action and reports its command list up
// through `ref` (see ToolHandle) instead of rendering its own palette.
const JsonWorkbenchApp = forwardRef<ToolHandle, { isActive: boolean }>(function JsonWorkbenchApp(
  { isActive },
  ref
) {
  const [source, setSource] = useState("");
  const [diffRight, setDiffRight] = useState("");
  const [schemaText, setSchemaText] = useState("");
  const [tsRootName, setTsRootName] = useState("Root");
  const [activeTab, setActiveTab] = useState<TabId>("tree");
  const mainViewRef = useRef<EditorView | null>(null);

  function setMainContent(text: string) {
    if (mainViewRef.current) replaceEditorContent(mainViewRef.current, text);
    else setSource(text);
  }

  const isEmpty = source.trim() === "";
  const parsed = parseJsonWithDiagnostics(source);
  const meta =
    parsed.ok
      ? { bytes: byteSize(source), nodes: countNodes(parsed.value), depth: maxDepth(parsed.value) }
      : null;

  function format() {
    if (!parsed.ok) {
      toast("Fix the JSON error first");
      return;
    }
    setMainContent(formatJson(parsed.value));
    toast("Formatted");
  }

  function minify() {
    if (!parsed.ok) {
      toast("Fix the JSON error first");
      return;
    }
    setMainContent(minifyJson(parsed.value));
    toast("Minified");
  }

  async function copyMain() {
    if (isEmpty) return;
    await copyText(source);
    toast("Copied");
  }

  async function downloadMain() {
    if (isEmpty) return;
    await downloadText("data.json", parsed.ok ? formatJson(parsed.value) : source);
    toast("Downloaded data.json");
  }

  function loadSample() {
    setMainContent(formatJson(SAMPLE_JSON));
    setActiveTab("tree");
    toast("Loaded sample JSON");
  }

  function clear() {
    setMainContent("");
    toast("Cleared");
  }

  // Hub-level ⌘K (open the command palette) is handled once, by the shell.
  // This tool only listens for its own shortcuts, and only acts on them
  // while it's the visible tool — both tools stay mounted so switching
  // back and forth preserves in-progress input, so without this guard a
  // background ⌘⇧F while JWT is on screen would silently reformat JSON
  // content the user can't currently see.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isActive) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        format();
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        minify();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isActive]);

  const commands: Command[] = [
    { id: "format", label: "Format JSON", group: "JSON Workbench", shortcut: "⌘⇧F", action: format },
    { id: "minify", label: "Minify JSON", group: "JSON Workbench", shortcut: "⌘⇧M", action: minify },
    { id: "copy", label: "Copy formatted JSON", group: "JSON Workbench", action: copyMain },
    { id: "download", label: "Download as .json", group: "JSON Workbench", action: downloadMain },
    { id: "sample", label: "Load sample JSON", group: "JSON Workbench", action: loadSample },
    { id: "clear", label: "Clear editor", group: "JSON Workbench", action: clear },
    { id: "tree", label: "Go to Tree view", group: "JSON Workbench", action: () => setActiveTab("tree") },
    { id: "diff", label: "Go to Diff view", group: "JSON Workbench", action: () => setActiveTab("diff") },
    { id: "schema", label: "Go to Schema view", group: "JSON Workbench", action: () => setActiveTab("schema") },
    { id: "ts", label: "Go to TypeScript view", group: "JSON Workbench", action: () => setActiveTab("ts") },
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <Toolbar
            onFormat={format}
            onMinify={minify}
            onCopy={copyMain}
            onDownload={downloadMain}
            onLoadSample={loadSample}
            onClear={clear}
            hasContent={!isEmpty}
            isValid={parsed.ok}
          />
          <StatusPill isEmpty={isEmpty} error={parsed.ok ? null : parsed.error} meta={meta} />
        </div>
        <div data-testid="main-editor" className="min-h-0 flex-1">
          <JsonEditor
            value={source}
            onChange={setSource}
            ariaLabel="JSON input"
            allowDrop
            placeholder={PLACEHOLDER}
            onReady={(view) => {
              mainViewRef.current = view;
            }}
          />
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle p-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1">
          <div className={activeTab === "tree" ? "h-full" : "hidden"}>
            {parsed.ok ? (
              <JsonTree value={parsed.value} />
            ) : (
              <PanelEmpty text={isEmpty ? "Paste some JSON to see its tree view." : "Fix the JSON error to see the tree view."} />
            )}
          </div>
          <div className={activeTab === "diff" ? "h-full" : "hidden"}>
            <DiffView leftText={source} rightText={diffRight} onRightChange={setDiffRight} />
          </div>
          <div className={activeTab === "schema" ? "h-full" : "hidden"}>
            <SchemaView dataText={source} schemaText={schemaText} onSchemaChange={setSchemaText} />
          </div>
          <div className={activeTab === "ts" ? "h-full" : "hidden"}>
            <TsView
              value={parsed.ok ? parsed.value : undefined}
              isValid={parsed.ok}
              rootName={tsRootName}
              onRootNameChange={setTsRootName}
            />
          </div>
        </div>
      </section>
    </main>
  );
});

export default JsonWorkbenchApp;

function PanelEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">{text}</div>;
}
