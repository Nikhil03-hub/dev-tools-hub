import type { ReactNode } from "react";
import { Circle, Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Kbd from "../components/Kbd";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../registry/types";
import { TOOLS, getTool } from "../registry/tools";
import { ICONS } from "../registry/icons";
import { interceptLinkClick } from "./navigation";

const SIDEBAR_KEY = "dth.sidebar";
const RECENT_SHOWN = 5;

/** "collapsed" | "expanded"; anything unreadable falls back to "auto". */
export function readCollapsedPref(): boolean | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY);
    if (raw === "collapsed") return true;
    if (raw === "expanded") return false;
  } catch {
    /* fall through */
  }
  return null;
}

export function writeCollapsedPref(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* preference simply does not persist */
  }
}

function ToolIcon({ name, className }: { name: string; className: string }) {
  const Icon = (ICONS as Record<string, typeof Circle>)[name] ?? Circle;
  return <Icon className={className} strokeWidth={2} aria-hidden="true" />;
}

function Item({
  href,
  label,
  testId,
  active,
  collapsed,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  testId: string;
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      onClick={(e) => {
        interceptLinkClick(e, href);
        onNavigate?.();
      }}
      className={`focus-ring group relative flex h-8 items-center gap-2 rounded-md pr-2 text-[13px] transition-colors ${
        collapsed ? "justify-center px-0" : "pl-2"
      } ${active ? "bg-accent-soft font-medium text-accent" : "text-ink-dim hover:bg-raised hover:text-ink"}`}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-1.5 h-5 w-0.5 rounded-full bg-accent" />}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  );
}

export default function Sidebar({
  activeId,
  collapsed,
  onToggleCollapsed,
  onOpenPalette,
  recent,
  onNavigate,
}: {
  activeId: string;
  collapsed: boolean;
  /** Omitted inside the mobile drawer: a drawer cannot be collapsed. */
  onToggleCollapsed?: () => void;
  onOpenPalette: () => void;
  recent: string[];
  onNavigate?: () => void;
}) {
  const recentTools = recent.map((id) => getTool(id)).filter((t) => t !== undefined).slice(0, RECENT_SHOWN);

  return (
    <aside className="flex h-full flex-col border-r border-border-subtle bg-canvas">
      <div className={`flex h-[52px] shrink-0 items-center ${collapsed ? "justify-center" : "gap-2 px-3"}`}>
        <a
          href="/"
          onClick={(e) => {
            interceptLinkClick(e, "/");
            onNavigate?.();
          }}
          className="focus-ring flex items-center gap-2 rounded-md"
          aria-label="Dev Tools Hub home"
        >
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-accent-strong font-mono text-[12px] font-bold text-on-accent">
            {"{}"}
          </span>
          {!collapsed && <span className="whitespace-nowrap text-[13px] font-semibold text-ink">Dev Tools Hub</span>}
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Item
          href="/"
          label="Home"
          testId="nav-home"
          active={false}
          collapsed={collapsed}
          icon={<Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          onNavigate={onNavigate}
        />

        {recentTools.length > 0 && (
          <section className="mt-4">
            {!collapsed && (
              <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Recent</h2>
            )}
            <div className="flex flex-col gap-0.5">
              {recentTools.map((t) => (
                <Item
                  key={`recent-${t.id}`}
                  href={`/${t.slug}/`}
                  label={t.navTitle}
                  testId={`recent-${t.id}`}
                  active={false}
                  collapsed={collapsed}
                  icon={<ToolIcon name={t.icon} className="h-4 w-4" />}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        )}

        <nav data-testid="tool-switcher" aria-label="Tools" className="mt-4">
          {CATEGORY_ORDER.map((category) => {
            const tools = TOOLS.filter((t) => t.category === category);
            if (tools.length === 0) return null;
            return (
              <section key={category} className="mb-3">
                {!collapsed && (
                  <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                    {CATEGORY_LABELS[category]}
                  </h2>
                )}
                <div className="flex flex-col gap-0.5">
                  {tools.map((t) => (
                    <Item
                      key={t.id}
                      href={`/${t.slug}/`}
                      label={t.navTitle}
                      testId={t.legacyHash ? `tool-tab-${t.legacyHash}` : `nav-${t.id}`}
                      active={t.id === activeId}
                      collapsed={collapsed}
                      icon={<ToolIcon name={t.icon} className="h-4 w-4" />}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className={`focus-ring flex h-8 w-full items-center rounded-md text-[12px] text-ink-dim transition-colors hover:bg-raised hover:text-ink ${
            collapsed ? "justify-center px-0" : "gap-2 px-2"
          }`}
          data-testid="btn-sidebar-palette"
        >
          <span className="shrink-0">
            <Kbd keys={["mod", "K"]} />
          </span>
          {!collapsed && <span className="truncate">Commands</span>}
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`focus-ring mt-1 flex h-8 w-full items-center rounded-md text-[12px] text-ink-faint transition-colors hover:bg-raised hover:text-ink ${
              collapsed ? "justify-center px-0" : "justify-end px-2"
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-testid="btn-collapse-sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        )}
        {!collapsed && <p className="px-2 pb-0.5 pt-1 text-[11px] text-ink-faint">v3.0 · MIT</p>}
      </div>
    </aside>
  );
}
