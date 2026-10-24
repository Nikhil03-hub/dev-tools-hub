import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CommandPalette, { type Command } from "./components/CommandPalette";
import ToastHost from "./components/ToastHost";
import Sidebar, { readCollapsedPref, writeCollapsedPref } from "./shell/Sidebar";
import TopBar from "./shell/TopBar";
import MobileDrawer from "./shell/MobileDrawer";
import ToolHost, { type ToolHostHandle } from "./shell/ToolHost";
import HomePage from "./shell/HomePage";
import StaticPage from "./shell/StaticPage";
import { setHandoff } from "./shell/handoff";
import useMediaQuery from "./shell/useMediaQuery";
import useRecentTools from "./shell/useRecentTools";
import { TOOLS, ROUTE_TABLES, getTool } from "./registry/tools";
import { STATIC_PAGES, type StaticPage as StaticPageData } from "./registry/pages";
import { legacyRedirect, toolPath, type Route } from "./core/router/router";
import { currentRoute, interceptLinkClick, navigate, onRouteChange } from "./shell/navigation";

const DEFAULT_TOOL = "json-workbench";
const HOME_TITLE = "Dev Tools Hub: private developer tools that run in your browser";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => {
    const redirect = legacyRedirect(window.location.pathname, window.location.hash, ROUTE_TABLES);
    if (redirect) window.history.replaceState(null, "", redirect);
    return currentRoute(ROUTE_TABLES);
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = readCollapsedPref();
    if (stored !== null) return stored;
    // Tablet (768–1023) starts as an icon rail. Desktop starts expanded.
    // Below 768 there is no sidebar at all, so the stored default must not
    // leak into the drawer — the drawer is always rendered expanded.
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const hasSidebar = window.matchMedia("(min-width: 768px)").matches;
    return hasSidebar && !wide;
  });

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const hostRef = useRef<ToolHostHandle>(null);

  // The ToolHost always keeps the last real tool mounted (hidden on other
  // routes) so switching to the home page never discards a pasted input.
  const activeId = route.kind === "tool" ? route.id : DEFAULT_TOOL;
  const recent = useRecentTools(route.kind === "tool" ? route.id : null);
  const staticPage: StaticPageData | null =
    route.kind === "page"
      ? STATIC_PAGES.find((p) => p.id === route.id) ?? null
      : route.kind === "notfound"
        ? STATIC_PAGES.find((p) => p.id === "notfound") ?? null
        : null;

  useEffect(() => onRouteChange(() => setRoute(currentRoute(ROUTE_TABLES))), []);

  useEffect(() => {
    if (route.kind === "tool") {
      const tool = getTool(route.id);
      document.title = tool ? `${tool.title} · Dev Tools Hub` : HOME_TITLE;
      return;
    }
    document.title = staticPage ? staticPage.title : HOME_TITLE;
  }, [route, staticPage]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      writeCollapsedPref(!v);
      return !v;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "[" && !meta && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  // A drawer that survives a resize into desktop would leave a second copy of
  // every tool link in the DOM; close it as soon as the sidebar exists.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  function openTool(id: string, e?: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) {
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

  const renderSidebar = (opts: { collapsed: boolean; onToggleCollapsed?: () => void }) => (
    <Sidebar
      activeId={activeId}
      collapsed={opts.collapsed}
      onToggleCollapsed={opts.onToggleCollapsed}
      onOpenPalette={() => setPaletteOpen(true)}
      recent={recent}
      onNavigate={() => setDrawerOpen(false)}
    />
  );

  return (
    <div
      className="grid h-screen overflow-hidden bg-canvas"
      style={{ gridTemplateColumns: isDesktop ? `${collapsed ? 56 : 248}px 1fr` : "1fr" }}
    >
      {isDesktop && (
        <div className="h-screen min-h-0 overflow-hidden">
          {renderSidebar({ collapsed, onToggleCollapsed: toggleCollapsed })}
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <TopBar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenMenu={() => setDrawerOpen(true)}
          showMenu={!isDesktop}
        />
        <div className={route.kind === "tool" ? "min-h-0 flex-1" : "hidden"}>
          <ToolHost ref={hostRef} activeId={activeId} />
        </div>

        {route.kind !== "tool" && (
          <main className="min-h-0 flex-1 overflow-y-auto">
            {route.kind === "home" ? (
              <HomePage
                recent={recent}
                onPick={(toolId, text, hint) => {
                  const tool = getTool(toolId);
                  if (!tool) return;
                  setHandoff(toolId, text, hint);
                  navigate(toolPath(tool.slug));
                }}
                onOpenTool={(id) => openTool(id)}
              />
            ) : staticPage ? (
              <StaticPage page={staticPage} onOpenPalette={() => setPaletteOpen(true)} />
            ) : null}
          </main>
        )}
      </div>

      {!isDesktop && drawerOpen && (
        <MobileDrawer onClose={() => setDrawerOpen(false)}>{renderSidebar({ collapsed: false })}</MobileDrawer>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ToastHost />
    </div>
  );
}
