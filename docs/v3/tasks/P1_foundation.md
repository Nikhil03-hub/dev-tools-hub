# Phase 1: foundation (T-101 … T-109)

Read `AGENTS.md`, `ARCHITECTURE.md` and `UX_SPEC.md` first. Each task below is self-contained. Do them in order.

Baseline before P1, commit `c7488ef`:
- `tsc` clean
- verify_lib ALL PASS
- verify_debugkit 147/147
- e2e 252/252
- 0 console errors
- build 1,028,456 bytes

---

## T-101: Tooling and gates (no behaviour change)

**Goal.** Make `npm run check` the single quality gate and make e2e runnable on Windows and Linux. The app behaves exactly as before.

**Already present (reference files, do not rewrite):**
- `scripts/check-boundaries.mjs`
- `scripts/run-e2e.mjs`
- `vitest.config.ts`
- `src/core/result.ts`, `src/core/result.test.ts`
- `src/core/router/router.ts`, `src/core/router/router.test.ts`
- `src/registry/types.ts`, `src/registry/meta.ts`, `src/registry/pages.ts`
- `scripts/postbuild-pages.ts`, `scripts/lib/pages-render.ts`, `scripts/lib/pages-render.test.ts`

The router, registry and postbuild-pages files are unused until T-103/T-104. They only need to compile and pass their tests.

**Expected before T-101.** `npm run build` fails with `Cannot find module 'vitest'` in the new `*.test.ts` files, because vitest is not installed yet. That is normal; T-101 fixes it.

**Files to change:** `package.json`, `package-lock.json`, `test/e2e.cjs` (lines 1–4 only), `.gitignore`, `.gitattributes` (new), `README.md` (Test section only), `.github/workflows/ci.yml` (the `run:` lines listed below only).

**Steps:**
1. Install dev dependencies:
   ```
   npm install --save-dev --save-exact vitest@5.0.5 tsx@4.23.15 playwright@1.64.1
   ```
2. In `package.json`, set `"scripts"` to exactly this (keep every other field unchanged):
   ```json
   {
     "dev": "vite",
     "build": "tsc --noEmit && vite build && node scripts/postbuild-security.mjs",
     "preview": "vite preview",
     "typecheck": "tsc --noEmit",
     "check:boundaries": "node scripts/check-boundaries.mjs",
     "test:unit": "vitest run",
     "verify:lib": "tsx scripts/verify_lib.ts",
     "verify:debugkit": "tsx scripts/verify_debugkit.ts",
     "check": "npm run typecheck && npm run check:boundaries && npm run test:unit && npm run verify:lib && npm run verify:debugkit && npm run build",
     "test:e2e": "node scripts/run-e2e.mjs"
   }
   ```
3. In `test/e2e.cjs`, replace **only** lines 1, 3 and 4 with:
   ```js
   const { chromium } = require(process.env.PW_MODULE || "playwright");
   ```
   (line 2 stays empty), then:
   ```js
   const BASE = process.env.E2E_BASE || "http://127.0.0.1:4173/";
   const SHOT_DIR = process.env.SHOT_DIR || "test-results/e2e-shots";
   require("fs").mkdirSync(SHOT_DIR, { recursive: true });
   ```
4. Append `test-results` to `.gitignore`. Create `.gitattributes` containing exactly:
   ```
   * text=auto eol=lf
   *.png binary
   ```
5. In `.github/workflows/ci.yml`:
   - replace `- run: npx --yes tsx@4 scripts/verify_lib.ts` with `- run: npm run verify:lib`;
   - replace `- run: npx --yes tsx@4 scripts/verify_debugkit.ts` with `- run: npm run verify:debugkit`;
   - insert `- run: npm run check:boundaries` and `- run: npm run test:unit` right after `- run: npx tsc --noEmit`;
   - change nothing else (the action SHAs and the gitleaks step stay identical).
6. In README.md, replace the Test section's code block with:
   ```
   npm ci
   npx playwright install chromium   # once per machine
   npm run check                     # typecheck, boundaries, unit, verify_lib, verify_debugkit, build
   npm run test:e2e                  # browser suite against dist/
   ```

**Acceptance criteria:**
- AC1: `npm run check` passes:
  - boundaries OK;
  - unit 3 test files / 15 tests pass;
  - verify_lib ALL PASS;
  - verify_debugkit 147 passed;
  - build OK.
- AC2: `npm run test:e2e` → **252 PASS, 0 FAILURE(S)**, no console errors.
- AC3: `git diff --stat` touches only the files listed above (plus the lockfile).

**Rollback.** `git revert` the commit.

---

## T-102: Design tokens, light/dark/system theme

**Goal.** Replace hard-coded colours with CSS-variable tokens (UX_SPEC §2) and add a theme switch. The dark theme must look almost identical to V1.

**Files:**
- `src/theme/tokens.css` (new)
- `src/index.css`
- `tailwind.config.js`
- `src/lib/cmTheme.ts`
- `src/theme/colors.js` (delete at the end)
- `index.html`
- `src/main.tsx`
- `src/shell/theme.ts` (new)
- `src/components/Header.tsx` (add the toggle button only)
- `src/tools/json/components/JsonTree.tsx` and `src/components/CommandPalette.tsx` (replace the 3 non-token colour classes)
- `src/tools/regex/components/MatchHighlight.tsx` (comment text only: it mentions `theme/colors`)
- `test/e2e.cjs` (the allowed edits in step 11 only)

