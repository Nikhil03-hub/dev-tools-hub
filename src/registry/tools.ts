// Tool registry WIRING: pairs the pure metadata in meta.ts with a lazy loader
// per tool. Kept separate from meta.ts so the static-page generator can import
// the data under Node without touching React or dynamic import().
// See docs/v3/ARCHITECTURE.md §4.
import { TOOL_META } from "./meta";
import type { ToolEntry, ToolComponent } from "./types";
import type { RouteTables } from "../core/router/router";

const LOADERS: Record<string, () => Promise<{ default: ToolComponent }>> = {
  "debug-report": () => import("../tools/debug/DebugReportApp"),
  "json-workbench": () => import("../tools/json/JsonWorkbenchApp"),
  "jwt-decoder": () => import("../tools/jwt/JwtDecoderApp"),
  "regex-tester": () => import("../tools/regex/RegexTesterApp"),
  "timestamp-converter": () => import("../tools/timestamp/TimestampConverterApp"),
  "encode-generate": () => import("../tools/generators/GeneratorsApp"),
};

export const TOOLS: ToolEntry[] = TOOL_META.map((m) => {
  const load = LOADERS[m.id];
  if (!load) throw new Error(`No loader for tool ${m.id}`);
  return { ...m, load };
});

// Built once: these tables are static for the life of the page.
const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
const BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));
const BY_LEGACY_HASH = new Map(TOOLS.filter((t) => t.legacyHash).map((t) => [t.legacyHash as string, t]));

export function getTool(id: string): ToolEntry | undefined {
  return BY_ID.get(id);
}

export function getToolBySlug(slug: string): ToolEntry | undefined {
  return BY_SLUG.get(slug);
}

export function getToolByLegacyHash(h: string): ToolEntry | undefined {
  return BY_LEGACY_HASH.get(h.replace(/^#\/?/, "").toLowerCase());
}

export const ROUTE_TABLES: RouteTables = {
  slugToId: Object.fromEntries(TOOLS.map((t) => [t.slug, t.id])),
  legacyHashToSlug: Object.fromEntries(TOOLS.filter((t) => t.legacyHash).map((t) => [t.legacyHash as string, t.slug])),
  pages: ["privacy", "about"],
};
