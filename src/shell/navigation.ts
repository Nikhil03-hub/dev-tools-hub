// Path-based routing for the V3 shell. The app is a static site with one real
// HTML file per tool, so links must be real <a href="/slug/"> elements that work
// without JavaScript and get intercepted only for a plain left click.
// See docs/v3/ARCHITECTURE.md §5.
import type { Route, RouteTables } from "../core/router/router";
import { normalizePath, parseRoute } from "../core/router/router";

export const NAV_EVENT = "dth:navigate";

export function currentRoute(tables: RouteTables): Route {
  return parseRoute(window.location.pathname, tables);
}

export function navigate(path: string): void {
  const next = normalizePath(path);
  if (next === normalizePath(window.location.pathname)) return;
  window.history.pushState(null, "", next);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function onRouteChange(cb: () => void): () => void {
  const onPop = () => cb();
  window.addEventListener("popstate", onPop);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", onPop);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

// Only a plain left click navigates in-app: modified clicks (new tab, download,
// middle click) must keep the browser's native behaviour.
export function interceptLinkClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }, path: string): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
}