**Steps:**
1. `src/theme/tokens.css`:
   ```css
   :root { /* light */
     --c-canvas: 250 250 251; --c-surface: 255 255 255; --c-raised: 243 243 246;
     --c-border: 228 228 233; --c-border-subtle: 238 238 242;
     --c-ink: 23 23 30; --c-ink-dim: 82 82 94; --c-ink-faint: 110 110 124;
     --c-accent: 86 70 216; --c-accent-hover: 72 56 200; --c-accent-strong: 86 70 216;
     --c-ok: 4 120 87; --c-warn: 180 83 9; --c-err: 198 40 40; --c-info: 29 78 216;
     --c-soft-alpha: 0.10; --c-scroll: 200 200 210; --c-on-accent: 255 255 255;
     --c-syn-prop: 3 105 161; --c-syn-string: 77 124 15; --c-syn-number: 180 83 9;
     --c-syn-bool: 190 24 93; --c-syn-keyword: 109 40 217; --c-syn-typedef: 29 78 216;
     color-scheme: light;
   }
   :root[data-theme="dark"] { /* dark */
     --c-canvas: 11 11 15; --c-surface: 18 18 24; --c-raised: 26 26 34;
     --c-border: 42 42 53; --c-border-subtle: 31 31 40;
     --c-ink: 237 237 242; --c-ink-dim: 161 161 176; --c-ink-faint: 130 130 143;
     --c-accent: 139 124 248; --c-accent-hover: 160 148 250; --c-accent-strong: 99 82 232;
     --c-ok: 52 211 153; --c-warn: 251 191 36; --c-err: 248 113 113; --c-info: 96 165 250;
     --c-soft-alpha: 0.16; --c-scroll: 56 56 74; --c-on-accent: 255 255 255;
     --c-syn-prop: 125 211 252; --c-syn-string: 163 230 53; --c-syn-number: 251 191 36;
     --c-syn-bool: 244 114 182; --c-syn-keyword: 196 181 253; --c-syn-typedef: 147 197 253;
     color-scheme: dark;
   }
   ```
   Then repeat the whole dark block inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.
2. In `src/index.css`:
   - add `@import "./theme/tokens.css";` as the first line, before the `@tailwind` lines;
   - change the scrollbar thumb colours to `rgb(var(--c-scroll))`.
3. In `tailwind.config.js`:
   - remove the `colors.js` import;
   - define each colour as `` `rgb(var(--c-<name>) / <alpha-value>)` ``. Keys: `canvas`, `surface`, `raised`, `border` (`DEFAULT` + `subtle`), `accent` (`DEFAULT`, `hover`, `strong`, `muted` = `"rgb(var(--c-accent) / 0.2)"` and `soft` = `"rgb(var(--c-accent) / var(--c-soft-alpha))"`), `on-accent`, `ok`, `warn`, `err`, `info`, `ink` (`DEFAULT`, `dim`, `faint`);
   - remove `darkMode`;
   - keep the fonts, shadows and animations.
4. In `src/lib/cmTheme.ts`:
   - use `"rgb(var(--c-ink))"`-style strings instead of `colors.*`;
   - the `.cm-activeLine` background becomes `"rgb(var(--c-accent) / 0.05)"` and the selection `"rgb(var(--c-accent) / 0.25)"`;
   - remove the `{ dark: true }` second argument of `EditorView.theme`;
   - in `cmHighlightStyle`, replace the 7 hex colours: propertyName and typeName → `rgb(var(--c-syn-prop))`, string → `--c-syn-string`, number → `--c-syn-number`, bool/null → `--c-syn-bool`, keyword → `--c-syn-keyword`, `definition(typeName)` → `--c-syn-typedef`;
   - keep the export names, so callers don't change.
5. Replace `text-sky-200` → `text-info`, `text-amber-300` → `text-warn`, `bg-black/60` → `bg-canvas/70`, and the remaining default-palette classes in JsonTree with the nearest token. There are 3 of them (CommandPalette.tsx:52, JsonTree.tsx:13 and :72). Find them with `git grep -nE "(text|bg|border)-(slate|gray|zinc|red|amber|emerald|sky|violet|white|black)" -- src`. The result must be zero matches afterwards.
6. Delete `src/theme/colors.js`, and reword the comment in `MatchHighlight.tsx` that mentions it. `git grep -n "theme/colors" -- src tailwind.config.js` must return nothing.
7. `src/shell/theme.ts`:
   ```ts
   export type ThemePref = "system" | "light" | "dark";
   const KEY = "dth.theme";
   export function getThemePref(): ThemePref; // try/catch; invalid or missing → "system"
   export function setThemePref(p: ThemePref): void; // try/catch; then applyTheme(p)
   export function applyTheme(p: ThemePref): void; // "system" → delete documentElement.dataset.theme; else set it
   export function nextThemePref(p: ThemePref): ThemePref; // system → light → dark → system
   ```
8. In `src/main.tsx`, call `applyTheme(getThemePref())` before `createRoot(...).render(...)`.
9. In `index.html`:
   - remove `class="dark"` from `<html>`;
   - set `<meta name="color-scheme" content="light dark" />`;
   - replace the single theme-color meta with `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAFAFB" />` and `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0B0B0F" />`.
10. In `Header.tsx`, add an icon button before the privacy badge:
    - `data-testid="btn-theme"`;
    - `aria-label` = `Theme: <pref>. Click to switch.`;
    - icon `Monitor` / `Sun` / `Moon` for system / light / dark;
    - on click, `setThemePref(nextThemePref(current))`.
