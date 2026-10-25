# Session handoff — V3 P1 progress

Last implementation commit: `a193aa3` (T-106).
Git HEAD on branch `v3` was **`8933bd3`** when T-106 started; verify the real HEAD with `git rev-parse HEAD` rather than trusting this line.
Written by the implementer at the end of a session that started from `74958ec` (V3 plan pack only, no code cloned).

## Where the work stands

| Task | Status | Commit | Gate result |
|---|---|---|---|
| T-000 workspace | DONE | `74958ec` | clone + overlay + `npm ci` + Playwright chromium |
| T-101 tooling and gates | DONE | `d191a2c` | check PASS, e2e 252/252 |
| T-101 fix (win32 clipboard) | DONE | `46c93e8` | isolated, revertible |
| T-102 tokens + themes | DONE | `d45ff71` | check PASS, e2e **256/256** |
| T-101 fix 2 (harden clipboard) | DONE | `0347593` | e2e 256/256, 11-case mutation proof |
| T-103 registry + lazy + keep-alive | DONE | `aad188e` | check PASS, e2e **257/257** |
| T-104 multi-file build + path URLs + SEO + CSP | DONE | `b349b9d` | check PASS, e2e **269/269** |
| Session handoff (first) | DONE | `8367ffc` | — |
| T-105 app shell (sidebar, top bar, drawer) | DONE | `2b2bb2c` | check PASS, e2e **277/277** |
| T-106 home page + paste detection + static pages | DONE | `a193aa3` | check PASS, e2e **286/286** |
| T-107 command palette v2 | DONE | (see git log) | check PASS, e2e **290/290** |
| T-108 tool page frame + shared components | DONE | `601ab4c` | check PASS, e2e **303/303** |
| T-109 accessibility gate + CP1 summary | DONE | see git log | check PASS, e2e **319/319** |
| **CP1** | **AWAITING OPUS REVIEW** | — | reviewer sets PASSED |
| T-107 palette v2 / T-108 tool frame / T-109 a11y | NOT STARTED | — | after T-106 |

`npm run check` = typecheck, boundaries (13 pure files), registry (6 tools), unit 15/15, verify_lib ALL PASS, verify_debugkit 147/147, build with postbuild pages + CSP + budgets, `check-budgets: OK`.

## Read these before starting T-105

1. `docs/v3/tasks/P1_foundation.md` §T-105 — the authoritative spec.
2. `docs/v3/reports/T-105` does not exist yet. Read `T-104.md` for the current shell wiring.
3. Current shell files: `src/App.tsx` (route-driven), `src/shell/navigation.ts`, `src/shell/ToolHost.tsx`, `src/components/Header.tsx` (deleted by T-105), `src/shell/theme.ts`.
4. `src/registry/*` — `meta.ts` is data, `tools.ts` is wiring, `icons.ts` must be extended for any new icon (never `import *` from lucide-react).

## Open findings that need a reviewer decision

Full detail in `docs/v3/reports/A11Y-focus-indicator-finding.md`.

1. **Focus indicator (highest severity).** 17 places remove the outline; 10 have no replacement at all (including every CodeMirror editor). UX_SPEC §2 mandates a 2px accent ring; no P1 task implements it; axe-core 4.14 has **no** focus-appearance rule, so T-109's gate cannot detect it. The token exists and measures 5.22–6.44:1 against every surface. Proposed task: `R-CP1-focus`, with an e2e check that asserts `outlineStyle !== "none"` and a non-transparent outline colour, in both themes.
2. **Copy can report success when it failed.** `copySanitized()` discards `copyText()`'s boolean and toasts "Copied" unconditionally. Belongs to T-108's shared `CopyButton`; UX_SPEC §5 already specifies the failure text.
3. **`codemirror-*.js` is 173 kB gzip and is preloaded on the home page.** Inside budget, but it taxes first paint for visitors who only want a non-editor tool. Consider a per-tool dynamic import of the editor at CP1.
4. **`theme_no_console_errors` does not assert `backToSystem`**, only console errors. Spec-faithful; a one-line strengthening if the reviewer wants it.
5. **`fontSize: "13.5px"`** in `cmTheme.ts` is the only off-scale type value (spec says 13/20).

## Windows-specific facts (do not re-discover these)

