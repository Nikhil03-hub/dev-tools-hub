// Tool registry contract. See docs/v3/ARCHITECTURE.md §4.
// Changing this file needs a DECISIONS.md entry.
import type { ComponentType, RefAttributes } from "react";
import type { ToolHandle } from "../lib/toolHandle";

export type ToolCategory = "debug" | "data" | "text" | "web" | "encoding" | "security" | "time" | "code" | "network";

export const CATEGORY_ORDER: ToolCategory[] = ["debug", "data", "web", "encoding", "security", "text", "time", "code", "network"];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  debug: "Debug & share",
  data: "Data formats",
  web: "Web & HTTP",
  encoding: "Encode & decode",
  security: "Security & crypto",
  text: "Text",
  time: "Date & time",
  code: "Code",
  network: "Network",
};

export interface ToolDocs {
  /** 2–5 short steps shown under the tool and in the static page. */
  howTo: string[];
  /** 1–6 Q&As. Plain text. */
  faq: { q: string; a: string }[];
  /** ids of 2–4 related tools. */
  related: string[];
}

export interface ToolMeta {
  /** Stable, kebab-case, unique, e.g. "yaml-json". */
  id: string;
  /** URL path segment (usually === id), lowercase a-z0-9-. */
  slug: string;
  /** V1 hash route, e.g. "json"; #json redirects to /<slug>/. */
  legacyHash?: string;
  /** H1 and <title> prefix, ≤ 48 chars. */
  title: string;
  /** Sidebar label, ≤ 22 chars. */
  navTitle: string;
  /** Meta description, 70–155 chars, one plain sentence. */
  description: string;
  category: ToolCategory;
  /** Search synonyms for the palette and home search. */
  keywords: string[];
  /** lucide-react icon export name, e.g. "Braces". */
  icon: string;
  status: "stable" | "beta" | "new";
  /** Props for the component, e.g. { panel: "base64" }. */
  initial?: Record<string, string>;
  docs: ToolDocs;
}

export interface ToolProps {
  isActive: boolean;
  initial?: Record<string, string>;
}

export type ToolComponent = ComponentType<ToolProps & RefAttributes<ToolHandle>>;

export interface ToolEntry extends ToolMeta {
  load: () => Promise<{ default: ToolComponent }>;
}
