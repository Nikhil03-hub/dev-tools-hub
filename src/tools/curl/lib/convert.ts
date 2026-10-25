// T-203: turn a cURL command into fetch / axios / Python requests / Go code.
//
// Parsing and redaction are not reimplemented here: they are the same
// `parseCurl` and `Redactor` the Debug Report uses, so "Copy as cURL" from
// DevTools means the same thing in both tools. This file adds only the
// emitters, the option-coverage notes, and the wiring between them.
//
// Why this lives in src/tools/curl/lib rather than src/core/curl: the
// pure-layer gate (scripts/check-boundaries.mjs) forbids the text `fetch(` in
// src/core/** because core must never make a request. A code generator has to
// write that text, and the rule cannot tell emitting from calling. Moving the
// emitter next to the tool keeps the gate intact instead of loosening it, on
// the same precedent as src/tools/json/lib/jsonParse.ts.
import { parseCurl, tokenizeShell } from "../../../lib/debugkit/parse";
import { Redactor } from "../../../lib/debugkit/redact";
import type { Result } from "../../../core/result";
import { err, ok } from "../../../core/result";

export type CurlTarget = "fetch" | "axios" | "python" | "go";

export interface ConvertOptions {
  redact: boolean;
  emails?: boolean;
  ips?: boolean;
}

export interface ConvertResult {
  code: string;
  notes: string[];
  redactions: number;
}

