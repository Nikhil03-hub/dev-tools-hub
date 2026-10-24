// Pure "paste anything" detection. No DOM, no network, no timers: the home page
// calls it on debounced input and nothing else. Input is untrusted text and is
// never stored here — only a bounded prefix is inspected.
// Rules and confidences come from docs/v3/tasks/P1_foundation.md (T-106).
import { Redactor } from "../../lib/debugkit/redact";

export interface Detection {
  toolId: string;
  confidence: number;
  label: string;
  hint?: "base64" | "url";
}

const SCAN_LIMIT = 200_000;
const MAX_RESULTS = 3;
const MIN_CONFIDENCE = 0.5;

const JWT_ONLY = /^(?:Bearer\s+)?eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/;
const HTTP_FIRST_LINE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+ HTTP\/|^HTTP\/\d(?:\.\d)? \d{3}/;
const LOG_NOISE = /ERROR|WARN|Exception|Traceback|panic:/;
const LOG_TIME = /^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const URL_ENCODED = /%[0-9A-Fa-f]{2}/;
const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/;

function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** HAR = parseable JSON whose `log.entries` is an array. */
function looksLikeHar(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return false;
    const log = (parsed as { log?: unknown }).log;
    if (typeof log !== "object" || log === null) return false;
    return Array.isArray((log as { entries?: unknown }).entries);
  } catch {
    return false;
  }
}

function looksLikeLog(text: string): boolean {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) return false;
  const hits = lines.filter((line) => LOG_NOISE.test(line) || LOG_TIME.test(line)).length;
  return hits / lines.length >= 0.3;
}

export function detectInput(text: string, availableIds?: ReadonlySet<string>): Detection[] {
  const head = text.length > SCAN_LIMIT ? text.slice(0, SCAN_LIMIT) : text;
  const trimmed = head.trim();
  if (!trimmed) return [];

  const found: (Detection & { row: number })[] = [];
  const add = (d: Detection, row: number) => {
    if (d.confidence < MIN_CONFIDENCE) return;
    if (availableIds && !availableIds.has(d.toolId)) return;
    found.push({ ...d, row });
  };

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const parsedOk = looksLikeJson(trimmed);

  if (JWT_ONLY.test(trimmed)) add({ toolId: "jwt-decoder", confidence: 0.95, label: "Looks like a JWT" }, 1);

  if (/^curl\s/i.test(trimmed)) {
    add({ toolId: "debug-report", confidence: 0.9, label: "Looks like a cURL command" }, 2);
    add({ toolId: "curl-converter", confidence: 0.7, label: "Looks like a cURL command" }, 3);
  }

  if (looksLikeHar(trimmed)) add({ toolId: "debug-report", confidence: 0.95, label: "Looks like a HAR file" }, 4);

  // A bare timestamp parses as a JSON number; that is not "JSON" to a person.
  if (parsedOk && !/^\d+$/.test(trimmed)) add({ toolId: "json-workbench", confidence: 0.9, label: "Looks like JSON" }, 5);

  if (HTTP_FIRST_LINE.test(firstLine)) add({ toolId: "debug-report", confidence: 0.85, label: "Looks like an HTTP message" }, 6);

  if (looksLikeLog(trimmed)) add({ toolId: "debug-report", confidence: 0.75, label: "Looks like a log" }, 7);

  if (/^\d{10}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) {
    add({ toolId: "timestamp-converter", confidence: 0.9, label: "Looks like a Unix timestamp" }, 8);
  }

  if (trimmed.length >= 16 && URL_ENCODED.test(trimmed)) {
    add({ toolId: "encode-generate", confidence: 0.6, label: "Looks URL-encoded", hint: "url" }, 9);
  }

  if (trimmed.length >= 16 && trimmed.length % 4 === 0 && BASE64_SHAPE.test(trimmed)) {
    add({ toolId: "encode-generate", confidence: 0.55, label: "Looks like Base64", hint: "base64" }, 10);
  }

  if (trimmed.length >= 3 && trimmed.startsWith("/") && trimmed.endsWith("/")) {
    add({ toolId: "regex-tester", confidence: 0.5, label: "Looks like a regex" }, 11);
  }

  return found
    .sort((a, b) => b.confidence - a.confidence || a.row - b.row)
    .slice(0, MAX_RESULTS)
    .map(({ row: _row, ...rest }) => rest);
}

/**
 * Counts likely secrets so the home page can warn before someone pastes a
 * token into a tool and shares the result. Bounded to the same 200k prefix;
 * returns category names only, never the values.
 */
export function countLikelySecrets(text: string): { total: number; categories: string[] } {
  const head = text.length > SCAN_LIMIT ? text.slice(0, SCAN_LIMIT) : text;
  if (!head.trim()) return { total: 0, categories: [] };
  try {
    const redacted = new Redactor({ emails: true, ips: true }).redactText(head);
    const categories = new Set<string>();
    let total = 0;
    for (const match of redacted.matchAll(/<([A-Za-z][A-Za-z0-9 ]*)_(\d+)>/g)) {
      categories.add(match[1]);
      total += 1;
    }
    return { total, categories: [...categories] };
  } catch {
    return { total: 0, categories: [] };
  }
}
