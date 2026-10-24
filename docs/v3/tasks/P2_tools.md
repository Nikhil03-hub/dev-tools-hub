# Phase 2: core tools (batch A: T-201 … T-206, batch B: T-211 … T-226)

Every task here follows **the tool recipe** in `IMPLEMENTATION_PLAN.md` §3. A spec gives you:
- the registry entry, copied verbatim into `src/registry/meta.ts`;
- the pure API;
- an examples table, whose rows become unit tests with **exact** expected output;
- the UI pattern;
- dependencies;
- detector rules;
- the e2e checks.

**Shared rules for all P2 tools:**
- Pure logic may import `src/core/**`, pure `src/lib/*.ts` files and pure `src/tools/*/lib/*.ts` files, e.g. `parseJsonWithDiagnostics` from `src/tools/json/lib/jsonParse.ts`.
- JSON input is always parsed with `parseJsonWithDiagnostics`, so errors have a line and column.
- Live update: debounced 150 ms. Inputs over 1,000,000 characters switch to a manual **Convert** button (`data-testid="<id>-run"`) instead of live mode.
- Every tool has an empty state with samples, Copy for the output (`data-testid="<id>-copy"`) and, where it makes sense, Download.
- Every tool's main input has `data-testid="<id>-input"` and its main output `data-testid="<id>-output"`.
- Palette commands: at least "Load sample", "Copy output", "Clear".
- e2e for every tool, in its own section inserted immediately before `await browser.close();`, using `newCheckedPage(context)`:
  - `<id>_loads` (goto `/<slug>/`, H1 visible);
  - `<id>_main` (the main example from the table produces the exact output);
  - `<id>_error` (malformed input shows the error text with its line number);
  - `<id>_copy` (clipboard equals output);
  - `<id>_no_console_errors`.
- After adding the registry entry, also add the tool to `LOADERS` in `src/registry/tools.ts`. `npm run check:registry` must pass.

---

## Batch A

### T-201: YAML ⇄ JSON converter

**Registry:**
```ts
{ id: "yaml-json", slug: "yaml-to-json", title: "YAML to JSON Converter (and back)", navTitle: "YAML ⇄ JSON",
  description: "Convert YAML to JSON and JSON to YAML with exact error lines, multi-document support and safe alias limits. Runs in your browser.",
  category: "data", keywords: ["yaml", "yml", "json", "convert", "kubernetes", "docker compose", "config"], icon: "ArrowLeftRight", status: "new",
  docs: { howTo: ["Paste YAML or JSON on the left.", "Pick the direction with the ⇄ switch (it is detected when you paste).", "Copy or download the result."],
    faq: [{ q: "Why does 'yes' stay a string?", a: "This tool follows YAML 1.2, where yes/no/on/off are plain strings. Only true and false are booleans." },
          { q: "What about multiple documents (---)?", a: "Each document becomes one item of a JSON array, and you get a note saying so." }],
    related: ["json-workbench", "csv-json", "toml-json"] } }
```
`related` may name tools that are added later, but `check:registry` requires the ids to exist. Until `csv-json` and `toml-json` exist, use `["json-workbench", "debug-report"]`. The task that adds a tool updates the `related` lists that should mention it.

**Dependency:** `yaml@2.9.1` (ISC).

**API:** `src/core/yaml/yaml.ts`
```ts
export function yamlToJson(src: string, indent: 2 | 4 = 2): Result<{ json: string; documents: number; notes: string[] }>;
export function jsonToYaml(src: string, indent: 2 | 4 = 2): Result<string>;
export function guessDirection(src: string): "yaml-to-json" | "json-to-yaml"; // trimmed starts with { or [ and parses as JSON → json-to-yaml
```
- Use `YAML.parseAllDocuments(src, { prettyErrors: true })`.
- The first `doc.errors[0]` gives the error: message = the first line of `e.message`; line/column = `e.linePos[0].line` / `.col`.
- `doc.toJS({ maxAliasCount: 100 })` can throw on alias bombs. Catch it and return the error "Too many aliases — this looks like a YAML bomb, so it was not expanded."
- Multiple documents: `json` is an array of each document and `notes` = `["3 YAML documents were combined into one JSON array."]`.
- `jsonToYaml` uses `YAML.stringify(value, { indent })`.

