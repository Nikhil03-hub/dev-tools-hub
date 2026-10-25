// T-204: pure URL parsing and rebuilding on top of the WHATWG URL class.
// Nothing here navigates, requests or resolves anything: the text is only split
// and re-joined. See docs/v3/tasks/P2_tools.md.
import type { Result } from "../result";
import { err, ok } from "../result";
import { isSecretKey } from "../../lib/debugkit/redact";

export interface QueryEntry {
  key: string;
  value: string;
}

export interface UrlParts {
  href: string;
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  segments: string[];
  query: QueryEntry[];
  hash: string;
  origin: string;
  warnings: string[];
}

export type UrlBuildInput = Pick<
  UrlParts,
  "protocol" | "username" | "password" | "hostname" | "port" | "pathname" | "query" | "hash"
>;

/** A bare "example.com/x" is a URL to a reader even without the scheme. */
function looksLikeHost(text: string): boolean {
  return !/\s/.test(text) && (text.includes(".") || /^localhost/i.test(text));
}

export function parseUrlText(text: string): Result<UrlParts> {
  const trimmed = text.trim();
  if (trimmed === "") return err("Paste a URL to break it down.");

  // "localhost:3000" reads as a host and port to anyone, but the URL standard
  // takes `localhost:` for a scheme. Nothing else special-cases: every other
  // leading token is given to the parser as written, so real or exotic schemes
  // (mailto:, data:, chrome-extension://) keep working.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  const hasScheme = schemeMatch !== null && schemeMatch[1].toLowerCase() !== "localhost";

  let candidate = trimmed;
  if (!hasScheme) {
    if (trimmed.startsWith("//")) candidate = `https:${trimmed}`;
    else if (looksLikeHost(trimmed)) candidate = `https://${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return err("This isn't a valid URL.");
  }

  const query: QueryEntry[] = [];
  url.searchParams.forEach((value, key) => query.push({ key, value }));

  const warnings: string[] = [];
  if (url.username !== "" || url.password !== "") {
    warnings.push("Contains a username/password — avoid sharing this URL.");
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { key } of query) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    if (isSecretKey(key)) warnings.push(`Query parameter '${key}' looks like a secret.`);
  }
  for (const key of duplicates) warnings.push(`Duplicate parameter '${key}'.`);

  return ok({
    href: url.href,
    protocol: url.protocol,
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    segments: url.pathname.split("/").filter((s) => s !== ""),
    query,
    hash: url.hash,
    origin: url.origin,
    warnings,
  });
}

/**
 * Re-encoded with encodeURIComponent rather than URLSearchParams.toString(), so a
 * decoded space comes back as %20 rather than "+" — the form the input arrived
 * in, which keeps the rebuilt URL byte-identical for the common case.
 */
function encodeEntry({ key, value }: QueryEntry): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function buildUrl(parts: UrlBuildInput): string {
  const protocol = parts.protocol.endsWith(":") ? parts.protocol : `${parts.protocol}:`;
  const credentials =
    parts.username !== "" || parts.password !== "" ? `${parts.username}:${parts.password}@` : "";
  const port = parts.port === "" ? "" : `:${parts.port}`;
  const pathname =
    parts.pathname === "" || parts.pathname.startsWith("/") ? parts.pathname : `/${parts.pathname}`;
  const search = parts.query.length === 0 ? "" : `?${parts.query.map(encodeEntry).join("&")}`;
  const hash = parts.hash === "" ? "" : parts.hash.startsWith("#") ? parts.hash : `#${parts.hash}`;
  return `${protocol}//${credentials}${parts.hostname}${port}${pathname}${search}${hash}`;
}