export const CURL_TARGETS: { id: CurlTarget; label: string }[] = [
  { id: "fetch", label: "fetch" },
  { id: "axios", label: "axios" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
];

// Everything parseCurl understands. Anything else is reported, not dropped.
const OPTION_FLAGS = new Set([
  "-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-ascii",
  "--data-urlencode", "--json", "-u", "--user", "--oauth2-bearer", "-b", "--cookie", "-A",
  "--user-agent", "-e", "--referer", "--url", "-G", "--get", "-I", "--head", "-F", "--form",
]);
// Flags from that set in their long form only, so `-dX` style bundles are not
// mistaken for options we handled.
const SHELL_EXPANSION = /\$\(|\$\{|\$[A-Za-z_]|%[A-Za-z_][A-Za-z0-9_]*%|`[^`]*`/;

/** How many characters the value of a supported option consumes. */
const VALUE_FLAGS = new Set(["-X", "--request", "-H", "--header", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "-d", "--json", "-u", "--user", "--oauth2-bearer", "-b", "--cookie", "-A", "--user-agent", "-e", "--referer", "--url", "-F", "--form"]);

interface Request {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  /** Parsed JSON body when there is one; otherwise null. */
  json: unknown | null;
  /** Body text, used when the body is not JSON (or is JSON in Go). */
  text: string | null;
}

/**
 * `curl -H "authorization: Bearer $TOKEN"` is the shape most API docs use. A
 * variable NAME is not a secret — the Redactor itself says so in
 * `isNonSecretValue` — but `redactPair` replaces the authorization value
 * before that check can apply. Redacting it would hand back code that cannot
 * run and contradict the note about shell variables, so a value that is nothing
 * but a scheme plus a reference is passed through untouched. Mixed values
 * ("Bearer abc$TOKEN") are still redacted.
 */
const VARIABLE_PATTERNS = [
  /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/, // $TOKEN / ${TOKEN}
  /^%[A-Za-z_][A-Za-z0-9_]*%$/, // %TOKEN% (cmd)
  /^\{\{.*\}\}$/, // {{ token }}
  /^\$\{\{.*\}\}$/, // ${{ secrets.TOKEN }}
];

/**
 * `curl -H "authorization: Bearer $TOKEN"` is the shape most API docs use. A
 * variable NAME is not a secret — the Redactor itself says so in
 * `isNonSecretValue` — but `redactPair` replaces the authorization value
 * before that check can apply. Redacting it would hand back code that cannot
 * run and contradict the note about shell variables, so a value that is nothing
 * but a scheme plus a reference is passed through untouched. Mixed values
 * ("Bearer abc$TOKEN") are still redacted.
 */
function isVariableReferenceOnly(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  if (parts.length > 2) return false;
  let refs = 0;
  for (const part of parts) {
    if (VARIABLE_PATTERNS.some((re) => re.test(part))) refs++;
    else if (!/^(bearer|basic|token|apikey|digest|negotiate)$/i.test(part)) return false;
  }
  return refs > 0;
}

function redactHeader(redactor: Redactor | null, name: string, value: string): string {
  if (!redactor) return value;
  if (isVariableReferenceOnly(value)) return value;
  return redactor.redactPair(name, value);
}

/**
 * A request header appears once per name in every target language's request
 * model — a JS object literal with a repeated key silently keeps only the last
 * value. HTTP itself joins such values with commas, so that is what is emitted,
 * and the merge is reported instead of passing silently.
 */
function mergeHeaders(list: { name: string; value: string }[]): { merged: { name: string; value: string }[]; joined: string[] } {
  const order: string[] = [];
  const byName = new Map<string, { name: string; value: string }>();
  const joined: string[] = [];
  for (const h of list) {
    const key = h.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { name: h.name, value: h.value });
      order.push(key);
      continue;
    }
    existing.value = `${existing.value}, ${h.value}`;
    if (!joined.includes(existing.name)) joined.push(existing.name);
  }
  return { merged: order.map((k) => byName.get(k) as { name: string; value: string }), joined };
}

function lit(s: string): string {
  return JSON.stringify(s);
}

/** Lines after the first, shifted right — how nested literals stay readable. */
function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
}

/**
 * A Python literal, not the JSON text. JSON's `true` / `false` / `null` are
 * NameErrors in Python, and the spec's "same JSON" wording would emit broken
 * code for any body carrying a boolean.
 */
function pythonLiteral(value: unknown, depth = 1): string {
  const pad = "    ".repeat(depth);
  const close = "    ".repeat(depth - 1);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return lit(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad}${pythonLiteral(v, depth + 1)}`);
    return `[\n${items.join(",\n")},\n${close}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([k, v]) => `${pad}${lit(k)}: ${pythonLiteral(v, depth + 1)}`);
    return `{\n${lines.join(",\n")},\n${close}}`;
  }
  return lit(String(value));
}

/** Which options the command asked for that we do not carry into the output. */
function unsupportedOptions(text: string): string[] {
  const argv = tokenizeShell(text);
  const start = argv.length > 0 && /^curl(\.exe)?$/i.test(argv[0]) ? 1 : 0;
  const ignored: string[] = [];
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-") || a === "-" || /^-\d+$/.test(a)) continue;
    const name = a.split("=")[0];
    if (OPTION_FLAGS.has(name)) {
      if (VALUE_FLAGS.has(name) && !a.includes("=")) i++;
      continue;
    }
    // Long options and bundled short ones (e.g. -sSL) are both "we skipped it".
    ignored.push(name);
    if (a.includes("=")) continue;
    // A flag we do not know may still take a value; not consuming it here keeps
    // the note honest about the flag itself, which is all the user needs.
  }
  return ignored;
}

function hasShellExpansion(text: string): boolean {
  return SHELL_EXPANSION.test(text);
}

function usesFormFields(text: string): boolean {
  return tokenizeShell(text).some((a) => a === "-F" || a === "--form");
}

export function convertCurl(text: string, target: CurlTarget, opts: ConvertOptions): Result<ConvertResult> {
  if (text.trim() === "") return err("Paste a cURL command.");

  const argv = tokenizeShell(text);
  if (argv.length === 0 || !/^curl(\.exe)?$/i.test(argv[0])) {
    return err("This doesn't look like a cURL command.");
  }

  const { exchange, notes: parseNotes } = parseCurl(text, 1);
  const notes: string[] = [...parseNotes];

  const redactor = opts.redact ? new Redactor({ emails: opts.emails ?? true, ips: opts.ips ?? true }) : null;

  // parseCurl always fills these; its return type is Partial<Exchange>, so they
  // are read defensively rather than assumed.
  const redacted = (exchange.requestHeaders ?? []).map((h) => ({
    name: h.name,
    value: redactHeader(redactor, h.name, h.value),
  }));
  const { merged: headers, joined } = mergeHeaders(redacted);
  if (joined.length > 0) {
    notes.push(`Repeated request header${joined.length === 1 ? "" : "s"} ${joined.join(", ")} ${joined.length === 1 ? "was" : "were"} sent twice; the target language holds one value per name, so they are joined with a comma.`);
  }
  const url = redactor ? redactor.redactText(exchange.url ?? "") : (exchange.url ?? "");

  const rawBody = exchange.requestBody ?? null;
  let json: unknown | null = null;
  let bodyText: string | null = null;
  if (rawBody !== null && rawBody !== "") {
    const contentType = headers.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
    if (/json/i.test(contentType)) {
      try {
        const parsed: unknown = JSON.parse(rawBody);
        json = redactor ? redactor.redactJson(parsed) : parsed;
      } catch {
        notes.push("The body is labelled JSON but does not parse, so it is kept as plain text.");
      }
    }
    if (json === null) bodyText = redactor ? redactor.redactText(rawBody) : rawBody;
  }

  const ignored = unsupportedOptions(text);
  if (ignored.length > 0) {
    notes.push(`Ignored cURL options (they do not change the request itself): ${ignored.join(", ")}.`);
  }
  if (usesFormFields(text)) {
    notes.push("This command sends multipart form data. The generated code sends the fields as a plain body instead, so rebuild the multipart part before running it — uploaded files are never read here.");
  }
  if (hasShellExpansion(text)) {
    notes.push("This command contains shell variables or substitutions. They are kept exactly as written and are not expanded.");
  }

  const req: Request = {
    method: exchange.method || (rawBody ? "POST" : "GET"),
    url,
    headers,
    json,
    text: bodyText,
  };

  const redactions = redactor ? redactor.total() : 0;
  if (redactions > 0) {
    notes.push(`Redacted ${redactions} ${redactions === 1 ? "value" : "values"}.`);
  }

  // parseCurl repeats a note per occurrence (one for each -F field, say). The
  // user needs to hear it once.
  const uniqueNotes = [...new Set(notes)];

  return ok({ code: emit(req, target), notes: uniqueNotes, redactions });
}

function bodyExpression(req: Request, as: "json-or-text" | "go-string"): string | null {
  if (as === "go-string") {
    if (req.json !== null) return lit(JSON.stringify(req.json));
    return req.text === null ? null : lit(req.text);
  }
  return req.json !== null ? "json" : req.text !== null ? "text" : null;
}

function emit(req: Request, target: CurlTarget): string {
  if (target === "fetch") return emitFetch(req);
  if (target === "axios") return emitAxios(req);
  if (target === "python") return emitPython(req);
  return emitGo(req);
}

function headerBlockJs(headers: { name: string; value: string }[], keyIndent: number): string {
  const pad = " ".repeat(keyIndent + 2);
  const close = " ".repeat(keyIndent);
  const lines = headers.map((h) => `${pad}${lit(h.name)}: ${lit(h.value)}`);
  return `{\n${lines.join(",\n")}\n${close}}`;
}

function emitFetch(req: Request): string {
  const lines: string[] = [];
  if (req.method !== "GET") lines.push(`  method: ${lit(req.method)}`);
  if (req.headers.length > 0) lines.push(`  headers: ${headerBlockJs(req.headers, 2)}`);
  const body = bodyExpression(req, "json-or-text");
  if (body === "json") lines.push(`  body: JSON.stringify(${indentBlock(JSON.stringify(req.json, null, 2), 2)})`);
  else if (body === "text") lines.push(`  body: ${lit(req.text ?? "")}`);
  // A plain GET with nothing else needs no options object at all.
  if (lines.length === 0) return `const response = await fetch(${lit(req.url)});\nconst data = await response.text();`;
  const open = `const response = await fetch(${lit(req.url)}, {`;
  return `${open}\n${lines.join(",\n")}\n});\nconst data = await response.text();`;
}

function emitAxios(req: Request): string {
  const lines: string[] = [`  method: ${lit(req.method.toLowerCase())}`, `  url: ${lit(req.url)}`];
  if (req.headers.length > 0) lines.push(`  headers: ${headerBlockJs(req.headers, 2)}`);
  const body = bodyExpression(req, "json-or-text");
  if (body === "json") lines.push(`  data: ${indentBlock(JSON.stringify(req.json, null, 2), 2)}`);
  else if (body === "text") lines.push(`  data: ${lit(req.text ?? "")}`);
  return `const response = await axios({\n${lines.join(",\n")}\n});\nconst data = response.data;`;
}

const PYTHON_VERBS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

function emitPython(req: Request): string {
  const lower = req.method.toLowerCase();
  const verb = PYTHON_VERBS.has(lower) ? lower : "request";
  const args: string[] = [];
  if (verb === "request") args.push(`    ${lit(lower.toUpperCase())},`);
  args.push(`    ${lit(req.url)},`);
  if (req.headers.length > 0) {
    args.push(`    headers=${pythonLiteral(Object.fromEntries(req.headers.map((h) => [h.name, h.value])), 2)},`);
  }
  const body = bodyExpression(req, "json-or-text");
  if (body === "json") args.push(`    json=${pythonLiteral(req.json, 2)},`);
  else if (body === "text") args.push(`    data=${lit(req.text ?? "")},`);
  return `import requests\n\nresponse = requests.${verb}(\n${args.join("\n")}\n)\nprint(response.status_code, response.text)`;
}

function emitGo(req: Request): string {
  const needsStrings = req.json !== null || req.text !== null;
  const imports = ["fmt", "io", "net/http", ...(needsStrings ? ["strings"] : [])];
  const importBlock = imports.map((i) => `\t"${i}"`).join("\n");
  const lines: string[] = [];
  if (needsStrings) {
    const goBody = bodyExpression(req, "go-string") ?? '""';
    lines.push(`\tbody := strings.NewReader(${goBody})`);
  }
  lines.push(
    `\treq, err := http.NewRequest(${lit(req.method)}, ${lit(req.url)}, ${needsStrings ? "body" : "nil"})`,
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
  );
  // Add, not Set: it keeps the value exactly as the command supplied it and
  // would hold several values if a name ever reached here unfused.
  for (const h of req.headers) lines.push(`\treq.Header.Add(${lit(h.name)}, ${lit(h.value)})`);
  lines.push(
    "\tresp, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer resp.Body.Close()",
    "\tdata, err := io.ReadAll(resp.Body)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tfmt.Println(resp.Status, string(data))",
  );
  return `package main\n\nimport (\n${importBlock}\n)\n\nfunc main() {\n${lines.join("\n")}\n}`;
}
