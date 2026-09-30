import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from "react";
import { AlertCircle, CheckCircle2, Search, Sparkles, Trash2, UploadCloud } from "lucide-react";
import type { Command } from "../../components/CommandPalette";
import type { ToolHandle } from "../../lib/toolHandle";
import { copyText, downloadText } from "../../lib/clipboard";
import { toast } from "../../lib/toastBus";
import { applyReplacement, buildSample, DEFAULT_FLAGS, runRegex, type UiFlags } from "../../lib/regex";
import FlagToggles from "./components/FlagToggles";
import MatchHighlight from "./components/MatchHighlight";
import MatchList from "./components/MatchList";
import ReplacePanel from "./components/ReplacePanel";

type OutputTab = "highlight" | "list" | "replace";

const TABS: { id: OutputTab; label: string }[] = [
  { id: "highlight", label: "Highlighted text" },
  { id: "list", label: "Match list" },
  { id: "replace", label: "Replace" },
];

// Evaluated live on every render, deliberately with no debounce — the
// computation is local JS and fast enough for a "live as you type" feel
// to matter more than shaving a render. The one known trade-off (a
// pathological nested-quantifier pattern can be slow to evaluate against
// certain input, independent of input size — the classic ReDoS/
// catastrophic-backtracking case) is a characteristic every client-side
// regex tester shares; it isn't addressed here since fixing it properly
// needs a Web Worker with a hard timeout, which is real added
// architecture, not something to bolt on silently for V1.
const RegexTesterApp = forwardRef<ToolHandle, { isActive: boolean }>(function RegexTesterApp(_props, ref) {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState<UiFlags>(DEFAULT_FLAGS);
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  const [tab, setTab] = useState<OutputTab>("highlight");
  const [dragOver, setDragOver] = useState(false);
  const patternRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = pattern.trim() === "";
  const result = isEmpty ? null : runRegex(pattern, flags, text);
  const replacementResult = isEmpty ? null : applyReplacement(pattern, flags, text, replacement);
  const matchCount = result?.ok ? result.data.matchCount : 0;

  function clear() {
    setPattern("");
    setText("");
    setReplacement("");
    toast("Cleared");
  }

  function loadSample() {
    const sample = buildSample();
    setPattern(sample.pattern);
    setFlags(sample.flags);
    setText(sample.text);
    setReplacement(sample.replacement);
    setTab("highlight");
    toast("Loaded sample pattern");
  }

  async function copyLabeled(label: string, value: string) {
    await copyText(value);
    toast(`Copied ${label}`);
  }

  async function copyMatchList() {
    if (!result?.ok) return;
    const payload = JSON.stringify(result.data.matches, null, 2);
    await copyText(payload);
    toast("Copied match list");
  }

  async function downloadMatchList() {
    if (!result?.ok) return;
    const payload = JSON.stringify(result.data.matches, null, 2);
    await downloadText("regex-matches.json", payload, "application/json");
    toast("Downloaded regex-matches.json");
  }

  async function copyReplacement() {
    if (!replacementResult?.ok) return;
    await copyText(replacementResult.output);
    toast("Copied replacement output");
  }

  async function downloadReplacement() {
    if (!replacementResult?.ok) return;
    await downloadText("regex-replaced.txt", replacementResult.output, "text/plain");
    toast("Downloaded regex-replaced.txt");
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.text().then((t) => setText(t));
  }

  const commands: Command[] = [
    { id: "regex-sample", label: "Load sample pattern", group: "Regex Tester", action: loadSample },
    { id: "regex-clear", label: "Clear pattern, flags, and text", group: "Regex Tester", action: clear },
    { id: "regex-focus-pattern", label: "Focus pattern field", group: "Regex Tester", action: () => patternRef.current?.focus() },
    { id: "regex-focus-text", label: "Focus test text", group: "Regex Tester", action: () => textRef.current?.focus() },
    { id: "regex-mode-all", label: "Match: all occurrences", group: "Regex Tester", action: () => setFlags((f) => ({ ...f, allMatches: true })) },
    { id: "regex-mode-first", label: "Match: first occurrence only", group: "Regex Tester", action: () => setFlags((f) => ({ ...f, allMatches: false })) },
    { id: "regex-toggle-i", label: "Toggle case-insensitive (i)", group: "Regex Tester", action: () => setFlags((f) => ({ ...f, caseInsensitive: !f.caseInsensitive })) },
    { id: "regex-toggle-m", label: "Toggle multiline (m)", group: "Regex Tester", action: () => setFlags((f) => ({ ...f, multiline: !f.multiline })) },
    { id: "regex-toggle-s", label: "Toggle dot-matches-newline (s)", group: "Regex Tester", action: () => setFlags((f) => ({ ...f, dotAll: !f.dotAll })) },
    { id: "regex-view-highlight", label: "Go to Highlighted text", group: "Regex Tester", action: () => setTab("highlight") },
    { id: "regex-view-list", label: "Go to Match list", group: "Regex Tester", action: () => setTab("list") },
    { id: "regex-view-replace", label: "Go to Replace", group: "Regex Tester", action: () => setTab("replace") },
    ...(result?.ok && result.data.matches.length > 0
      ? [{ id: "regex-copy-matches", label: "Copy match list (JSON)", group: "Regex Tester", action: copyMatchList }]
      : []),
    ...(replacementResult?.ok && replacementResult.changed
      ? [{ id: "regex-copy-replacement", label: "Copy replaced text", group: "Regex Tester", action: copyReplacement }]
      : []),
  ];

  useImperativeHandle(ref, () => ({ getCommands: () => commands }), [commands]);

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(360px,1fr)_minmax(440px,1.3fr)] lg:gap-4 lg:overflow-hidden lg:p-4">
      <section className="flex min-h-[40vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex flex-col gap-2.5 border-b border-border-subtle p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="btn-regex-sample"
              onClick={loadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Load sample</span>
              <span className="sm:hidden">Sample</span>
            </button>
            <button
              type="button"
              data-testid="btn-regex-clear"
              onClick={clear}
              disabled={isEmpty && text === "" && replacement === ""}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-border hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Clear
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-dim" htmlFor="regex-pattern-input">
              Regex pattern
            </label>
            <input
              id="regex-pattern-input"
              ref={patternRef}
              data-testid="regex-pattern-input"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={String.raw`\d+`}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-raised px-3 py-1.5 font-mono text-[13px] text-ink outline-none focus:border-accent/50 placeholder:text-ink-faint"
            />
          </div>

          <FlagToggles flags={flags} onChange={setFlags} />

          {isEmpty ? (
            <div data-testid="regex-status" data-status="empty" className="flex items-center gap-1.5 text-xs text-ink-faint">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              Type a pattern to begin
            </div>
          ) : !result?.ok ? (
            <div data-testid="regex-status" data-status="invalid" className="flex items-start gap-1.5 text-xs text-err">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 translate-y-0.5" strokeWidth={2} />
              <span>{result && !result.ok ? result.error : ""}</span>
            </div>
          ) : matchCount === 0 ? (
            <div data-testid="regex-status" data-status="valid" data-match-count="0" className="flex items-center gap-1.5 text-xs text-ink-dim">
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              0 matches
            </div>
          ) : (
            <div data-testid="regex-status" data-status="valid" data-match-count={matchCount} className="flex items-center gap-1.5 text-xs font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              {matchCount} match{matchCount === 1 ? "" : "es"}
            </div>
          )}
        </div>

        <div
          data-testid="regex-text-input"
          className="relative min-h-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Test text"
            placeholder="Paste, type, or drop the text to test your pattern against…"
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-3.5 font-mono text-[13px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-canvas/90 text-accent">
              <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm font-medium">Drop your text file</p>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel lg:min-h-0">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle p-2">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                data-testid={`regex-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-accent/15 text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {result?.ok && result.data.matches.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
              <button
                type="button"
                data-testid="btn-copy-matches"
                onClick={copyMatchList}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                Copy
              </button>
              <button
                type="button"
                data-testid="btn-download-matches"
                onClick={downloadMatchList}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
              >
                Download
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {!result ? (
            <PanelEmpty text="Type a pattern on the left to see matches here." />
          ) : !result.ok ? (
            <PanelEmpty text="Fix the pattern on the left to see it evaluated here." />
          ) : (
            <>
              <div className={tab === "highlight" ? "flex h-full min-h-0 flex-col" : "hidden"}>
                <MatchHighlight text={text} matches={result.data.matches} />
              </div>
              <div className={tab === "list" ? "flex h-full min-h-0 flex-col" : "hidden"}>
                <MatchList matches={result.data.matches} onCopy={copyLabeled} />
              </div>
              <div className={tab === "replace" ? "flex h-full min-h-0 flex-col" : "hidden"}>
                <ReplacePanel
                  replacement={replacement}
                  onReplacementChange={setReplacement}
                  result={replacementResult ?? { ok: false, output: "", error: "No pattern", changed: false }}
                  onCopy={copyReplacement}
                  onDownload={downloadReplacement}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
});

export default RegexTesterApp;

function PanelEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-faint">{text}</div>;
}