11. **e2e allowed edits (exactly these four):**
    - **(a)** Line 34: change `browser.newContext({ viewport: { width: 1440, height: 900 } })` to `browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" })`, so the V1 suite keeps running in dark mode as before.
    - **(b)** Add this helper as a top-level function, directly above `async function main()`:
      ```js
      async function newCheckedPage(context) {
        const p = await context.newPage();
        const errors = [];
        p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
        return { p, errors };
      }
      ```
      `main()` must make `context` reachable; it already is a local in `main()`, so call `newCheckedPage(context)` from inside `main()`.
    - **(c)** In both localStorage checks (`no_input_in_local_storage` and `no_input_in_local_storage_after_all_samples`), replace `lsKeys.every((k) => k === "dth.debug.firstSeen")` (and the `lsKeys2` one) with `lsKeys.every((k) => ["dth.debug.firstSeen", "dth.theme", "dth.sidebar", "dth.recent", "dth.policy.v1"].includes(k))`. Keep the value checks unchanged.
    - **(d)** Insert a section `// ---- theme (T-102) ----` **immediately before `await browser.close();`**:
      - `const { p, errors } = await newCheckedPage(context);` then `p.goto(BASE, { waitUntil: "networkidle" })`;
      - click `btn-theme` until `document.documentElement.dataset.theme === "light"`, then check that `getComputedStyle(document.body).backgroundColor` is `rgb(250, 250, 251)` (`theme_light_bg`);
      - continue to `"dark"` and check `rgb(11, 11, 15)` (`theme_dark_bg`);
      - reload and check that `dataset.theme` is still `"dark"` (`theme_persists_after_reload`);
      - click until the preference is back to `system` (`dataset.theme` undefined); check `errors.length === 0` (`theme_no_console_errors`); `await p.close()`.

**Acceptance criteria:**
- AC1: `npm run check` passes.
- AC2: e2e is 252 + 4 new checks, all PASS.
- AC3: In dark mode, screenshots of the JSON and Debug tools match V1 except for the small token value changes (reviewer compares visually).
- AC4: Light mode has no unreadable text. Every text token is ≥ 4.5:1 per the UX_SPEC table.
- AC5: Zero hex colours remain in `src/**/*.tsx|ts` except comments.

---

## T-103: Tool registry + lazy loading + keep-alive (V1 header kept)

**Goal.** `App.tsx` stops importing every tool directly. Tools load lazily from the registry and stay mounted after the first visit (at most 8). Hash routes and the V1 header still work.

**Files:**
- `src/registry/tools.ts` (new)
- `scripts/check-registry.ts` (new)
- `src/shell/ToolHost.tsx` (new)
- `src/App.tsx`
- `src/components/Header.tsx` (read tools from the registry)
- every `src/tools/*/…App.tsx` (accept `ToolProps`; no logic change)
- `package.json` (add `check:registry` and include it in `check`)
- `test/e2e.cjs` (the network check below only)

**Steps:**
1. `src/registry/tools.ts`:
   ```ts
   import { TOOL_META } from "./meta";
   import type { ToolEntry, ToolComponent } from "./types";
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
   export function getTool(id: string): ToolEntry | undefined;
   export function getToolBySlug(slug: string): ToolEntry | undefined;
   export function getToolByLegacyHash(h: string): ToolEntry | undefined;
   export const ROUTE_TABLES: RouteTables; // built from TOOLS; pages: ["privacy", "about"]
   ```
   (`RouteTables` comes from `../core/router/router`.)
2. Change each tool's `forwardRef<ToolHandle, { isActive: boolean }>` to `forwardRef<ToolHandle, ToolProps>`, importing `ToolProps` from `src/registry/types`. Tools may ignore `initial` for now.
3. `scripts/check-registry.ts` (run with tsx) validates `TOOL_META`. It exits 1 with a clear message listing every problem:
   - id and slug match `/^[a-z0-9]+(-[a-z0-9]+)*$/`;
   - ids and slugs are unique;
   - slugs are not `privacy`, `about`, `cli` or `assets`;
   - `title` ≤ 48 and `navTitle` ≤ 22 characters;
   - `description` 70–155 characters;
   - `keywords` ≥ 3;
   - `howTo` 2–5 items;
   - `faq` 1–6 items;
   - `related` 2–4 existing ids, not including itself;
   - the `icon` is a key of `ICONS` in `src/registry/icons.ts`.

   Create `src/registry/icons.ts` in this task: `import { Bug, Braces, KeyRound, Regex, Clock, Binary } from "lucide-react"; export const ICONS = { Bug, Braces, KeyRound, Regex, Clock, Binary } as const;`. Every later task that adds a tool with a new icon adds that icon here. **Never use `import * as … from "lucide-react"`**: it pulls in every icon (about 141 kB gzip) and breaks the bundle budget.

   Add `"check:registry": "tsx scripts/check-registry.ts"` to package.json and put it into `check` right after `check:boundaries`.
4. `src/shell/ToolHost.tsx` renders the active tool:
   - keeps an ordered list `mounted: string[]` of tool ids (most recent last, at most 8);
   - renders each mounted tool inside `<div className={id === active ? "h-full" : "hidden"}>`, wrapped in `<Suspense fallback={<ToolSkeleton/>}>` and an `ErrorBoundary`. Use simple local versions of both inside the file; T-108 replaces them with shared components;
   - uses `React.lazy` components cached in a module-level `Map<string, LazyExoticComponent>`, so each tool's lazy wrapper is created once;
   - exposes `getActiveHandle(): ToolHandle | null` through a ref, so App can build palette commands as before. Keep one ref object per tool id in a `useRef(new Map<string, React.RefObject<ToolHandle>>())`, creating missing ones with `createRef<ToolHandle>()`. **Never call `useRef` inside a loop.**
5. `App.tsx`:
   - state `activeId` (tool id); the hash is computed from `getTool(activeId).legacyHash`;
   - keep the current hash behaviour exactly (`#json` etc.);
   - **palette tool-switch commands keep the label `Switch to <navTitle>`**;
   - render `<ToolHost activeId=… />`;
   - the default tool is `json-workbench`.