**Examples (exact):**

| In | Fn | Out |
|---|---|---|
| `a: 1\nb: [x, y]` | yamlToJson(…, 2) | `{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}` |
| `{"a":1,"b":["x"],"c":{"d":null,"e":"yes"}}` | jsonToYaml | `a: 1\nb:\n  - x\nc:\n  d: null\n  e: yes\n` |
| `a: 1\n---\nb: 2\n` | yamlToJson | json `[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]`, documents 2, one note |
| `a: [1, 2\nb: 3` | yamlToJson | error, line 2, column 1 |
| `a: 1\na: 2` | yamlToJson | error message contains "unique" (duplicate key) |
| `n: 0x1F\nd: 2026-10-22` | yamlToJson | `{\n  "n": 31,\n  "d": "2026-10-22"\n}` |
| the alias bomb `a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]` (verified 2026-10-22 to make `toJS({ maxAliasCount: 100 })` throw) | yamlToJson | error "Too many aliases…" |

**UI.** Convert pattern:
- the input pane header has a Segmented control "YAML → JSON" / "JSON → YAML" (`data-testid="yaml-json-direction"`), auto-set on paste via `guessDirection`;
- indent select 2 or 4;
- the output is a read-only CodeArea;
- notes show under the output.

**Detector.** Text with no JSON parse, ≥ 2 lines, and ≥ 60% of non-empty lines matching `^\s*(- |[\w"'.-]+:\s)` → `yaml-json`, confidence 0.65, label "Looks like YAML".

---

### T-202: Text diff

**Registry:**
```ts
{ id: "text-diff", slug: "text-diff", title: "Text Diff Checker", navTitle: "Text Diff",
  description: "Compare two texts line by line, word by word or character by character, side by side or inline. Export a .patch file. Nothing is uploaded.",
  category: "text", keywords: ["diff", "compare", "difference", "patch", "changes", "merge"], icon: "FileDiff", status: "new",
  docs: { howTo: ["Paste the original text on the left and the changed text on the right.", "Pick lines, words or characters, and side-by-side or inline view.", "Download a unified .patch if you need one."],
    faq: [{ q: "How big can the texts be?", a: "Line mode handles tens of thousands of lines. Very different large texts may stop after 2 seconds and ask you to narrow them down." }],
    related: ["json-workbench", "regex-tester"] } }
```
**Dependency:** `diff@9.0.0` (BSD-3-Clause).

**API:** `src/core/diff/diff.ts`
```ts
export type DiffMode = "line" | "word" | "char";
export interface DiffPart { kind: "same" | "added" | "removed"; value: string }
export interface DiffResult { parts: DiffPart[]; added: number; removed: number; unchanged: number } // counts in units of the mode (lines/words/chars)
export function computeDiff(a: string, b: string, opts: { mode: DiffMode; ignoreWhitespace?: boolean; ignoreCase?: boolean }): Result<DiffResult>;
export function unifiedPatch(a: string, b: string, nameA = "original.txt", nameB = "changed.txt"): string; // createTwoFilesPatch
```
- `line` uses `diffLines(a, b, { ignoreWhitespace, ignoreCase, timeout: 2000 })`;
- `word` uses `diffWordsWithSpace` (or `diffWords` when ignoreWhitespace);
- `char` uses `diffChars` and is refused when either side is over 50,000 characters ("Character mode is limited to 50,000 characters per side.");
- a timeout returns `undefined`. Map it to the error "These texts are too different to compare quickly. Try line mode or a smaller part."

**Examples:**

| a | b | mode | parts (kind:value) |
|---|---|---|---|
| `a\nb\nc\n` | `a\nB\nc\nd\n` | line | same:`a\n`, removed:`b\n`, added:`B\n`, same:`c\n`, added:`d\n` |
| `the quick fox` | `the slow fox` | word | same:`the `, removed:`quick`, added:`slow`, same:` fox` |
| `abc` | `abc` | char | one same part, added 0, removed 0 |

