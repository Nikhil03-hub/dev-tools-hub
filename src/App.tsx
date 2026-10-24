import { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import CommandPalette, { type Command } from "./components/CommandPalette";
import ToastHost from "./components/ToastHost";
import ToolHost, { type ToolHostHandle } from "./shell/ToolHost";
import { TOOLS, getTool, getToolByLegacyHash } from "./registry/tools";

const DEFAULT_TOOL = "json-workbench";

function toolFromHash(): string | null {
  const h = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  if (!h) return null;
  return getToolByLegacyHash(h)?.id ?? null;
}

// The hub shell: it owns which tool is visible, the single command palette and
// the single toast host. ToolHost keeps visited tools mounted, so switching
// tools never discards a half-pasted input. The shell only *pulls* a tool's
// commands through `getActiveHandle()` when it renders the palette, so switching
// tools can't turn into a render loop between a tool and the shell.
export default function App() {
  const [activeId, setActiveId] = useState<string>(() => toolFromHash() ?? DEFAULT_TOOL);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const hostRef = useRef<ToolHostHandle>(null);

  useEffect(() => {
    const legacy = getTool(activeId)?.legacyHash;
    if (!legacy) return;
    const want = `#${legacy}`;
    if (window.location.hash !== want) history.replaceState(null, "", want);
  }, [activeId]);

  useEffect(() => {
    const onHash = () => {
      const id = toolFromHash();
      if (id) setActiveId(id);
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

  const activeHandle = hostRef.current?.getActiveHandle() ?? null;
  const switchCommands: Command[] = TOOLS.filter((t) => t.id !== activeId).map((t) => ({
    id: `switch-${t.id}`,
    label: `Switch to ${t.navTitle}`,
    group: "Dev Tools Hub",
    action: () => setActiveId(t.id),
  }));
  const commands: Command[] = [...switchCommands, ...(activeHandle?.getCommands() ?? [])];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header activeToolId={activeId} onSelectTool={setActiveId} onOpenPalette={() => setPaletteOpen(true)} />

      <div className="min-h-0 flex-1">
        <ToolHost ref={hostRef} activeId={activeId} />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ToastHost />
    </div>
  );
}