6. `Header.tsx`:
   - map the registry to tabs in this order: json-workbench, jwt-decoder, regex-tester, timestamp-converter, encode-generate, debug-report (`data-testid="tool-tab-<legacyHash>"`, unchanged);
   - tab labels stay exactly as V1: "JSON Workbench", "JWT Decoder", "Regex Tester", "Timestamp Converter", "Generators & Converters", "Debug Report". Use a local label map; this header is temporary until T-105.
7. **e2e network rule (explicitly allowed edit).** Replace the single line
   ```js
   check("zero_network_after_load", requestsAfterLoad.length === 0, JSON.stringify(requestsAfterLoad));
   ```
   with:
   ```js
   const offOriginOrNonAsset = requestsAfterLoad.filter((r) => !r.url.startsWith(BASE + "assets/"));
   check("zero_network_after_load", offOriginOrNonAsset.length === 0, JSON.stringify(offOriginOrNonAsset));
   check("only_same_origin_assets_after_load", requestsAfterLoad.every((r) => r.url.startsWith(BASE + "assets/") && ["script", "stylesheet", "font", "image"].includes(r.resourceType)), JSON.stringify(requestsAfterLoad));
   ```

   Do not change the other request checks. Note that until T-104 removes the single-file plugin, chunks are inlined and the list is simply empty.

**Acceptance criteria:**
- AC1: `npm run check` passes, including `check:registry`.
- AC2: e2e passes every previous check plus `only_same_origin_assets_after_load`. In particular, `json_state_preserved_after_tool_switch` and `generators_base64_input_preserved_across_tool_cycle` still pass (keep-alive works).
- AC3: `App.tsx` no longer statically imports any `src/tools/**` module.
- AC4: Opening `#debug` directly still shows Debug Report.

---

## T-104: Multi-file build, path URLs, static SEO pages, V3 CSP

**Goal.**
- Remove the single-file bundle.
- Every tool gets its own URL (`/json-formatter/` …) with a prerendered, crawlable page.
- The CSP moves to the V3 form.
- Old `#hash` links redirect to the new paths.

**Files:**
- `vite.config.ts`
- `package.json` (uninstall `vite-plugin-singlefile`; build script)
- `index.html`
- `scripts/postbuild-security.mjs` (replace it with `docs/v3/reference/postbuild-security.v3.mjs`)
- `scripts/check-budgets.mjs` (new)
- `src/App.tsx` (routing)
- `src/shell/navigation.ts` (new)
- `src/index.css` (`.prerender` styles)
- `public/sitemap.xml` (delete; it is generated now)
- `README.md` + `SECURITY.md` (privacy wording, §6.2 of the architecture)
- `test/e2e.cjs` (the allowed edits listed below)

**Steps:**
1. `npm uninstall vite-plugin-singlefile`. Replace `vite.config.ts` with:
   ```ts
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";
   // Multi-file static build (V3): hashed, cacheable assets under dist/assets/,
   // one lazy chunk per tool. No backend. See docs/v3/ARCHITECTURE.md §6.
   export default defineConfig({
     plugins: [react()],
     build: { target: "es2020", assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
   });
   ```
2. In `index.html`, wrap the `<title>`, description, canonical, `og:*` and `twitter:card` tags in `<!--SEO_HEAD_START-->` … `<!--SEO_HEAD_END-->`. Make the root `<div id="root"><!--PRERENDER--></div>`.
3. Build script:
   ```
   "build": "tsc --noEmit && vite build && tsx scripts/postbuild-pages.ts && node scripts/postbuild-security.mjs && node scripts/check-budgets.mjs"
   ```
   Then copy `docs/v3/reference/postbuild-security.v3.mjs` over `scripts/postbuild-security.mjs` (exact copy).
4. Delete `public/sitemap.xml`. `robots.txt` stays. postbuild-pages writes the sitemap.
5. `scripts/check-budgets.mjs` gzips (`zlib.gzipSync`) every `dist/assets/*.js` and `*.css` and enforces ARCHITECTURE §6.3:
   - the entry chunk is the JS referenced by the module script in `dist/index.html`. Vite writes `<script type="module" crossorigin src="/assets/…">`, so match it with `/<script[^>]*type="module"[^>]*src="([^"]+)"/`;
   - shared chunks over 120 kB gzip are allowed only if their file name contains `codemirror`, `vendor` or `index`. Set `build.rollupOptions.output.manualChunks` so every `@codemirror/*`, `@lezer/*` and `@uiw/*` module lands in a chunk named `codemirror`;
   - CSS total ≤ 30 kB gzip;
   - every `.html` ≤ 40 kB raw.

   It prints a table and exits 1 on any violation.
6. Routing. Create `src/shell/navigation.ts`:
   ```ts
   export function currentRoute(): Route;      // parseRoute(location.pathname, ROUTE_TABLES)
   export function navigate(path: string): void; // pushState + dispatch a custom "dth:navigate" event
   export function onRouteChange(cb: () => void): () => void; // listens to popstate + dth:navigate, returns unsubscribe
   export function interceptLinkClick(e: React.MouseEvent<HTMLAnchorElement>, path: string): void;
   // only plain left click without modifiers → preventDefault + navigate
   ```
   In `App.tsx`:
   - on mount, if `legacyRedirect(location.pathname, location.hash, ROUTE_TABLES)` returns a path, call `history.replaceState(null, "", path)`;
   - the route drives `activeId`. Home (`/`) shows `json-workbench` **until T-106**;
   - the page kind and notfound also show json-workbench until T-106;
   - switching tools calls `navigate(toolPath(slug))` instead of setting the hash;
   - `document.title` follows ARCHITECTURE §5.
