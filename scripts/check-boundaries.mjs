// Fails when pure-logic layers import UI libraries or touch browser/network
// APIs. Pure layers must run under Node (CLI, MCP, workers, unit tests).
// See docs/v3/ARCHITECTURE.md §3. Usage: node scripts/check-boundaries.mjs
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
// Directories (or single files) that must stay pure.
const PURE = [
  "src/lib/debugkit",
  "src/core",
  "src/registry/meta.ts",
  "src/registry/pages.ts",
  "src/workers",
  "cli/src",
];
const BANNED_IMPORTS = [/^react$/, /^react-dom(\/|$)/, /^lucide-react$/, /^@codemirror\//, /^@uiw\//];
// Text patterns that must not appear in pure code (comments are stripped first).
const BANNED_TEXT = [
  [/\bwindow\./, "window."],
  [/\bdocument\./, "document."],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bfetch\s*\(/, "fetch("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/\bEventSource\b/, "EventSource"],
  [/\beval\s*\(/, "eval("],
  [/\bnew\s+Function\s*\(/, "new Function("],
];
// Workers legitimately use `self.postMessage` / `self.onmessage`; nothing else is allowed there.

function walk(p, out) {
  const abs = join(ROOT, p);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    if (/\.(ts|tsx|mts|js|mjs)$/.test(p) && !/\.d\.ts$/.test(p)) out.push(p);
    return;
  }
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name === "dist") continue;
    walk(join(p, name), out);
  }
}

function stripComments(src) {
  // Good enough for our code style: removes /* */ and // comments, keeps strings.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const files = [];
for (const p of PURE) walk(p, files);
const problems = [];
for (const f of files) {
  const raw = readFileSync(join(ROOT, f), "utf8");
  const isTest = /\.test\.(ts|mts|js)$/.test(f);
  const src = stripComments(raw);
  for (const m of src.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (BANNED_IMPORTS.some((re) => re.test(spec))) problems.push(`${f}: imports "${spec}"`);
  }
  if (isTest) continue; // tests may use fetch-free Node helpers; imports above are still checked
  for (const [re, label] of BANNED_TEXT) {
    if (re.test(src)) problems.push(`${f}: uses ${label}`);
  }
}

if (problems.length) {
  console.error(`check-boundaries: ${problems.length} problem(s) in pure layers (see docs/v3/ARCHITECTURE.md §3):`);
  for (const p of problems) console.error("  - " + p.split(sep).join("/"));
  process.exit(1);
}
console.log(`check-boundaries: OK (${files.length} pure files checked)`);
