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
// T-201 detector rule. Two deliberate widenings of the spec's
// `^\s*(- |[\w"'.-]+:\s)`, both against measured false negatives on real files:
// a block-mapping parent (`metadata:`) has nothing after the colon, and comments
// carry no structure, so they stay out of the denominator. The first line must
// also look like YAML, which is what keeps an HTTP message out.
const YAML_LINE = /^\s*(- |[\w"'.-]+:(\s|$))/;
const YAML_FIRST = /^\s*(#|---|- |[\w"'.-]+:)/;
const YAML_COMMENT = /^\s*#/;

// T-205 detector. Shape first, then the field alphabet: "a: 1 2 3 4" has five
// spaces-separated tokens but is not cron, and the charset test is what keeps
// YAML, logs and prose from claiming this tool.
const CRON_SHAPE = /^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$|^(?:\S+\s+){4,5}\S+$/;
const CRON_FIELD = /^[\d*/,\-?LW#A-Za-z]+$/;
// The spec's field alphabet is letters as well as digits, so on its own
// "the quick brown fox jumps" is a five-field schedule. Requiring one field to
// hold a digit or a cron operator keeps real expressions and drops sentences.
const CRON_STRUCTURED = /[\d*/,\-?]/;

function looksLikeCron(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "" || !CRON_SHAPE.test(trimmed)) return false;
  if (trimmed.startsWith("@")) return true;
  const fields = trimmed.split(/\s+/);
  if (fields.length > 6) return false;
  return fields.every((f) => CRON_FIELD.test(f)) && fields.some((f) => CRON_STRUCTURED.test(f));
}

// T-206 detector. The spec's rule is "at least 2 of the first 5 lines share a
// field count of 2 or more". Two tightenings keep prose, logs and pretty JSON
// out of a CSV suggestion, both documented in docs/v3/reports/T-206.md: records
// are counted with quotes honoured (so a value containing a newline is still
// one record) and every inspected record has to agree, not just two of them.
// The second half of the guard is typographic — in English a comma is always
// followed by a space, while a CSV export has the next field straight after it,
// so a file whose delimiters are *all* followed by spaces is treated as prose.
function scanCsvRecords(text: string, d: string, maxRecords: number): { counts: number[]; tight: boolean } {
  const counts: number[] = [];
  let fields = 1;
  let quoted = false;
  let hasContent = false;
  let tight = false;
  const isSpace = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\n" || c === "\r";
  for (let i = 0; i < text.length && counts.length < maxRecords; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') i++;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      hasContent = true;
    } else if (ch === d) {
      fields++;
      hasContent = true;
      if (!isSpace(text[i + 1])) tight = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (hasContent) {
        counts.push(fields);
        fields = 1;
        hasContent = false;
      }
    } else if (ch !== " ") {
      hasContent = true;
    }
  }
  if (hasContent && counts.length < maxRecords) counts.push(fields);
  return { counts, tight };
}

function looksLikeCsv(text: string): boolean {
  for (const d of [",", ";", "\t", "|"]) {
    const { counts, tight } = scanCsvRecords(text, d, 5);
    if (counts.length >= 2 && tight && counts.every((c) => c >= 2 && c === counts[0])) return true;
  }
  return false;
}

function looksLikeYaml(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !YAML_COMMENT.test(l));
  if (lines.length < 2 || !YAML_FIRST.test(lines[0])) return false;
  const matching = lines.filter((l) => YAML_LINE.test(l)).length;
  return matching / lines.length >= 0.6;
}

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

  // A regex literal may carry flags (/foo/gi). Without the optional flag group
  // the flag-preserving hand-off below would be unreachable from the only place
  // a hand-off can start.
  if (trimmed.length >= 3 && /^\/.+\/[dgimsuvy]*$/.test(trimmed)) {
    add({ toolId: "regex-tester", confidence: 0.5, label: "Looks like a regex" }, 11);
  }

  // A whole line that is exactly one http(s) URL. Anchored at both ends on
  // purpose: "curl https://…" belongs to the cURL rules, and a log line that
  // merely mentions a URL belongs to Debug Report.
  if (/^https?:\/\/\S+$/.test(trimmed)) {
    add({ toolId: "url-parser", confidence: 0.8, label: "Looks like a URL" }, 13);
  }

  // YAML is the one format here with no single-line signature, so the rule is
  // structural, and JSON never reaches it.
  if (!parsedOk && looksLikeYaml(trimmed)) {
    add({ toolId: "yaml-json", confidence: 0.65, label: "Looks like YAML" }, 12);
  }

  if (!parsedOk && looksLikeCron(trimmed)) {
    add({ toolId: "cron", confidence: 0.7, label: "Looks like a cron expression" }, 14);
  }

  // Pretty-printed JSON is structurally a grid of commas, so it is excluded by
  // shape as well as by having parsed cleanly.
  if (!parsedOk && !trimmed.startsWith("{") && !trimmed.startsWith("[") && looksLikeCsv(trimmed)) {
    add({ toolId: "csv-json", confidence: 0.6, label: "Looks like CSV" }, 15);
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