7. Add `.prerender` styles to `src/index.css`:
   ```css
   .prerender { max-width: 760px; margin: 0 auto; padding: 48px 24px; color: rgb(var(--c-ink)); font-size: 15px; line-height: 1.6; }
   .prerender h1 { font-size: 28px; line-height: 1.25; font-weight: 650; margin: 0 0 12px; }
   .prerender h2 { font-size: 17px; font-weight: 600; margin: 28px 0 8px; }
   .prerender h3 { font-size: 15px; font-weight: 600; margin: 16px 0 4px; }
   .prerender p, .prerender li { color: rgb(var(--c-ink-dim)); }
   .prerender a { color: rgb(var(--c-accent)); }
   .prerender-crumb { font-size: 13px; }
   ```
   (outside the Tailwind layers).
8. Wording. Replace README §"Privacy" and SECURITY.md's second bullet with `PRIVACY_PROMISE` from `src/registry/pages.ts`, word for word. Keep the counters sentence.
9. **e2e allowed edits (exactly these; nothing else in the V1 part changes):**
   - **(0a)** `title_is_dev_tools_hub`: change `(await page.title()) === "Dev Tools Hub"` to `/Dev Tools Hub/.test(await page.title())`.
   - **(0b)** `initial_requests_only_document`: change `allRequests.length <= 1` to `allRequests.filter((u) => !u.startsWith(BASE + "assets/")).length <= 1`.
   - **(0c)** `hash_updates_on_switch`: change `(await page.evaluate(() => location.hash)) === "#jwt"` to `(await page.evaluate(() => location.pathname)) === "/jwt-decoder/"`.
   - **(a)** Keep `BASE` as the root. The V1 suite's first navigation `page.goto(BASE, …)` must still land on JSON Workbench. Until T-106 that is true, so there is no edit.
   - **(b)** Insert a section `// ---- paths & pages (T-104) ----` immediately before `await browser.close();`, using `newCheckedPage(context)` for every navigation, with these checks:
     - `path_<slug>_loads` for each of the 6 tool slugs: goto `BASE + slug + "/"`, wait for networkidle, and expect the tool's root test id: `main-editor` (json-formatter), `jwt-input` (jwt-decoder), `regex-pattern-input` (regex-tester), `timestamp-epoch-input` (timestamp-converter), `generators-submode-base64` (encode-generate) or `debug-input` (debug-report).
     - `legacy_hash_redirects`: goto `BASE + "#jwt"` → `location.pathname === "/jwt-decoder/"`.
     - `prerender_has_h1`: fetch `dist/jwt-decoder/index.html` from disk and check it contains `<h1>JWT Decoder</h1>`.
     - `csp_meta_on_every_page`: every `dist/**/*.html` except `waitlist*` contains `connect-src 'none'`.
     - `headers_csp_per_page`: `dist/_headers` contains `/jwt-decoder/` followed by a CSP line, and **no** CSP under `/*`. The existing `headers_csp_not_on_wildcard` check already covers the second part.
     - `sitemap_lists_tools`: `dist/sitemap.xml` contains `/debug-report/`.
     - `notfound_page_exists`: `dist/404.html` contains "Page not found".

**Lazy loading and e2e timing.** If a V1 check fails only because a lazily loaded tool is not visible yet, you may insert `await page.getByTestId("<that tool's root test id>").waitFor();` right after the navigation click. This is not weakening a test. List every insertion in your report.

**Acceptance criteria:**
- AC1: `npm run check` passes, including the budgets table printed by check-budgets.
- AC2: e2e: all previous checks plus the new T-104 checks PASS. `zero_network_after_load` and `only_same_origin_assets_after_load` both PASS now that lazy chunks are real files.
- AC3: `dist/` contains index, 404, privacy, about, the 6 tool folders, `assets/`, `_headers`, `robots.txt`, `sitemap.xml` and the 2 waitlist pages.
- AC4: `grep -L "connect-src 'none'"` over the app HTML pages returns nothing.
- AC5: `npx vite preview`, then opening `http://localhost:4173/#debug` shows Debug Report at `/debug-report/`.

**Note for the reviewer:** the build-pipeline half of this task was pre-verified: e2e 250/252 with this exact CSP and zero console errors. The 2 failures were exactly (0a) and (0b) above, and with those edits applied it was 252/252.

---

## T-105: App shell: sidebar, top bar, mobile drawer

**Goal.** Replace the V1 top-tab header with the V3 shell from UX_SPEC §3 and `docs/v3/design/reference.html`.

**Files:**
- `src/shell/Sidebar.tsx` (new)
- `src/shell/TopBar.tsx` (new)
- `src/shell/PrivacyPopover.tsx` (new)
- `src/shell/MobileDrawer.tsx` (new)
- `src/shell/useRecentTools.ts` (new)
- `src/components/IconButton.tsx`, `Popover.tsx`, `Kbd.tsx` (new)
- `src/App.tsx`
- `src/registry/icons.ts` (add `Home`, `Star`, `Menu`, `Github`, `Sun`, `Moon`, `Monitor`, `PanelLeftClose`, `PanelLeftOpen`, `Circle` if you use them)
- `src/components/Header.tsx` (delete when unused)
- `test/e2e.cjs` (the allowed edits in step 6 only)

**Steps:**
1. Layout:
   - grid `grid-cols-[248px_1fr]` (≥ 1024 px), `56px` when collapsed;
   - the sidebar is sticky full-height and scrolls on its own;
   - the main column has `TopBar` (52 px, sticky) and then the page.
