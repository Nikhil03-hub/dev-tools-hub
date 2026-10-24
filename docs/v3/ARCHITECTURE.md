# Dev Tools Hub V3: architecture

Version 1.0 (2026-10-22). Written by Claude Opus as architect. Status: **approved for implementation**. Changes need a DECISIONS.md entry.

Companion files:
- `UX_SPEC.md`: what it looks like
- `IMPLEMENTATION_PLAN.md`: the order of work
- `SECURITY_REVIEW.md`: the threat model
- `TEST_MATRIX.md`: how each part is tested

---

## 1. What exists today (V1 + Debug Report, commit `c7488ef`, verified 2026-10-22)

| Area | Today |
|---|---|
| App | Vite 6 + React 18 + TypeScript strict + Tailwind 3 |
| Bundle | One self-contained `index.html` via `vite-plugin-singlefile` (1,028,456 bytes) |
| Tools | 6 tools, **all mounted at once**: JSON Workbench, JWT Decoder, Regex Tester, Timestamp Converter, Generators (Base64/URL/UUID/Hash), Debug Report |
| Routing | Hash routes `#json`, `#jwt`, `#regex`, `#timestamp`, `#generators`, `#debug` |
| Navigation | Top tab bar (does not scale past ~8 tools) and a ⌘K palette |
| Theme | Dark only. Hex tokens in `src/theme/colors.js` (used by Tailwind and CodeMirror) |
| Engine | `src/lib/debugkit/*` is pure TS (no DOM). `analyze()` and `renderReport()`; 22 redaction categories |
| Privacy | CSP `connect-src 'none'`, hash-based `script-src` + `'unsafe-eval'` (Ajv). `_headers` carries the CSP only on `/` and `/index.html` |
| Counters | Optional GoatCounter pixel (`src/lib/metrics.ts`): 12 fixed events, OFF unless `VITE_GC_CODE` is set at build |
| Tests | `verify_lib` ALL PASS · `verify_debugkit` 147/147 · e2e 252/252 · 0 console errors · 0 requests after load |
| CI | GitHub Actions on `master` pushes and PRs: gitleaks (full history) → tsc → verify_lib → verify_debugkit → build |
| Deploy | Netlify Free, **manual drag of the `dist/` folder** (the CLI/API returns 403). 15 credits per deploy, 300 credits/month |

### Weaknesses V3 must fix

- **Navigation.** Top tabs and "everything mounted" do not scale to 30+ tools. Mounting all tools at once costs memory and start-up time.
- **Discoverability.** Hash routes are invisible to search engines: there is one URL, one title and one description for everything. Competitors such as transform.tools win search traffic with one page per tool.
- **Single-file bundle.** Every visitor downloads all the code (321 kB gzip) even to use one tool. Nothing is cacheable across releases.
- **No light theme.** Contrast is not checked.
- **No home page and no "paste anything" entry point.** The right pane wastes space when empty.
- **Regex Tester runs user patterns on the main thread.** A catastrophic pattern can freeze the tab (known ReDoS risk).
- **The engine is used only by the web app**, although it was designed for reuse (CLI, MCP).

---

## 2. Target architecture (end state)

```
                     ┌───────────────────────── ONE deterministic engine ─────────────────────────┐
                     │ src/lib/debugkit (parse · redact · findings · logs · report · policy ·     │
                     │                   compare)   +   src/core/<tool> pure logic per tool       │
                     └───────────────┬──────────────────────┬───────────────────────┬─────────────┘
                                     │                      │                       │
          ┌──────────────────────────▼───────┐   ┌──────────▼──────────┐   ┌─────────▼──────────────┐
          │ WEB APP (static, Netlify)         │   │ CLI  `debugreport`  │   │ MCP server (stdio)      │
          │ shell + registry + lazy tools     │   │ Node ≥ 20, 0 runtime│   │ `debugreport mcp`       │
          │ per-tool static pages (SEO)       │   │ deps (bundled)      │   │ tools: diagnose,        │
          │ CSP connect-src 'none'            │   │ stdin/files → report│   │ sanitize, scan          │
          │ Web Workers for heavy work        │   │ sanitize · scan     │   │ (local only)            │
          └───────────────────────────────────┘   └──────────┬──────────┘   └─────────────────────────┘
                                                             │
                                          ┌──────────────────▼──────────────────┐
                                          │ GitHub Action (composite, wraps CLI)│  ← Phase 5
                                          │ Intake page template (static HTML)  │  ← Phase 5
                                          └─────────────────────────────────────┘
   Shared config: `.debugreport.json` redaction policy (same schema in web, CLI, MCP, Action)
   Deferred (design only, gated): BYOK "Explain with AI" page · hosted team features · payments
```

