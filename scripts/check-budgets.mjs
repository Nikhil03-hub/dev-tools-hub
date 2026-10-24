// Enforces the bundle budgets from docs/v3/ARCHITECTURE.md §6.3.
// Runs after postbuild-security.mjs, on dist/ only. Prints a table and exits 1
// on any violation so `npm run build` fails instead of silently growing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist";
const ASSETS = join(DIST, "assets");
const SHARED_LIMIT_KB = 120;
const SHARED_ALLOWED = ["codemirror", "vendor", "index"];
const CSS_TOTAL_LIMIT_KB = 30;
const HTML_LIMIT_KB = 40;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (bytes) => bytes / 1024;

const rows = [];
let failed = false;

const html = readFileSync(join(DIST, "index.html"), "utf8");
const entryMatch = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
const entryFile = entryMatch ? entryMatch[1].replace(/^\//, "") : null;

const assets = walk(ASSETS);
const js = assets.filter((f) => f.endsWith(".js"));
const css = assets.filter((f) => f.endsWith(".css"));

for (const file of js) {
  const name = file.split(/[\\/]/).pop() ?? file;
  const size = kb(gz(file));
  const isEntry = entryFile !== null && file.split(/[\\/]/).join("/").endsWith(entryFile);
  const isShared = !isEntry;
  const allowedByName = SHARED_ALLOWED.some((s) => name.includes(s));
  const over = isShared && size > SHARED_LIMIT_KB && !allowedByName;
  if (over) failed = true;
  rows.push({ file: name, kind: isEntry ? "entry" : "chunk", kb: size.toFixed(1), limit: over ? "OVER 120" : "" });
}

const cssTotal = kb(css.reduce((sum, f) => sum + gz(f), 0));
if (cssTotal > CSS_TOTAL_LIMIT_KB) failed = true;
rows.push({ file: `${css.length} css file(s)`, kind: "css", kb: cssTotal.toFixed(1), limit: cssTotal > CSS_TOTAL_LIMIT_KB ? "OVER 30" : "" });

const htmlFiles = walk(DIST).filter((f) => f.endsWith(".html"));
let worstHtml = 0;
let worstName = "";
for (const f of htmlFiles) {
  const size = kb(statSync(f).size);
  if (size > worstHtml) {
    worstHtml = size;
    worstName = f.split(/[\\/]/).pop() ?? f;
  }
  if (size > HTML_LIMIT_KB) {
    failed = true;
    rows.push({ file: f, kind: "html", kb: size.toFixed(1), limit: "OVER 40" });
  }
}
rows.push({ file: `${htmlFiles.length} html (largest: ${worstName})`, kind: "html", kb: worstHtml.toFixed(1), limit: "" });

const w = (s, n) => String(s).padEnd(n);
console.log(`\n${w("file", 44)}${w("kind", 8)}${w("gzip kB", 10)}limit`);
console.log("-".repeat(76));
for (const r of rows) console.log(`${w(r.file.slice(0, 43), 44)}${w(r.kind, 8)}${w(r.kb, 10)}${r.limit}`);

if (failed) {
  console.error("\ncheck-budgets: FAILED — see rows marked OVER above.");
  process.exit(1);
}
console.log("\ncheck-budgets: OK");