**UI.** Compare pattern:
- two inputs (`text-diff-a`, `text-diff-b`);
- mode Segmented, an "Ignore whitespace" Toggle and a view Segmented (Side by side / Inline);
- the result (`text-diff-output`) colours added text with a `bg-ok/15` background and removed text with `bg-err/15`, and strikes through removed text in inline view;
- stats line "+3 −1 lines";
- Swap button and Download .patch button.

---

### T-203: cURL converter (with secret redaction)

**Registry:**
```ts
{ id: "curl-converter", slug: "curl-converter", title: "cURL to Code Converter", navTitle: "cURL Converter",
  description: "Turn a cURL command into fetch, axios, Python requests or Go code, with tokens and passwords redacted by default. Runs in your browser.",
  category: "debug", keywords: ["curl", "convert", "fetch", "axios", "python", "requests", "go", "http client", "copy as curl"], icon: "Terminal", status: "new",
  docs: { howTo: ["Paste a cURL command (Chrome/Firefox 'Copy as cURL' works, bash or cmd style).", "Pick the language.", "Secrets are replaced with placeholders unless you turn redaction off."],
    faq: [{ q: "Why are my tokens replaced?", a: "So you can paste the code into a chat, issue or docs without leaking credentials. Turn redaction off to get runnable code." },
          { q: "Which cURL options are supported?", a: "Method, URL, headers, data/body, basic auth (-u) and cookies (-b). Anything else is listed as a note." }],
    related: ["debug-report", "jwt-decoder", "json-workbench"] } }
```
**Dependency:** none. Use `parseCurl` from `src/lib/debugkit/parse.ts` and `Redactor` from `src/lib/debugkit/redact.ts`. Read both files first; do not modify them.

**API:** `src/core/curl/convert.ts`
```ts
export type CurlTarget = "fetch" | "axios" | "python" | "go";
export function convertCurl(text: string, target: CurlTarget, opts: { redact: boolean; emails?: boolean; ips?: boolean }): Result<{ code: string; notes: string[]; redactions: number }>;
```
- When `opts.redact` is set: create one `Redactor`, and pass every header value through `redactor.redactPair(name, value)`, the URL through `redactText` and the body through `redactText` (JSON bodies through `redactJson`). `redactions` = `redactor.total()`.
- String literals in every language are produced with `JSON.stringify(s)`. Its output is valid in JS, Python 3 and Go.
- A JSON body (Content-Type contains `json` and the body parses) is emitted natively:
  - fetch/axios: an object literal formatted with `JSON.stringify(obj, null, 2)`, indented to fit;
  - python: `json=` with the same JSON;
  - go: a string literal.
- Methods are uppercase in fetch, Python and Go (`"POST"`, `requests.post`, `http.NewRequest("POST", …)`), and lowercase in axios (`method: "post"`, the axios convention). The default is GET, or POST when there is a body.
- `notes` = `parseCurl` notes plus "Redacted N values." when N > 0.

**Exact output template (fetch)**, for `curl -X POST https://api.example.com/v1/items -H 'Content-Type: application/json' -d '{"name":"x"}'` with redact on:
```js
const response = await fetch("https://api.example.com/v1/items", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    "name": "x"
  })
});
const data = await response.text();
```
- axios: `const response = await axios({ method: "post", url: …, headers: {…}, data: {…} });`, each key on its own line in the same style.
- python: `import requests` / a blank line / `response = requests.post(` with lines `    "url",`, `    headers={…},` and `    json={…},`, then `)` and `print(response.status_code, response.text)`.
- go: `package main` with `import ("fmt"; "io"; "net/http"; "strings")` written as a multi-line import block, a `func main()` that builds the request with `http.NewRequest`, sets headers, does `http.DefaultClient.Do(req)`, and prints the status and body, with error checks (`if err != nil { panic(err) }`).

