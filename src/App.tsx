import { useEffect, useRef, useState } from "react";
import Header, { type HubTool } from "./components/Header";
import CommandPalette, { type Command } from "./components/CommandPalette";
import ToastHost from "./components/ToastHost";
import JsonWorkbenchApp from "./tools/json/JsonWorkbenchApp";
import JwtDecoderApp from "./tools/jwt/JwtDecoderApp";
import RegexTesterApp from "./tools/regex/RegexTesterApp";
import TimestampConverterApp from "./tools/timestamp/TimestampConverterApp";
import GeneratorsApp from "./tools/generators/GeneratorsApp";
import DebugReportApp from "./tools/debug/DebugReportApp";
import type { ToolHandle } from "./lib/toolHandle";

type ToolId = "json" | "jwt" | "regex" | "timestamp" | "generators" | "debug";

const TOOLS: HubTool[] = [
  { id: "json", label: "JSON Workbench", shortLabel: "JSON" },
  { id: "jwt", label: "JWT Decoder", shortLabel: "JWT" },
  { id: "regex", label: "Regex Tester", shortLabel: "Regex" },
  { id: "timestamp", label: "Timestamp Converter", shortLabel: "Timestamp" },
  { id: "generators", label: "Generators & Converters", shortLabel: "Generators" },
  { id: "debug", label: "Debug Report", shortLabel: "Debug" },
];

const TOOL_IDS: ToolId[] = ["json", "jwt", "regex", "timestamp", "generators", "debug"];
function toolFromHash(): ToolId | null {
  const h = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  return (TOOL_IDS as string[]).includes(h) ? (h as ToolId) : null;
}

// The hub shell: it owns which tool is visible, the single command palette,
// and the single toast host. Both tools stay mounted at all times (hidden
// with CSS rather than unmounted) so switching tools never discards
// whatever someone was in the middle of pasting — each tool reports its
// own command list on demand through a ToolHandle ref rather than pushing
// state up, so switching tools or opening the palette can't turn into a
// render loop between a tool and this shell.
export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>(() => toolFromHash() ?? "json");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const jsonRef = useRef<ToolHandle>(null);
  const jwtRef = useRef<ToolHandle>(null);
  const regexRef = useRef<ToolHandle>(null);
  const timestampRef = useRef<ToolHandle>(null);
  const generatorsRef = useRef<ToolHandle>(null);
  const debugRef = useRef<ToolHandle>(null);

  useEffect(() => {
    const want = `#${activeTool}`;
    if (window.location.hash !== want) history.replaceState(null, "", want);
  }, [activeTool]);

  useEffect(() => {
    const onHash = () => {
      const t = toolFromHash();
      if (t) setActiveTool(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeHandle =
    activeTool === "json"
      ? jsonRef.current
      : activeTool === "jwt"
        ? jwtRef.current
        : activeTool === "regex"
          ? regexRef.current
          : activeTool === "timestamp"
            ? timestampRef.current
            : activeTool === "generators"
              ? generatorsRef.current
              : debugRef.current;
  const switchCommands: Command[] = TOOLS.filter((t) => t.id !== activeTool).map((t) => ({
    id: `switch-${t.id}`,
    label: `Switch to ${t.label}`,
    group: "Dev Tools Hub",
    action: () => setActiveTool(t.id as ToolId),
  }));
  const commands: Command[] = [...switchCommands, ...(activeHandle?.getCommands() ?? [])];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header tools={TOOLS} activeTool={activeTool} onSelectTool={(id) => setActiveTool(id as ToolId)} onOpenPalette={() => setPaletteOpen(true)} />

      <div className="min-h-0 flex-1">
        <div className={activeTool === "json" ? "h-full" : "hidden"}>
          <JsonWorkbenchApp ref={jsonRef} isActive={activeTool === "json"} />
        </div>
        <div className={activeTool === "jwt" ? "h-full" : "hidden"}>
          <JwtDecoderApp ref={jwtRef} isActive={activeTool === "jwt"} />
        </div>
        <div className={activeTool === "regex" ? "h-full" : "hidden"}>
          <RegexTesterApp ref={regexRef} isActive={activeTool === "regex"} />
        </div>
        <div className={activeTool === "timestamp" ? "h-full" : "hidden"}>
          <TimestampConverterApp ref={timestampRef} isActive={activeTool === "timestamp"} />
        </div>
        <div className={activeTool === "generators" ? "h-full" : "hidden"}>
          <GeneratorsApp ref={generatorsRef} isActive={activeTool === "generators"} />
        </div>
        <div className={activeTool === "debug" ? "h-full" : "hidden"}>
          <DebugReportApp ref={debugRef} isActive={activeTool === "debug"} />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ToastHost />
    </div>
  );
}
