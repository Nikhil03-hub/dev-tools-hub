// Pure URL → route mapping. The shell reads window.location and passes the
// pieces in; nothing here touches the DOM. See ARCHITECTURE.md §5.

export type PageId = "privacy" | "about" | "cli";

export type Route =
  | { kind: "home" }
  | { kind: "tool"; id: string }
  | { kind: "page"; id: PageId }
  | { kind: "notfound" };

export interface RouteTables {
  /** slug → tool id */
  slugToId: Readonly<Record<string, string>>;
  /** V1 hash (without '#') → slug */
  legacyHashToSlug: Readonly<Record<string, string>>;
  /** page ids that currently exist (e.g. ["privacy", "about"]) */
  pages: readonly PageId[];
}

/** Lower-cases, decodes, drops "index.html", and guarantees leading + trailing "/". */
export function normalizePath(pathname: string): string {
  let p = pathname || "/";
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw on malformed escapes */
  }
  p = p.toLowerCase().replace(/\/index\.html$/, "/").replace(/\/{2,}/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.endsWith("/") && !/\.[a-z0-9]+$/.test(p)) p += "/";
  return p;
}

export function parseRoute(pathname: string, tables: RouteTables): Route {
  const p = normalizePath(pathname);
  if (p === "/") return { kind: "home" };
  const m = /^\/([a-z0-9-]+)\/$/.exec(p);
  if (!m) return { kind: "notfound" };
  const seg = m[1];
  const id = tables.slugToId[seg];
  if (id) return { kind: "tool", id };
  if ((tables.pages as readonly string[]).includes(seg)) return { kind: "page", id: seg as PageId };
  return { kind: "notfound" };
}

/**
 * V1 links looked like https://site/#debug. When the path is "/" and the hash
 * is a known V1 hash, returns the new path ("/debug-report/"); otherwise null.
 */
export function legacyRedirect(pathname: string, hash: string, tables: RouteTables): string | null {
  if (normalizePath(pathname) !== "/") return null;
  const h = (hash || "").replace(/^#\/?/, "").toLowerCase();
  if (!h) return null;
  const slug = tables.legacyHashToSlug[h];
  return slug ? toolPath(slug) : null;
}

export function toolPath(slug: string): string {
  return `/${slug}/`;
}

export function pagePath(id: PageId): string {
  return `/${id}/`;
}