- Chromium on win32 rewrites `\n` → `\r\n` on the system clipboard. The clipboard assertion compares content after CRLF→LF normalisation only, requires strings on both sides, and prints shape-only diagnostics (no report content). Do not "fix" a future copy-check failure by weakening equality.
- `npm run test:e2e` refuses to start if anything listens on 4173. A crashed run leaves `vite preview` behind; find its PID with `netstat -ano | grep ":4173" | grep LISTEN` and `taskkill //PID <pid> //F`.
- The e2e output is buffered when redirected to a file, so `PASS=0` mid-run does not mean the suite is idle.
- Commit identity is not configured globally; use `git -c user.name="ANTHATI NIKHIL" -c user.email="nikhil@users.noreply.github.com" commit …`.

## Research outputs (outside the repo, do not commit into it)

- `V3/design-research.md` — 31 sites driven with a real browser, computed styles, WCAG-checked proposals. Its top-10 list corroborates the UX_SPEC (system fonts, one accent, rings-not-borders, 100–120 ms motion) and explicitly rejects GSAP/Magic UI/Aceternity-style decoration and non-Baseline `animation-timeline`.
- `V3/product-research.md` — competitor/pricing pass. Verified by me: HTTP Toolkit Team is now "Get in touch" (plan 04's `$24/user/mo` is stale); `@usebruno/converters` really does 1,064,206 downloads/month; `flare-redact` (MIT, 0 deps, 5,559 dl/mo) exists and is **not** in plan 01, but does no HAR/cURL parsing, no diagnosis and no review UI, so D-03 still holds.
- Verdict recorded: reject the hosted mock-API generator (breaks `connect-src 'none'`, invites exfiltration abuse); defer the code→docs builder (DeepWiki-Open does it free, locally). Neither is in the queue.

## Next steps, in order

1. T-107 (command palette v2: fuzzy search, recents, actions). Spec: `docs/v3/tasks/P1_foundation.md` §T-107. It adds `src/core/search/fuzzy.ts` + tests and reworks `CommandPalette`. Keep the test ids and the "Switch to X" labels.
2. T-107 … T-109, then **STOP at CP1** and hand to Opus with `git log`, the e2e log and screenshots. Do not push.
3. Reviewer decides on `R-CP1-focus` before RC1.

## CP1 review pass (after T-109) — HISTORICAL

A self-audit found and fixed four material defects: 9 legacy controls with no focus indicator, a clipped-ring false pass, the home page downloading the 170 kB editor chunk, and an unreachable regex-flag hand-off. Totals **at that point** were 329/329 e2e with `npm run check` exit 0.

> Do not read the paragraph above as the current state. Two later passes supersede it: **T-110…T-113** (editor keyboard trap, four-edge focus ring, dark hover contrast, palette/drawer/axe/scroll coverage → 356 checks) and **T-114** (rendered regex-highlight contrast, N-1 → current totals, see the section at the end of this file). Of the follow-ups listed below, the 13.5px font is still open and the light-theme scroll assertion landed in T-113.

Read `docs/v3/reports/CP1-review.md` first. CP1 is still **PENDING**: the next action is Opus confirming the review, then the owner pushing `v3`. Non-blocking follow-ups: the 13.5px font, duplicate recents, and a light-theme scroll assertion.

## Lessons from T-105 worth not repeating

- Screenshots caught a defect the suite could not: the mobile drawer rendered as a 56px icon rail because the collapse default was derived from the desktop breakpoint. The e2e check now asserts the drawer's text contains tool labels, so "visible but useless" fails.
- Never verify focus visibility with programmatic `.focus()`: Chromium does not apply `:focus-visible` to it. The shell check presses Tab and then reads `getComputedStyle(activeElement)`.
- `npm run test:e2e` output stays buffered to a file (`PASS=0` mid-run is normal).
- `vite preview` takes ~8–10s to answer on this machine; a 5s curl check reports 000 and is not a failure.

## Handoff — after T-110 … T-113 (2026-10-25)

- **Milestone:** CP1 accessibility repair complete locally. Report: `docs/v3/reports/T-110-T-113.md`.
- **Queue:** T-110…T-113 inserted as rows 10–13 (`DONE`); **CP1 is still `PENDING`** and now depends on `T-109…T-113`.
- **Gates:** `npm run check` exit 0 · `npm run test:e2e` **356 PASS / 0 FAILURE** (was 329).
- **Fixed:** editor keyboard trap (`indentWithTab={false}`), four-edge editor focus ring
  (`::after` overlay above the sticky gutter, pixel-verified), dark hover contrast pair
  (new `--c-accent-strong-hover`), palette focus restoration, drawer `aria-expanded`/
  `aria-controls`, axe coverage to 10 routes, scroll checks in both themes.
- **Not done / open:** `13.5px` editor font (F-1), deploy-time header + 404 status check (F-2),
  Safari/Firefox pass (F-3), palette restore when the opener unmounts (F-4).
- **Boundary:** nothing pushed, nothing deployed, no remote state touched. The owner reviews
  the evidence, then an independent reviewer decides CP1.

## Handoff — after T-114 (2026-10-25)

- **Milestone:** CP1 release blocker N-1 repaired. Report: `docs/v3/reports/T-114.md`.
- **Final verified HEAD:** `0ee8b6e` on `v3` — worktree clean, **18 ahead / 0 behind** `origin/master`.
- **Queue:** T-114 is row 14 (`DONE`); **CP1 remains `PENDING`**, now depending on `T-109…T-114`.
- **Gates on this HEAD:** `npm run check` exit 0 · `npm run test:e2e` **368 PASS / 0 FAILURE** · unit 56/56 · budgets OK.
- **Fixed:** `<mark>` user-agent foreground leak (dark match highlight 2.29:1), the stacked-alpha
  ladder that left the first group level unusable once foregrounds were made explicit, and a
  latent indexing bug that made `GROUP_CLASSES[0]` dead code.
- **Method note for future tasks:** contrast and focus assertions must run against **populated**
  tool states and read composited colours. Empty-page sweeps passed over a real defect twice now.
- **Boundary:** nothing pushed, nothing deployed, no history rewritten. Next stage is a genuinely
  independent CP1 review, then a separate controlled deployment-preview milestone for real
  headers/404 behaviour and the cross-browser pass.

## Handoff — T-115 CP1 closure (2026-10-25)

- **Report:** `docs/v3/reports/CP1-closure.md`. Queue row 15 = `DONE`; **CP1 remains `PENDING`**, depending on `T-109…T-115`.
- **Baseline verified:** started at `78b6698`, clean, 19 ahead / 0 behind. Confirmed by diff that `78b6698` differs from `0ee8b6e` only in two files under `docs/`, and re-ran the gates on the actual HEAD so the tested tree and reported HEAD coincide.
- **Remote state:** `origin/master` only — **no `origin/v3` exists**, so all V3 work remains local. Nothing was pushed, merged, deployed or published in this task.
- **Fixed / closed:**
  - UX_SPEC corrected to the shipped dark `accent` (`#968AFA`) with a measured contrast note, and its Focus clause now records the two clipping-forced exceptions plus the pixel-evidence rule.
  - Editor typography brought to spec: was rendering **13.5px/18.9px**, now **13px/20px** (`code` = 13/20). Closes the long-standing F-1.
  - Palette focus no longer strands on `<body>` when a command unmounts its opener — it lands on the visible route heading; guarded so it cannot fire on page load.
  - `regex_highlight_contrast_no_match_*` now pins the highlight count to exactly 0, so it cannot pass vacuously.
- **Evidence:** `npm run check` exit 0 · `npm run test:e2e` **374 PASS / 0 FAILURE** · unit 56/56 · budgets OK. Parsed all `check(` calls across both revisions: **0 removed, 3 added**. Two mutations (fixture made to match; fallback deleted) each failed exactly their own new tests, then were reverted.
- **Newly recorded, not hidden:** accent-on-active-tint in dark measures **5.15:1** against UX_SPEC's own ≥5.2:1 internal target — not a WCAG failure (gate enforces 4.5:1), documented in UX_SPEC Note 1 as an open shortfall.
- **Trap for future mutation testing:** `npm run test:e2e` does not rebuild; a source mutation must be followed by `npm run build` or the suite silently tests a stale bundle.
- **Awaiting:** owner visual acceptance of the regex highlight change (`test-results/cp1-closure/*.png`), an independent CP1 verdict from a reviewer who did not author T-110…T-115, then RC1 for real headers/404, cross-browser and screen-reader verification.