2. Sidebar:
   - brand (mark "{}" in an `accent-strong` 26 px square + "Dev Tools Hub", linking to `/`);
   - "Home";
   - "Recent" (up to 5 ids from `useRecentTools`, hidden when empty);
   - then categories in `CATEGORY_ORDER`, each with its tools from the registry (icon looked up in `ICONS` from `src/registry/icons.ts`, with a `Circle` fallback; never `import *` from lucide-react);
   - footer "⌘K Commands" and "v3.0 · MIT".

   Item states are as in UX_SPEC §3.1. Each tool link in the **category list**:
   - is `<a href="/<slug>/" onClick={interceptLinkClick}>`;
   - carries `data-testid="tool-tab-<legacyHash>"` when the tool has a `legacyHash` (this keeps the V1 e2e selectors working), and `data-testid="nav-<id>"` otherwise;
   - has `aria-current="page"` when active.

   **Test ids must be unique on the page** (Playwright strict mode):
   - Recent links use `data-testid="recent-<id>"`, never `tool-tab-*`;
   - the `<nav>` element of the category list has `data-testid="tool-switcher"`;
   - below 768 px the desktop sidebar is **not rendered at all** (use a `useMediaQuery("(min-width: 768px)")` hook), and `MobileDrawer` is **mounted only while open**. So exactly one copy of each `tool-tab-*` exists at any time.

   **Recent tools** (moved here from T-106): `useRecentTools` records the id in `dth.recent` (ids only, at most 8, most recent first, try/catch) every time a tool route becomes active.
3. Collapse:
   - the `[` key (when focus is not in an input, textarea or contenteditable) and a button at the bottom of the sidebar;
   - persisted in `dth.sidebar`;
   - collapsed state shows icons only, with `Tooltip` names.
4. TopBar:
   - a search button (`data-testid="btn-open-palette"`, text "Search tools…" + `Kbd` ⌘K or Ctrl K detected via `navigator.platform`/`userAgentData`);
   - a spacer;
   - the privacy pill: a `<button>` whose visible text is "Processed locally" with a green dot before it. It opens `PrivacyPopover` with `PRIVACY_PROMISE`, the line `connect-src 'none'` and a "How to verify" link to `/privacy/`. The visible text matters: the V1 check `privacy_badge_mentions_csp` clicks the button named `/processed locally/i`;
   - the theme button (moved from Header, same `data-testid="btn-theme"`);
   - a GitHub link (`https://github.com/Nikhil03-hub/dev-tools-hub`, `target="_blank" rel="noopener noreferrer"`, aria-label "Source code on GitHub").
5. Mobile (< 768 px):
   - the sidebar is hidden;
   - the TopBar shows a ☰ `IconButton` (`data-testid="btn-menu"`) that opens `MobileDrawer` (full-height overlay containing the same Sidebar content, Esc / scrim click closes it, focus trapped, focus returns to ☰);
   - tablet (768–1023 px) defaults to collapsed.
6. e2e. The V1 checks click `tool-tab-*` test ids only at 1440 px width, where they are now sidebar links, so they keep working. Every V1 mobile block resets to 1440 before clicking a tab.

   **Allowed edit (exactly one).** In the Debug mobile block, replace the two lines
   ```js
   const navInfo = await page.getByTestId("tool-switcher").evaluate((el) => ({ ov: getComputedStyle(el).overflowX, sw: el.scrollWidth, cw: el.clientWidth }));
   check("debug_nav_scrolls_not_page_on_mobile", w844 <= 390 && (navInfo.ov === "auto" || navInfo.ov === "scroll") && navInfo.cw <= 390, JSON.stringify(navInfo));
   ```
   with
   ```js
   const menuVisible = await page.getByTestId("btn-menu").isVisible();
   check("debug_nav_scrolls_not_page_on_mobile", w844 <= 390 && menuVisible, JSON.stringify({ w844, menuVisible }));
   ```
   (On mobile, navigation now lives in the drawer behind ☰.)

   Insert a section `// ---- shell (T-105) ----` immediately before `await browser.close();`, using `newCheckedPage(context)`, with these checks:
   - `shell_sidebar_has_all_tools`: 6 tool links;
   - `shell_recent_updates`: after visiting jwt and regex, the Recent list shows both;
   - `shell_collapse_persists`: collapse, reload, still collapsed, then expand again;
   - `shell_mobile_drawer_opens` at 390 px;
   - `shell_no_horizontal_overflow_390`: `document.documentElement.scrollWidth <= 390`;
   - `shell_privacy_popover_text`: contains `connect-src 'none'`.

**Acceptance criteria:**
- AC1: `npm run check` passes. AC2: e2e is all green (V1 + new checks).
- AC3: It matches the reference design (reviewer compares screenshots at 1440×900 in both themes and at 390×844).
- AC4: Keyboard: Tab reaches every sidebar link in order, focus rings are visible, and Esc closes the drawer and the popover.

---

## T-106: Home page with "Paste anything" detection

**Goal.** `/` becomes the home page (UX_SPEC §4.1). Pasted text gets tool suggestions and a secrets warning.

**Files:**
- `src/core/detect/detect.ts` + `detect.test.ts` (new)
- `src/shell/HomePage.tsx` (new)
- `src/shell/handoff.ts` (new)
- `src/shell/StaticPage.tsx` (new, for privacy/about/404)
- `src/App.tsx`
- every V1 tool: accept a handed-off input (see step 3)
- `test/e2e.cjs` (allowed edits, step 6)