**Principle.** Every capability is a pure function in the engine first. The web app, CLI, MCP server and Action are thin adapters. **There is no backend.** Nothing in V3 requires a server, an account or a database.

---

## 3. Module boundaries (enforced)

| Layer | Path | May import | Must not |
|---|---|---|---|
| Engine | `src/lib/debugkit/**` | only itself and `src/core/result.ts` | React, DOM, `window`, `navigator`, `localStorage`, network, `Date.now()` inside rules (time is passed in) |
| Pure tool logic | `src/core/<tool>/**` | engine, other `src/core/**`, approved pure deps (`yaml`, `papaparse`…) | React, DOM, network |
| Shared V1 libs | `src/lib/*.ts` | anything pure; `clipboard.ts` is the only DOM user | network |
| Registry | `src/registry/meta.ts` | nothing but types | React (it must load in Node for the page generator) |
| Loaders | `src/registry/tools.ts` | meta + `React.lazy` loaders | — |
| Shell | `src/shell/**`, `src/App.tsx` | registry, components | tool internals |
| Tool UI | `src/tools/<tool>/**` | its `core`, `components`, `lib` | other tools' internals |
| Workers | `src/workers/*.worker.ts` | engine, core | React, DOM |
| CLI | `cli/src/**` | engine, core, Node built-ins | React, DOM, any network module |

`scripts/check-boundaries.mjs` (added by T-101) fails the build when an engine, core, registry-meta or worker file imports `react`, `react-dom`, `lucide-react` or `@codemirror/*`, or mentions `window.`, `document.`, `localStorage`, `fetch(`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`.

---

## 4. The tool registry (contract)

`src/registry/types.ts`. This is the contract; implement it exactly.

```ts
import type { ComponentType, RefAttributes } from "react";
import type { ToolHandle } from "../lib/toolHandle";

export type ToolCategory =
  | "debug" | "data" | "text" | "web" | "encoding" | "security" | "time" | "code" | "network";

export const CATEGORY_ORDER: ToolCategory[] =
  ["debug", "data", "web", "encoding", "security", "text", "time", "code", "network"];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  debug: "Debug & share", data: "Data formats", web: "Web & HTTP", encoding: "Encode & decode",
  security: "Security & crypto", text: "Text", time: "Date & time", code: "Code", network: "Network",
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
  id: string;            // stable, kebab-case, unique, e.g. "yaml-json"
  slug: string;          // URL path segment (usually === id), lowercase a-z0-9-
  legacyHash?: string;   // V1 hash, e.g. "json" → redirect #json to /<slug>/
  title: string;         // H1 and <title> prefix, ≤ 48 chars, e.g. "YAML ⇄ JSON Converter"
  navTitle: string;      // sidebar label, ≤ 22 chars, e.g. "YAML ⇄ JSON"
  description: string;   // meta description, 70–155 chars, plain sentence
  category: ToolCategory;
  keywords: string[];    // search synonyms for the palette and home search
  icon: string;          // a key of ICONS in src/registry/icons.ts (explicit lucide-react imports; never `import *`)
  status: "stable" | "beta" | "new";
  initial?: Record<string, string>; // props for the component, e.g. { panel: "base64" }
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
```

- `src/registry/meta.ts` exports `TOOL_META: ToolMeta[]`. It is pure data and must import nothing but types. Order inside a category = display order.
- `src/registry/tools.ts` exports `TOOLS: ToolEntry[]` (meta + `load: () => import("../tools/x/XTool")`), `getTool(id)`, `getToolBySlug(slug)` and `getToolByLegacyHash(h)`.
- `scripts/check-registry.ts` (T-103) validates the registry at build time:
  - ids and slugs are unique;
  - text lengths are within the limits;
  - `related` ids exist;
  - every icon name is a key of `ICONS` in `src/registry/icons.ts`;
  - every `docs` field is filled in.
- **Generator pages share one component** with different `initial`. Base64, URL encoder, UUID and Hash become four registry entries pointing at `GeneratorsApp` with `initial: { panel }`. Same pattern for JSON Workbench views when useful.

---

## 5. Routing

- **Path-based URLs:** `/` (home), `/<slug>/` (tool), `/privacy/`, `/cli/` (Phase 4), `/about/`. Unknown paths go to `/404.html`.
- **The router** (`src/core/router/router.ts`, pure; `src/shell/navigation.ts` reads `location`) returns:
  `{ kind: "home" } | { kind: "tool"; id: string } | { kind: "page"; id: "privacy" | "about" | "cli" } | { kind: "notfound" }`
- **Navigation** uses `history.pushState` and a `popstate` listener. All in-app links are real `<a href="/slug/">` elements whose click handler intercepts plain left-clicks, so middle-click and copy-link work.
- **Legacy hash routes.** On load, if the path is `/` and the hash matches a `legacyHash`, call `history.replaceState(null, "", "/<slug>/")`. `https://json-workbench.netlify.app/#debug` therefore keeps working: it was in every launch post.
- **Keep-alive.** A tool is mounted the first time it is opened. When the user switches away it stays mounted but hidden (the V1 behaviour, so pasted input is not lost). At most **8** tools stay mounted; beyond that, the least recently used one unmounts.
- **Page title.** `document.title` = `"<title> · Dev Tools Hub"` on tool pages and `"Dev Tools Hub: private developer tools that run in your browser"` on home.

