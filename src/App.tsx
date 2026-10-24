import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import CommandPalette, { type Command } from "./components/CommandPalette";
import ToastHost from "./components/ToastHost";
import ToolHost, { type ToolHostHandle } from "./shell/ToolHost";
import { TOOLS, ROUTE_TABLES, getTool } from "./registry/tools";
import { legacyRedirect, toolPath, type Route } from "./core/router/router";
import { currentRoute, interceptLinkClick, navigate, onRouteChange } from "./shell/navigation";

const DEFAULT_TOOL = "json-workbench";
const HOME_TITLE = "Dev Tools Hub: private developer tools that run in your browser";

// The hub shell: owns the route, the single command palette and the single toast
// host. ToolHost keeps visited tools mounted so switching never discards a
// half-pasted input. The shell only *pulls* a tool's commands through
// `getActiveHandle()` when it renders the palette, so switching tools cannot
// turn into a render loop between a tool and the shell.
export default function App() {
  const [route, setRoute] = useState<Route>(() => {
    const redirect = legacyRedirect(window.location.pathname, window.location.hash, ROUTE_TABLES);
    if (redirect) window.history.replaceState(null, "", redirect);
    return currentRoute(ROUTE_TABLES);
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const hostRef = useRef<ToolHostHandle>(null);

  // Until T-106 adds the home page, home / static pages / 404 all render the
  // default tool. The route is already tracked, so T-106 only changes this line.
  const activeId = route.kind === "tool" ? route.id : DEFAULT_TOOL;

  useEffect(() => onRouteChange(() => setRoute(currentRoute(ROUTE_TABLES))), []);

  useEffect(() => {
    const tool = route.kind === "tool" ? getTool(route.id) : undefined;
    document.title = tool ? `${tool.title} · Dev Tools Hub` : HOME_TITLE;
  }, [route]);

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

  function openTool(id: string, e?: Parameters<typeof interceptLinkClick>[0]) {
    const tool = getTool(id);
    if (!tool) return;
    if (e) interceptLinkClick(e, toolPath(tool.slug));
    else navigate(toolPath(tool.slug));
  }

  const activeHandle = hostRef.current?.getActiveHandle() ?? null;
  const switchCommands: Command[] = useMemo(
    () =>
      TOOLS.filter((t) => t.id !== activeId).map((t) => ({
        id: `switch-${t.id}`,
        label: `Switch to ${t.navTitle}`,
        group: "Dev Tools Hub",
        action: () => navigate(toolPath(t.slug)),
      })),
    [activeId]
  );
  const commands: Command[] = [...switchCommands, ...(activeHandle?.getCommands() ?? [])];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header activeToolId={activeId} onSelectTool={(id) => openTool(id)} onOpenPalette={() => setPaletteOpen(true)} />

      <div className="min-h-0 flex-1">
        <ToolHost ref={hostRef} activeId={activeId} />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ToastHost />
    </div>
  );
}