**Steps:**
1. `detect.ts` (pure):
   ```ts
   export interface Detection { toolId: string; confidence: number; label: string }
   // label example: "Looks like a JWT"
   export function detectInput(text: string): Detection[]; // sorted by confidence desc, max 3, only confidence >= 0.5
   export function countLikelySecrets(text: string): { total: number; categories: string[] };
   // use Redactor from src/lib/debugkit/redact on at most the first 200,000 chars; categories = distinct category names
   ```
   Rules (first 200,000 characters only; trimmed):

   | Input | Tool | Confidence | Label |
   |---|---|---|---|
   | whole text matches `^(Bearer\s+)?eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$` | `jwt-decoder` | 0.95 | "Looks like a JWT" |
   | starts with `curl ` (case-insensitive) | `debug-report` | 0.9 | "Looks like a cURL command" |
   | the same | `curl-converter` | 0.7 | — (rule active only once that tool exists in the registry) |
   | `JSON.parse` succeeds and the value has `log.entries` array | `debug-report` | 0.95 | "Looks like a HAR file" |
   | `JSON.parse` succeeds **and the text is not only digits** | `json-workbench` | 0.9 | "Looks like JSON" |
   | first line matches `^(GET\|POST\|PUT\|PATCH\|DELETE\|HEAD\|OPTIONS) \S+ HTTP/` or `^HTTP/\d(\.\d)? \d{3}` | `debug-report` | 0.85 | "Looks like an HTTP message" |
   | ≥ 3 lines and ≥ 30% of lines contain `ERROR\|WARN\|Exception\|Traceback\|panic:` or match `^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}` | `debug-report` | 0.75 | "Looks like a log" |
   | `^\d{10}$` or `^\d{13}$` | `timestamp-converter` | 0.9 | "Looks like a Unix timestamp" |
   | length ≥ 16, `%[0-9A-Fa-f]{2}` present | `encode-generate` | 0.6 | "Looks URL-encoded" |
   | length ≥ 16, `^[A-Za-z0-9+/]+={0,2}$`, length % 4 == 0 | `encode-generate` | 0.55 | "Looks like Base64" |
   | starts and ends with `/` and has ≥ 3 chars | `regex-tester` | 0.5 | "Looks like a regex" |

   - Each Detection may carry `hint?: "base64" | "url"` (set by the two `encode-generate` rows).
   - Ties are broken by row order in this table (earlier row wins).
   - Only return tools that exist: the function takes an optional `availableIds: ReadonlySet<string>`, and the app passes the registry ids.
   - Later tasks append rules.
   - Tests: every row, plus negatives (plain English sentence → []), plus the never-throws fuzz loop, plus a 2 MB input finishing in < 300 ms.
2. `HomePage.tsx` follows UX_SPEC §4.1 exactly:
   - hero;
   - detect box (`data-testid="home-paste"`), with chips `data-testid="home-suggest-<toolId>"`;
   - the secrets warning (`data-testid="home-secrets-warning"`);
   - continue row;
   - category grids (cards are `<a>` with `data-testid="home-card-<id>"`);
   - trust strip;
   - footer.
3. `handoff.ts`: `setHandoff(toolId, text, hint?)` / `takeHandoff(toolId): { text: string; hint?: string } | null`. It is a module-level `Map` in memory, read once (taking removes it).
   - When a suggestion chip is clicked: `setHandoff(id, text, hint)`, then `navigate(toolPath(slug))`.
   - **`ToolHost` stays mounted on every route** (home and static pages just hide it with `hidden`), so keep-alive is never lost.
   - Each V1 tool calls `takeHandoff(<its id>)` in a `useEffect` that runs when `isActive` becomes true (including the first mount if it starts active). If there is a payload, it applies it with exactly these setters:

     | Tool id | Apply |
     |---|---|
     | `json-workbench` | `setMainContent(text)` |
     | `jwt-decoder` | `setToken(text.replace(/^Bearer\s+/i, ""))` |
     | `regex-tester` | if `text` matches `/^\/([\s\S]+)\/([a-z]*)$/`: `setPattern(group1)` and turn on each flag in group2 that `UiFlags` supports; otherwise `setText(text)` |
     | `timestamp-converter` | `setMode("fromEpoch")`, then `setEpochInput(text.trim())` |
     | `encode-generate` | hint `base64`: `setSubMode("base64")`, `setB64Direction("decode")`, `setB64Input(text)`; hint `url`: `setSubMode("url")`, `setUrlDirection("decode")`, `setUrlInput(text)` |
     | `debug-report` | `setInput(text)` (the analysis already runs on the debounced input) |

     Check the real names in each file before using them; if a name differs, use the tool's equivalent setter and note it in the report.
4. Routing: `/` → `HomePage`; `/privacy/` and `/about/` → `StaticPage` (heading + paragraphs from `STATIC_PAGES`, same look as the docs block); not found → `StaticPage` notfound with a search button that opens the palette.
5. Recent tools are already recorded since T-105; the home "Continue" row reads them.
6. **e2e allowed edits:**
   - change the first navigation (`page.goto(BASE, …)` near the top) to `page.goto(BASE + "json-formatter/", …)`;
   - change the CSP probe navigation near the end (`probe.goto(BASE, …)`) to `BASE + "json-formatter/"`.

   New checks, in a section inserted immediately before `await browser.close();` and using `newCheckedPage(context)`:
   - `home_loads` (h1 text);
   - `home_detects_jwt`: on a `newCheckedPage`, open `/jwt-decoder/`, click `btn-jwt-sample`, read the token from `jwt-input`, then go to `/`, fill `home-paste` with it → chip `home-suggest-jwt-decoder` visible. (Do not put a literal JWT in e2e.cjs: gitleaks would flag it.);
   - `home_handoff_jwt` (click it → URL `/jwt-decoder/` and the JWT input contains the token);
   - `home_secrets_warning` (paste a cURL with `Authorization: Bearer <demo JWT>` → warning visible);
   - `home_cards_link` (card count equals the registry tool count);
   - `privacy_page_loads`;
   - `notfound_page_for_unknown_path`.

**Acceptance criteria:**
- AC1: check passes. AC2: e2e is green. AC3: unit coverage of every detect rule. AC4: the pasted text never appears in the URL or in localStorage. Add e2e check `handoff_not_persisted`: after the handoff, `JSON.stringify(localStorage)` does not contain the token.

---