**Tests:**
- the example above, exactly;
- an Authorization Bearer header: the output contains a `<` placeholder and never the raw token, with redact on; the raw token is present with redact off;
- `-u user:pass`: the output never contains `pass` with redact on;
- cmd-style `^"` quoting (copy from the existing debugkit tests);
- empty input → error "Paste a cURL command.";
- a non-curl input → error "This doesn't look like a cURL command.".

**UI:**
- Analyze pattern: input left, output right;
- Segmented target selector (`curl-converter-target`);
- Toggle "Redact secrets" (`curl-converter-redact`, default on). When off, show a `warn` line "Output contains your real credentials.";
- notes list under the output.

**Detector.** Append `curl-converter` 0.7 "Convert cURL to code" (rule already listed in T-106).

---

### T-204: URL parser and query-string editor

**Registry:**
```ts
{ id: "url-parser", slug: "url-parser", title: "URL Parser and Query String Editor", navTitle: "URL Parser",
  description: "Split a URL into protocol, host, path, query parameters and fragment, edit parameters in a table, and rebuild the encoded URL.",
  category: "web", keywords: ["url", "query string", "parameters", "parse", "decode", "uri", "utm"], icon: "Link", status: "new",
  docs: { howTo: ["Paste a URL.", "Edit, add or remove query parameters in the table.", "Copy the rebuilt URL."],
    faq: [{ q: "Does it follow the link?", a: "No. It only parses the text; nothing is requested." }],
    related: ["encode-generate", "curl-converter", "debug-report"] } }
```
When this task adds `url-parser`, also replace `json-workbench` with `url-parser` in `curl-converter`'s `related` list.

**API:** `src/core/url/url.ts`. Use the WHATWG `URL` class (available in Node and browsers).
```ts
export interface UrlParts { href: string; protocol: string; username: string; password: string; hostname: string; port: string;
  pathname: string; segments: string[]; query: { key: string; value: string }[]; hash: string; origin: string; warnings: string[] }
export function parseUrlText(text: string): Result<UrlParts>; // trims; adds "https://" if no scheme and it looks like a host (contains a dot, no spaces)
export function buildUrl(parts: Pick<UrlParts, "protocol" | "username" | "password" | "hostname" | "port" | "pathname" | "query" | "hash">): string;
```
Warnings:
- "Contains a username/password — avoid sharing this URL." when there are credentials;
- for every query key where `isSecretKey(key)` (from redact.ts) is true: "Query parameter '<key>' looks like a secret.";
- "Duplicate parameter '<key>'".

**Examples:**
- `https://u:p@example.com:8080/a/b?x=1&y=%20z#frag`: hostname `example.com`, port `8080`, segments `["a","b"]`, query `[{x,1},{y," z"}]`, hash `#frag`, 1 warning.
- `example.com/path`: href `https://example.com/path`.
- `not a url` → error "This isn't a valid URL.".
- `buildUrl(parseUrlText(x).value)` round-trips for the first example.

**UI.** Inspect pattern:
- the URL input on top;
- cards for the parts;
- an editable query table (key, value, delete; "Add parameter");
- the rebuilt URL with a Copy button;
- warnings as `warn` lines.

**Detector.** `^https?://\S+$` → `url-parser` 0.8 "Looks like a URL".

---

### T-205: Cron expression explainer

**Registry:**
```ts
{ id: "cron", slug: "cron-expression", title: "Cron Expression Explainer", navTitle: "Cron Explainer",
  description: "Explain a cron expression in plain English and list its next run times in any time zone. Supports 5- and 6-field formats.",
  category: "time", keywords: ["cron", "crontab", "schedule", "next run", "quartz", "kubernetes cronjob"], icon: "CalendarClock", status: "new",
  docs: { howTo: ["Type or paste a cron expression, or pick a preset.", "Choose the time zone the job runs in.", "Check the plain-English meaning and the next 5 runs."],
    faq: [{ q: "Which time zone do servers use?", a: "Many use UTC. Kubernetes CronJobs use the controller's time zone unless spec.timeZone is set." }],
    related: ["timestamp-converter", "regex-tester"] } }
```
**Dependencies:** `cronstrue@3.38.0` (MIT), `croner@10.0.1` (MIT).