---

## 6. Build pipeline and CSP

### 6.1 Build steps

`npm run build` runs:

1. `tsc --noEmit`
2. `vite build`: **multi-file output**. `vite-plugin-singlefile` is removed. JS/CSS go to `dist/assets/*-[hash].{js,css}`, and each tool is its own lazy chunk.
3. `tsx scripts/postbuild-pages.ts`:
   - reads `dist/index.html` as a template;
   - writes `dist/<slug>/index.html` for every tool, plus `dist/privacy/index.html`, `dist/about/index.html` and `dist/404.html`;
   - rewrites the home `dist/index.html`;
   - writes `dist/sitemap.xml` (every URL) and keeps `dist/robots.txt`.

   Each page gets:
   - `<title>`;
   - `<meta name="description">`;
   - `<link rel="canonical" href="https://<SITE_ORIGIN>/<slug>/">`;
   - Open Graph `og:title`, `og:description`, `og:url`, `og:type=website`;
   - a **prerendered content block inside `<div id="root">`**: H1, description, how-to list, FAQ and related links as plain HTML. React replaces it on mount, and crawlers and no-JS readers see real content.

   Text is HTML-escaped by a tested `escapeHtml()`. `SITE_ORIGIN` comes from env `SITE_ORIGIN`, default `https://json-workbench.netlify.app`.
4. `node scripts/postbuild-security.mjs`: injects the CSP `<meta>` into **every generated HTML page except `waitlist*.html`**, and writes `dist/_headers`.

### 6.2 CSP (V3)

```
default-src 'none';
script-src 'self' 'unsafe-eval';          ← 'unsafe-eval' only because Ajv compiles schemas
style-src 'self' 'unsafe-inline';         ← React style attributes + CodeMirror
img-src 'self' data: blob: [https://<gc>.goatcounter.com when VITE_GC_CODE is set];
font-src 'self';
connect-src 'none';                       ← THE privacy guarantee, never change
worker-src 'self';
media-src 'none'; object-src 'none'; frame-src 'none';
manifest-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'                    ← header only (ignored in <meta>)
```