## T-107: Command palette v2 with fuzzy search and recent tools

**Files:**
- `src/core/search/fuzzy.ts` + test (new)
- `src/components/CommandPalette.tsx`
- `src/App.tsx`
- `test/e2e.cjs` (new section only)

**Steps:**
1. `fuzzy.ts`:
   ```ts
   export interface SearchItem { id: string; text: string; keywords?: string[]; group: string }
   export function scoreMatch(query: string, item: SearchItem): number;
   // 0 = no match; exact prefix of text 100, word-prefix 80, keyword prefix 70, substring 50, subsequence 20; case-insensitive
   export function rankItems<T extends SearchItem>(query: string, items: T[], recentIds?: string[]): T[];
   // sort score desc, then recency, then input order; empty query → recent first then input order
   ```
   Tests cover each score tier, the ordering and empty queries.
2. **Empty query:** the palette shows groups:
   - "Recent";
   - "Tools" (every registry tool, label `Switch to <navTitle>`, or `Go to Home` on home);
   - "Actions" (active tool commands);
   - "General" (Toggle theme, Collapse sidebar, Go to home, Privacy).

   **Non-empty query:** one flat list of every item from all groups, ranked by `rankItems`. Each row shows its group as right-aligned `micro` text. Ties are broken in this order: actions of the active tool, then tools, then general. **Enter runs the first row.** (The V1 check `palette_command_switches_tab` types "typescript" and presses Enter. The JSON action "Go to TypeScript view" scores 80 as a word prefix and beats the JSON Workbench tool's keyword match, 70, so it stays green.)

   Accessible `listbox`/`option` roles, `aria-activedescendant`. `/` opens the palette when focus is not in an editable field.
3. Keep `data-testid="command-palette"` and keep the "Switch to X" labels: the e2e suite depends on them.

**Acceptance criteria:**
- AC1: check passes. AC2: e2e is green.
- AC3: new e2e checks, in a section inserted immediately before `await browser.close();` using `newCheckedPage(context)`:
  - `palette_fuzzy_yaml_like`: typing "jwtdec" ranks JWT Decoder first;
  - `palette_slash_opens`;
  - `palette_recent_section`.

---

## T-108: Tool page frame + shared components

**Goal.** Every tool renders inside `ToolLayout` (UX_SPEC §4.2), with the docs block below the workspace. Shared components are created (UX_SPEC §5) and the local skeleton and error boundary from T-103 are replaced.

**Files:**
- `src/shell/ToolLayout.tsx`
- `src/components/{Button,Toggle,Segmented,Tabs,Pane,CopyButton,DownloadButton,EmptyState,Badge,Tooltip,ErrorBoundary,ToolSkeleton}.tsx`
- `src/shell/ToolHost.tsx`
- `test/e2e.cjs` (new section only)
- The 6 V1 tool files are **not** changed: ToolHost does the wrapping.

**Steps:**
1. `ToolLayout`:
   - props `{ tool: ToolMeta; actions?: ReactNode; children: ReactNode }`;
   - renders breadcrumb, H1, description, the privacy line, actions on the right, the workspace container at height `max(520px, calc(100vh - 220px))`, and below it the docs block (How to use, FAQ as `<details>`, Related tools as small cards linking with `interceptLinkClick`).
2. ToolHost wraps each tool in `ToolLayout` using its meta, so the tool files don't need to import it. The V1 tools' own top toolbars stay inside the workspace.
3. Build the shared components exactly to UX_SPEC §5, then use `Button`, `Tabs` and `EmptyState` **only in new code from now on**. Migrating V1 internals is not part of this task.
4. `ErrorBoundary` shows "This tool hit an error. Your input is still here." with a "Reset tool" button that remounts the tool.

**Acceptance criteria:**
- AC1: check passes. AC2: every V1 e2e check stays green.
- AC3: new e2e checks, in a section inserted immediately before `await browser.close();` using `newCheckedPage(context)`:
  - `toollayout_h1_<id>` for all 6 tools;
  - `toollayout_docs_block` (How to use visible after scrolling);
  - `toollayout_related_links_navigate`.
- AC4: page-level vertical scroll works on 1440×900 and 390×844, with no horizontal overflow.

---

## T-109: Accessibility gate + P1 polish (CP1 preparation)

**Files:**
- `package.json` (devDependency `axe-core@4.14.0`, exact)
- `test/e2e.cjs` (new a11y section only)
- fixes in the shell components only

**Steps:**
1. In a section inserted immediately before `await browser.close();`, for each of `/`, `/privacy/` and each tool page, in both themes (use `newCheckedPage(context)`, then set the theme with `p.evaluate(() => { localStorage.setItem("dth.theme", "<light|dark>"); })` and reload):
   - inject axe with `await p.evaluate(require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));`. **Do not use `page.addScriptTag`**: it creates an inline script, which the V3 CSP (`script-src 'self'`) blocks;
   - run `axe.run(document, { resultTypes: ["violations"] })`;
   - check `a11y_<page>_<theme>`: there are no violations with impact `serious` or `critical`.

   Print the violation ids on failure.
2. Fix every violation found in the shell, home or layout code. If a violation sits inside V1 tool internals, record it in the report as a follow-up instead of rewriting the tool, unless the fix is a one-line attribute.
3. Write `docs/v3/reports/CP1-summary.md`:
   - task list with commits;
   - final `npm run check` output summary;
   - e2e totals;
   - budgets table;
   - 6 screenshots: home, debug and json at 1440 in dark and light, plus home at 390 dark, saved in `test-results/` (they are not committed). List their paths.

**Acceptance criteria:**
- AC1: check passes. AC2: e2e is green, including a11y.
- AC3: The CP1 summary exists.

Then **STOP: Checkpoint CP1.**