**API:** `src/core/cron/cron.ts`
```ts
export function explainCron(expr: string, opts: { timeZone: string; from: Date; count?: number /* default 5 */ }):
  Result<{ description: string; nextRuns: string[] /* ISO 8601 with the zone offset, e.g. 2026-10-22T17:45:00+05:30 */; fields: { name: string; value: string }[]; withSeconds: boolean }>;
```
- `description` = `cronstrue.toString(expr, { use24HourTimeFormat: true })`.
- next runs: `new Cron(expr, { timezone, paused: true }).nextRuns(count, from)`, formatted in that zone with `Intl.DateTimeFormat` parts. Build the offset string yourself (unit-tested).
- 6 fields → `withSeconds: true` and field names include "second".
- Validate with `cronstrue` first. If it throws, return its message as the error, for example "minutes part must be >= 0 and <= 59". Only if cronstrue accepts the expression, compute the next runs with croner, and return croner's message if it throws.

**Examples:**
- `*/15 9-17 * * 1-5`, zone Asia/Kolkata, from `2026-10-22T12:00:00Z`:
  - description `Every 15 minutes, between 09:00 and 17:59, Monday through Friday`;
  - first two runs `2026-10-22T17:45:00+05:30`, `2026-10-23T09:00:00+05:30`.
- `61 * * * *` → error.
- `@daily`: if cronstrue rejects it, map these macros first: `@yearly`/`@annually`, `@monthly`, `@weekly`, `@daily`/`@midnight`, `@hourly`.

**UI.** Inspect pattern:
- the expression input (`cron-input`, mono);
- preset chips (every minute, every 15 min, hourly, daily 00:00, weekdays 09:00, first of month);
- a time-zone select (`Intl.supportedValuesOf("timeZone")`, default `Intl.DateTimeFormat().resolvedOptions().timeZone`);
- the description in large text, a field table and the next runs list.

**Detector.** `^(@(yearly|annually|monthly|weekly|daily|midnight|hourly)|(\S+\s+){4,5}\S+)$`, where every field matches `^[\d*/,\-?LW#A-Za-z]+$` → `cron` 0.7 "Looks like a cron expression".

---

### T-206: CSV ⇄ JSON

**Registry:**
```ts
{ id: "csv-json", slug: "csv-to-json", title: "CSV to JSON Converter (and back)", navTitle: "CSV ⇄ JSON",
  description: "Convert CSV to JSON and JSON to CSV with delimiter detection, quoted fields, a table preview and protection against spreadsheet formulas.",
  category: "data", keywords: ["csv", "tsv", "json", "spreadsheet", "excel", "convert", "table"], icon: "Sheet", status: "new",
  docs: { howTo: ["Paste CSV or a JSON array.", "Check the delimiter and header options.", "Copy or download the result."],
    faq: [{ q: "What is formula protection?", a: "Cells starting with = + - or @ can run as formulas in Excel. When on, such cells get a leading apostrophe in exported CSV." }],
    related: ["json-workbench", "yaml-json"] } }
```
**Dependency:** `papaparse@5.7.0` (MIT). Add `@types/papaparse` only if it is in DEPENDENCIES.md (it is: `@types/papaparse@5.5.2`, dev).

**API:** `src/core/csv/csv.ts`
```ts
export function csvToJson(text: string, opts: { header: boolean; delimiter: "auto" | "," | ";" | "\t" | "|"; dynamicTyping: boolean }):
  Result<{ json: string; rows: number; columns: string[]; delimiter: string; warnings: string[] }>;
export function jsonToCsv(text: string, opts: { delimiter: "," | ";" | "\t" | "|"; protectFormulas: boolean }): Result<{ csv: string; warnings: string[] }>;
```
- csvToJson:
  - `Papa.parse(text, { header, delimiter: auto ? "" : d, skipEmptyLines: true, dynamicTyping })`;
  - `warnings` = the first 20 `errors` as `Row <row+1>: <message>`;
  - empty input → error.