- **Inline scripts.** `postbuild-security` must fail the build if any inline `<script>` without `src` exists in an app page (no hashes needed any more).
- **`_headers`.**
  - CSP goes on `/`, `/index.html`, `/<slug>/` and `/<slug>/index.html` for every page, plus `/404.html`. It must never go on `/*`: Netlify merges matching rules, and the waitlist pages carry their own CSP with `form-action 'self'`.
  - `/*` gets only the non-CSP headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`.
  - `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`.
- **Privacy wording changes, honestly.** V1 said "zero requests after load". V3 lazy-loads code, so the truthful promise is:

  > *"After the page loads, the only requests are for this site's own code files. No request ever carries what you paste. The browser blocks connections to any server (`connect-src 'none'`)."*

  The e2e suite asserts exactly that: every request after load is a same-origin `GET` under `/assets/` (plus the GoatCounter image when counters are on). README, SECURITY.md, the privacy page and the privacy popover all use this wording.

### 6.3 Performance budgets (checked by `scripts/check-budgets.mjs`, T-104)

| Asset | Budget (gzip) |
|---|---|
| Entry JS (shell + home + router + palette) | ≤ 160 kB |
| Shared CodeMirror chunk | ≤ 220 kB |
| Any single tool chunk (excluding shared chunks) | ≤ 120 kB |
| CSS total | ≤ 30 kB |
| Largest HTML page (prerendered) | ≤ 40 kB raw |

---

## 7. Theming

- **Tokens** are CSS variables in `src/theme/tokens.css` as space-separated RGB triplets. Exact values are in `UX_SPEC.md` §2.
  - `:root` holds the light theme.
  - `:root[data-theme="dark"]` holds the dark theme.
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { …dark… } }` follows the system by default.
- **Tailwind** maps `canvas`, `surface`, `raised`, `border`, `border-subtle`, `ink`, `ink-dim`, `ink-faint`, `accent`, `accent-strong`, `ok`, `warn`, `err`, `info` to `rgb(var(--c-x) / <alpha-value>)`.
- **CodeMirror** themes use `var(--c-…)` strings. `src/theme/colors.js` is deleted once nothing imports it.
- **Preference.** `localStorage["dth.theme"]` holds `"system" | "light" | "dark"`, default `"system"`. `src/main.tsx` sets `document.documentElement.dataset.theme` **before** `createRoot().render()`. Wrap storage access in try/catch.

---

## 8. Client state and storage

| Key | Value | Why |
|---|---|---|
| `dth.theme` | `system` / `light` / `dark` | preference |
| `dth.sidebar` | `expanded` / `collapsed` | preference |
| `dth.recent` | JSON array of ≤ 8 tool ids | palette "recent" and home "continue" |
| `dth.policy.v1` | redaction policy JSON (P3) | the user saved it explicitly |
| `dth.debug.firstSeen` (existing) | date | existing return counter |

**Never stored:** any input, output, report, token, file content or clipboard data. Tool state lives in React memory only. Reloading the page clears it, and that is a feature.

---

## 9. Workers (P2/P3)

- Generic helper `src/workers/runInWorker.ts`:
  ```ts
  runInWorker<TReq, TRes>(factory: () => Worker, req: TReq, { timeoutMs }): Promise<
    | { ok: true; value: TRes }
    | { ok: false; reason: "timeout" | "error"; message: string }
  >
  ```
  It terminates the worker on timeout.
- **Regex worker.** `src/workers/regex.worker.ts` runs `runRegex` (from `src/lib/regex.ts`) with a 1,000 ms timeout. On timeout the UI shows "This pattern took too long (possible catastrophic backtracking)". Fixes the V1 ReDoS freeze.
- **Debug worker.** `src/workers/debug.worker.ts` runs `analyze()` when the input is over 200,000 characters, with a 15 s timeout.
- **Policy-regex safety.** Every pattern must pass `isPatternSafe` before it is saved. From T-306 on, any analysis whose policy has patterns (Debug Report and Secret Scanner) runs inside the debug worker, so a bad pattern cannot freeze the UI. T-302/T-303 run on the main thread until T-306 lands; that is acceptable because of `isPatternSafe` and the 5 M input cap.
- Workers are created with `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module" })`, which needs `worker-src 'self'`.

---

## 10. Engine extensions (P3, contracts)

All in `src/lib/debugkit/`, additive only. Existing exports keep their signatures.

