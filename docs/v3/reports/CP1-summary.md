# CP1 summary — Phase 1 accepted-work candidate

Prepared by the implementer at the end of P1. **Reviewer action required:** this file is evidence, not acceptance. CP1 stays `PENDING` until Opus reviews and sets it.

Branch `v3`. Nothing pushed, nothing deployed.

## 1. Tasks and commits

| Task | Commit | Gate at the time |
|---|---|---|
| T-000 workspace + plan pack | `74958ec` | clone, overlay (32 files), `npm ci`, Playwright chromium |
| T-101 tooling and gates | `d191a2c` | check PASS, e2e 252/252 |
| T-101 fix (win32 clipboard) | `46c93e8` | isolated, revertible |
| T-102 design tokens + themes | `d45ff71` | check PASS, e2e 256/256 |
| T-101 fix 2 (string-typed, CRLF-only, no content in diagnostics) | `0347593` | e2e 256/256 + 11-case mutation proof |
| T-103 registry + lazy + keep-alive | `aad188e` | check PASS, e2e 257/257 |
| T-104 multi-file build + path URLs + SEO + CSP | `b349b9d` | check PASS, e2e 269/269 |
| handoff | `8367ffc` | — |
| T-105 app shell | `2b2bb2c` | check PASS, e2e 277/277 |
| T-106 home page + paste detection | `a193aa3` | check PASS, e2e 286/286 |
| handoff | `13ae46a` | — |
| T-107 command palette v2 | `99a2705` | check PASS, e2e 290/290 |
| T-108 tool layout + shared components + honest copy | `601ab4c` | check PASS, e2e 303/303 |
| **T-109 accessibility gate + this summary** | see log | check PASS, e2e **319/319** |

## 2. Final gates (measured on the T-109 tree)

`npm run check` → **exit 0**
- `check:boundaries` OK — 17 pure files
- `check:registry` OK — 6 tools
- `test:unit` — **54 passed / 5 files**
- `verify:lib` ALL PASS
- `verify_debugkit` — **147 passed, 0 failed**
- `postbuild-pages` — 6 tool pages + 3 static + 404 + sitemap (9 URLs)
- `postbuild-security` — CSP on 10 app pages + `_headers`
- `check-budgets` OK

| Bundles (gzip) | kB |
|---|---|
| entry `index-*.js` | 63.5 |
| shared `codemirror-*.js` | 173.0 (allowed by name) |
| largest tool chunk (`JsonWorkbenchApp`) | 48.4 |
| `DebugReportApp` | 22.7 |
| CSS total | 6.1 (limit 30) |
| largest HTML | 3.8 (limit 40) |

`npm run test:e2e` → **319 PASS, 0 FAILURE**, exit 0 (log `V3/e2e-T109b.log`). Zero console errors, zero requests after load beyond same-origin assets.

## 3. Accessibility gate (T-109)

axe-core **4.14.0** (exact) injected from disk into every page in both themes — 8 pages × 2 themes = **16 checks, all green**. No serious or critical violations.

Four real defects were found and fixed to get there:
1. **`label-content-name-mismatch`** on the sidebar palette button, sidebar collapse button and top-bar search button — accessible names did not contain their visible text (WCAG 2.5.3). Fixed by letting the visible text be the name, moving the version string out of the button, and using `sr-only sm:not-sr-only` so the icon-only mobile button still has a name.
2. **`aria-input-field-name` / `aria-prohibited-attr`** in the JSON editor — `aria-label` sat on a wrapper `div` (prohibited, and invisible to the textbox). Moved onto CodeMirror's contenteditable via `EditorView.contentAttributes`.
3. **`color-contrast` on CodeMirror's default placeholder (#888)** — measured **3.3:1** on the light surface. Now uses `--c-ink-faint`.
4. **`color-contrast` 4.40:1** for accent text on the `accent/15` active tint in dark mode. Raised `--c-accent` from `139 124 248` to `150 138 250` (4.76:1 on that tint, still ≥5.2:1 on every surface). This is a **token change** and needs reviewer sign-off; the UX_SPEC table only claimed contrast on plain surfaces.

## 4. Screenshots (not committed; `test-results/` is gitignored)

- `test-results/cp1/home-1440-dark.png`
- `test-results/cp1/home-1440-light.png`
- `test-results/cp1/debug-1440-dark.png`
- `test-results/cp1/debug-1440-light.png`
- `test-results/cp1/json-1440-dark.png`
- `test-results/cp1/json-1440-light.png`
- `test-results/cp1/home-390-dark.png`

Additional evidence: `test-results/t105/`, `t106/`, `t108/` (shell, home, tool layout; collapsed rail and mobile drawer).

## 5. Bugs found by the gates during P1 (not in the original plan)

- **Windows clipboard CRLF** made one V1 check unpassable; fixed with a string-typed, CRLF-only comparison and a mutation proof.
- **Duplicate tool mount** in the first ToolHost (two live editors, duplicate test ids) — caught by the suite.
- **`headers_csp_per_page` regex** spanned blocks and reported a false positive — caught by the suite.
- **Mobile drawer rendered as an icon rail** — caught by screenshots, not tests; a label assertion now guards it.
- **Clipped, unreachable docs block**: the main column lacked `min-h-0`, so the page grew inside `overflow-hidden` and the docs could not be scrolled to — caught by the T-108 scroll check.

## 6. Open findings and decisions needed before RC1

1. **`R-CP1-focus` (needs a queue entry from the reviewer).** 17 legacy `outline-none` sites; 10 have no replacement. New components use `.focus-ring`, but the legacy tool inputs and every CodeMirror editor still erase the ring. **axe cannot detect this** — axe 4.14 has no focus-appearance rule. Needs a dedicated task with a Tab-driven computed-style test in both themes.
2. **Token change** `--c-accent` in dark (see §3.4) — accept or revert.
3. **Regex hand-off applies pattern/text but not flags** (`UiFlags` mapping unconfirmed).
4. **Home page loads CodeMirror** via the keep-alive fallback tool: ~223 kB gzip on the most-visited page. Measured trade-off for a CP1 decision.
5. **Palette Recents duplicate Tools entries**; and **sidebar Recent duplicates the active tool**.
6. **`theme_no_console_errors` does not assert `backToSystem`** (spec-faithful; one-line strengthening available).
7. **`fontSize: "13.5px"`** remains the only off-scale type value (spec says 13/20).
8. **Desktop scroll check runs in one theme only**; layout is theme-independent.

## 7. Press / deploy state

- `git status`: clean after the T-109 commit.
- **Nothing has been pushed. Nothing has been deployed.** No Netlify command has run in this phase.