- jsonToCsv:
  - accepts an array of objects (columns = union of keys in first-seen order) or an array of arrays;
  - nested objects/arrays are stringified with JSON, with the warning "Nested values in columns a, b were written as JSON text.";
  - when `protectFormulas`, a string cell that starts with `= + - @` (or a tab or carriage return) gets a `'` prefix;
  - line endings `\r\n` (RFC 4180).

**Examples:**
- `name,age\n"Smith, J",42\nAnn,7\n`, header true, typing false → `[{"name":"Smith, J","age":"42"},{"name":"Ann","age":"7"}]` (indent 2), delimiter `,`.
- `[{"a":1,"b":"x,y"},{"a":2,"b":"q\"z"}]` → `a,b\r\n1,"x,y"\r\n2,"q""z"`.
- `[{"f":"=SUM(A1)"}]` with protect → `f\r\n'=SUM(A1)`.
- `a,b\n1,2,3` → JSON has 1 row and the warning `Row 1: Too many fields: expected 2 fields but parsed 3`.

**UI.**
- Convert pattern with a direction switch;
- for CSV→JSON, a **Table** tab next to JSON showing the first 200 rows (`csv-json-table`);
- options: Header row, Delimiter, Detect numbers, Formula protection.

**Detector.** ≥ 2 non-empty lines among the first 5, where a delimiter from `,;\t|` gives the same field count ≥ 2 on each of them → `csv-json` 0.6 "Looks like CSV".

Then **STOP: Checkpoint CP2.**

---

## Batch B (T-211 … T-226)

These specs are compact on purpose: the recipe and the batch A examples show the expected depth. Each still needs the registry fields:
- `title` ≤ 48 and `navTitle` ≤ 22 characters;
- a `description` of 70–155 characters, written plainly like batch A;
- at least 3 keywords;
- 2–5 `howTo` steps and at least 1 FAQ;
- 2–4 related ids.

**Write those texts yourself in the batch A style. The reviewer will check them at CP4.**