```ts
// policy.ts
export interface RedactionPolicyV1 {
  version: 1;
  /** Extra field/header/variable names whose VALUES are secret (case-insensitive, exact name or token). */
  keyNames: string[];                     // ≤ 200 entries, each 1–64 chars [A-Za-z0-9_.-]
  /** Extra value patterns. Each match is replaced with <CUSTOM_NAME_n>. */
  patterns: { name: string; regex: string; flags?: "i" | "" }[]; // ≤ 50; name /^[A-Z][A-Z0-9_]{0,23}$/; regex ≤ 200 chars
  /** Exact values that must never be redacted (e.g. a public demo key). */
  allowValues: string[];                  // ≤ 200, each ≤ 200 chars
  emails?: boolean;                       // overrides the UI toggle when present
  ips?: boolean;
}
export function parsePolicy(json: string): Result<RedactionPolicyV1>;   // validates every limit, rejects unknown keys
export function isPatternSafe(regex: string): { ok: true } | { ok: false; reason: string };
// rejects nested quantifiers like (a+)+, (a*)*, (a|a)*, backreferences, lookbehind; length ≤ 200
export const POLICY_FILE_NAME = ".debugreport.json";

// report.ts (extended)
export interface AnalyzeOptions extends Partial<RedactOptions> { now?: number; policy?: RedactionPolicyV1 }
export type ReportFormat = "ai" | "issue" | "plain" | "agent" | "json";
// "agent": like "ai" but each placeholder in the summary is annotated, e.g. <JWT_1 alg=RS256 exp=2026-10-01T10:00Z expired>
// "json": JSON.stringify of a stable, documented subset (no raw values), schemaVersion: 1

// compare.ts
export interface CompareReport {
  a: { exchanges: number }; b: { exchanges: number };
  differences: CompareDiff[];        // ordered by importance
  findings: Finding[];               // e.g. "Authorization header present in working request but missing in failing request"
  sanitizedA: string; sanitizedB: string; // redacted with ONE shared Redactor so placeholders match across both
}
export interface CompareDiff {
  kind: "method" | "url" | "query" | "header" | "cookie" | "body-key" | "status" | "content-type";
  name: string; a: string | null; b: string | null;  // values already redacted (placeholders)
  same: boolean;
}
export function compareRequests(working: string, failing: string, opts?: AnalyzeOptions): CompareReport;
```

**Placeholder consistency across compare.** Both inputs go through one shared `Redactor`. The same secret therefore gets the same placeholder on both sides, so "token identical / token differs" survives redaction.

---

## 11. CLI and MCP (P4)

- **Location.** `cli/src/main.ts` and `cli/src/mcp.ts`. Built by `vite.cli.config.ts`:
  - Vite SSR/library build with target `node20`;
  - one bundled ESM file `cli/dist/debugreport.mjs` starting with `#!/usr/bin/env node`;
  - **zero runtime dependencies** (everything bundled).
- **Package.** `cli/package.json`:
  - `name`: `debugreport` (free on npm on 2026-10-22; the owner reserves it);
  - `bin`: `{ "debugreport": "dist/debugreport.mjs" }`;
  - `type`: `module`;
  - `engines`: `{ "node": ">=20" }`;
  - `files`: `["dist", "README.md", "LICENSE"]`;
  - `license`: `MIT`.
- **Argument parsing.** Node's built-in `util.parseArgs`, so no dependency.
- **Commands.**

  | Command | Output | Exit code |
  |---|---|---|
  | `debugreport [file\|-] [--format ai\|issue\|plain\|agent\|json] [--no-emails] [--no-ips] [--policy path] [--now ISO]` | report to stdout | 0 |
  | `debugreport sanitize <file> [-o out]` | sanitized copy (HAR stays valid JSON); default output `<name>.sanitized<ext>` | 0 |
  | `debugreport scan <files…> [--json]` | lists detected secret categories, line numbers and placeholder names (never the values) | 0 = clean, 1 = secrets found, 2 = error |
  | `debugreport compare <working> <failing>` | compare report | 0 |
  | `debugreport mcp` | starts the MCP stdio server | — |

  - The policy file is auto-loaded from `./.debugreport.json` when present.
  - **Inputs.** stdin is read only when the file argument is `-` or stdin is not a TTY. Files over 50 MB are refused with exit code 2.
- **MCP server** (stdio transport only, no network listener). Tools:
  - `diagnose(text, format?)`
  - `sanitize(text)`
  - `scan(text)`
  - `compare(working, failing)`

  Implementation: the official `@modelcontextprotocol/sdk`, bundled. **Decision D-15 is made at CP4 after a size and security check**; the fallback is a minimal hand-written JSON-RPC stdio server conforming to MCP spec 2025-06-18.