| Task | id / slug | What | API (pure, src/core/…) | Key tests | Dependency |
|---|---|---|---|---|---|
| T-211 | `base64` / `base64-encode-decode`, `url-encode` / `url-encode-decode`, `uuid` / `uuid-generator`, `hash` / `hash-generator` | 4 SEO pages that reuse the V1 panels | none new. UI = a thin component rendering `Base64Panel` / `UrlEncodePanel` / `UuidPanel` / `HashPanel` inside ToolLayout | each page loads and works; the V1 `encode-generate` page still passes | — |
| T-212 | `json-to-code` / `json-to-code` | JSON → TypeScript, Zod, Go struct, Python dataclass, Rust serde (category code) | `jsonToCode(json, lang, rootName)` reusing the inference in `src/tools/json/lib/jsonToTs.ts` where possible | an object/array/null/mixed-array table for each language; optional fields when keys are missing in some array items | — |
| T-213 | `number-base` / `number-base-converter` | bin/oct/dec/hex with BigInt, two's complement at 8/16/32/64 bits, byte view | `convertBase(input, fromBase)` | max uint64, negative numbers in two's complement, invalid digit → error with position | — |
| T-214 | `color` / `color-converter` | HEX/RGB/HSL/HWB/OKLCH conversion + WCAG contrast checker with AA/AAA verdicts | `parseColor`, `toFormats`, `contrastRatio` | `#5646D8` vs white = 6.44:1; round-trip HEX→OKLCH→HEX within 1 unit | — |
| T-215 | `case` / `case-converter` | camel, Pascal, snake, kebab, CONSTANT, title, sentence, dot, path, plus slugify | `convertCase(text, kind)`, `slugify(text)` | acronyms (`parseHTTPResponse` → `parse_http_response`), unicode (`Café au lait` → `cafe-au-lait`) | — |
| T-216 | `escape` / `string-escape` | escape/unescape: JSON string, JavaScript, HTML entities, XML, URL component, Unicode `\uXXXX`, Java/C | `escapeAs(text, kind)`, `unescapeAs(text, kind)` | emoji surrogate pairs, invalid escapes → error with column | — |
| T-217 | `hmac` / `hmac-generator` | SHA-256/384/512 and HMAC with a key; output as hex/base64/base64url (category security) | `async hmac(text, key, alg)` via `crypto.subtle` (Node 20+ and browsers) | RFC 4231 test vectors 1–2 for HMAC-SHA-256/512 | — |
| T-218 | `password` / `password-generator` | passwords and API-key-like secrets: length, character sets, exclude ambiguous, hex/base64url tokens; entropy in bits | `generate(opts, randomBytes)`: randomness is injected for tests, the UI passes `crypto.getRandomValues`; **rejection sampling, no modulo bias** | uniformity test: chi-square over 100k draws within bounds; entropy formula | — |
| T-219 | `qr-code` / `qr-code-generator` | text/URL/Wi-Fi → QR as SVG; download SVG and PNG (PNG via canvas in the UI only) | `qrSvg(text, { ecc, margin })` | the SVG contains a `<path`; a 2,953-byte limit gives an error past capacity | `qrcode-generator@2.0.4` |
| T-220 | `cidr` / `subnet-calculator` | IPv4 + IPv6 CIDR: network, broadcast, first/last host, host count (BigInt), mask, wildcard, split into /n, "contains IP?" (category network) | `parseCidr`, `split`, `contains` | `192.168.1.0/24` → 254 hosts; `/31` and `/32` special cases; `2001:db8::/32` | — |
| T-221 | `sql-format` / `sql-formatter` | format SQL with a dialect select (sql, postgresql, mysql, sqlite, bigquery, tsql) (category code) | `formatSql(sql, dialect, indent)` | one golden example per dialect; invalid → error message from the library | `sql-formatter@15.9.0` |
| T-222 | `markdown` / `markdown-preview` | Markdown → safe HTML preview, copy HTML (category text) | `renderMarkdown(md)`: `marked.parse` then `DOMPurify.sanitize` with `USE_PROFILES: { html: true }`, adding `rel="noopener noreferrer"` and `target="_blank"` to links. **This is the only place `dangerouslySetInnerHTML` is allowed** | `<script>`, `onerror=`, `javascript:` links removed; remote images are blocked by the CSP (show a note) | `marked@18.1.1`, `dompurify@3.4.17` |
| T-223 | `xml` / `xml-formatter` | XML pretty-print/minify; validity via `DOMParser` **in the UI layer only** | pure tokenizer `formatXml(xml, indent)` handling comments, CDATA, processing instructions, doctype and attributes | golden examples; does not touch the text inside CDATA | — |
| T-224 | `toml-json` / `toml-to-json` | TOML ⇄ JSON | `tomlToJson`, `jsonToToml` | a Cargo.toml example; error line/column | `smol-toml@1.9.1` |
| T-225 | `http-status` / `http-status-codes` | searchable reference of HTTP status codes and common headers, **written in our own words** (no copied MDN text), with "what to check" tips | static data `src/core/http/statusData.ts` | every 1xx–5xx code in RFC 9110 is present | — |
| T-226 | `jwt-encoder` / `jwt-encoder` | create test JWTs: HS256/384/512 with a secret; RS256 with a pasted PKCS#8 PEM. A banner says "For testing — never paste production keys" (category security) | `async signJwt(header, payload, key)` via `crypto.subtle` | the jwt.io HS256 example signature; round-trip with the JWT Decoder library | — |

**Detector additions in batch B:** a hex colour `^#?[0-9a-f]{3,8}$` with length 3/4/6/8 → `color` 0.6; a CIDR → `cidr` 0.85; TOML (`^\[[\w.]+\]$` header lines) → `toml-json` 0.6; SQL (`^\s*(select|insert|update|delete|create|with)\b`i) → `sql-format` 0.6.

**Dependency review.** Before CP4 the reviewer confirms that each new dependency:
- contains no `eval` or `new Function` in the browser bundle (`grep` the built chunk);
- makes no network calls;
- has a compatible licence.

Then **STOP: Checkpoint CP4.**