- **No telemetry** in the CLI or MCP, ever.

---

## 12. Testing architecture

| Layer | Tool | Where | Gate |
|---|---|---|---|
| Types | `tsc --noEmit` | whole repo | `npm run check` |
| Boundaries | `scripts/check-boundaries.mjs` | engine, core, registry meta, workers, cli | `npm run check` |
| Registry | `scripts/check-registry.ts` | `src/registry` | `npm run check` |
| Unit | vitest 5 (`src/**/*.test.ts`, `cli/**/*.test.ts`) | pure logic | `npm run check` |
| Legacy suites | `scripts/verify_lib.ts`, `scripts/verify_debugkit.ts` (unchanged, append-only) | V1 libs + engine | `npm run check` |
| Build + budgets | `vite build` + postbuild + `check-budgets.mjs` | dist | `npm run check` |
| Browser e2e | Playwright (`test/e2e.cjs`) via `scripts/run-e2e.mjs`, which starts `vite preview` itself | every page | at checkpoints (and per task when stated) |
| Accessibility | axe-core evaluated in e2e (T-109, dev dependency) | every page, both themes | checkpoints |
| Secrets | gitleaks in CI | full history | CI |

---

## 13. Deployment, release and rollback

- **No deploys during development.** The live site stays V1 until RC1 is accepted (`RELEASE_CHECKLIST.md`).
- **Release build.** Built **on Nikhil's PC or by Opus in the cloud**. PowerShell: `$env:VITE_GC_CODE="nikhil03"; npm run build`. Bash: `VITE_GC_CODE=nikhil03 npm run build`. Drag the whole `dist/` folder onto Netlify → Deploys. Never drag a single file. Never use the Netlify CLI.
- **Credit budget.** 15 credits per deploy. Keep at most 2 deploys per release. The credit cycle resets on the 30th of each month (billing Sep 30 – Oct 29).
- **Before merging `v3` → `master`:** tag the current master `v1-final` and keep `DevTools_Hub_Dist_2026-09-30_WP2_counters` as the rollback dist.
- **Rollback.** In Netlify → Deploys, open the previous deploy and click "Publish deploy". Or drag the kept rollback dist.
- **Git flow.**
  - Branch `v3`, one commit per task. The owner pushes `v3` at checkpoints and opens a draft PR `v3 → master`, so CI runs on every push.
  - Merge only at release.

---

## 14. Migration from V1 (order matters)

1. **T-101:** tooling, without behaviour change.
2. **T-102:** tokens and themes. Dark stays pixel-close to V1.
3. **T-103:** registry plus lazy mounting, still with hash routes and the V1 header. All 252 e2e checks must still pass.
4. **T-104:** multi-file build, path routes and static pages. e2e is updated for paths; legacy hashes redirect.
5. **T-105 to T-108:** new shell, home, palette and tool frame. The existing tools are wrapped, not rewritten.

Each step is independently revertible with `git revert <sha>`.

---

## 15. Deferred by design (do not build without a DECISIONS entry)

| Item | Why deferred | What would justify it |
|---|---|---|
| "Explain with AI" (BYOK) | It needs `connect-src` to an AI host, which ends the "nothing can leave" guarantee for that page | RC1 shipped, at least 20 unprompted user requests, and a separate `/ai/` page with its own CSP allowing one provider host, explicit opt-in, sanitized report only, key kept in memory |
| In-browser local model (WebLLM etc.) | Downloads of hundreds of MB, needs WebGPU, quality varies | A small model that is good enough is proven on mid-range laptops |
| Accounts, cloud sync, saved history | Needs a backend and breaks the privacy story | Paying team customers asking for it |
| Payments / Pro tier | Nothing to sell yet | Evidence of willingness to pay (see the business plan) |
| Hosted team policy registry, hosted intake pages | Backend plus data-protection duties | Signed pilot customer(s) |
| Browser extension, VS Code extension | Extra store review and maintenance | CLI/MCP adoption shows demand |
| Service worker / offline PWA | Cache-invalidation risk | After RC1, as an "installable, works offline" feature |
