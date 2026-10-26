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

 - **Verified HEAD for this milestone:** `3083922` (gates ran on this tree). The commit that records this hash is docs-only and changes no source, test or config file.
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

## GitHub synchronisation — v3 review branch published (2026-10-25)

Owner authorised a controlled review-branch push; `master` and deployment stay protected.

| Item | Value |
|---|---|
| Local branch / HEAD | `v3` @ `92b4da9933b11921b7ac6eab50ce6fc8ad47ace2` |
| Remote | `origin` = `https://github.com/Nikhil03-hub/dev-tools-hub` |
| Published branch | `v3` (newly created — **no force-push, no history rewrite**) |
| Remote HEAD after push | `92b4da9…` — **matches local exactly** (verified by `git ls-remote` + re-fetch) |
| `origin/master` | `c7488ef` — **unchanged**, no merge, no release, no deploy |
| Tracking | `v3` → `origin/v3`, 0 ahead / 0 behind, worktree clean |
| Commits published | 21 at the first push (`92b4da9`), 22 including this record — range `74958ec` (T-000) → `21e1931`, i.e. T-000, T-101…T-115 and their repair/docs commits |
| Gates on the published tree | `npm run check` exit **0**; `npm run test:e2e` exit **0**, **374 PASS / 0 FAILURE**; unit 56/56; budgets OK. Logs: `test-results/cp1-verify/push-check.log`, `push-e2e.log` |
| Pre-publish scan | 121 unique files in range; **no** binaries, screenshots, logs, `dist/`, `.env`, keys or local paths. Secret-pattern matches were only the owner's already-public name, the GoatCounter site code (a public URL host, not a credential) and repo URLs. `gitleaks` is not installed locally, so the authoritative scan remains CI's. |

### CI status — explicitly NOT green for v3, because it never ran

`ci.yml` triggers on `push: branches: [master]` and `pull_request`. GitHub's API confirms **5 workflow runs in the repository's history, all on `master`, all `success`, and none for `v3`**. So the published branch carries **no CI verdict** — the local gates above are the only evidence for it.

**To obtain a CI verdict on this work, open a PR `v3` → `master`** (the `pull_request` trigger runs the same job; a PR is not a merge and can be closed). Note CI's coverage is a **subset** of the local gate: secret scan, `tsc`, `check:boundaries`, `test:unit`, `verify:lib`, `verify:debugkit`, `build` — it does **not** run `check:registry` and has **no Playwright/e2e step**, so CI passing would not re-verify any browser behaviour.

### Also surfaced by the push

GitHub reported **1 open moderate dependency vulnerability on the default branch** (`security/dependabot/5`). It concerns `master`, not `v3`, but it belongs in RC1's release checklist and should be triaged before any deploy decision.

### Reviewer entry point (what to read, in order)

1. `docs/v3/TASK_QUEUE.md` — CP1 is row 16, `PENDING`; rows 10–15 are `DONE` (implementer status, not acceptance).
2. `docs/v3/REVIEW_PROTOCOL.md` — who may set `PASSED`.
3. `docs/v3/UX_SPEC.md` §2 (tokens + Focus clause incl. the two recorded exceptions and the 5.15:1 shortfall note) and §9.
4. `docs/v3/tasks/P1_foundation.md` §T-109 — the actual CP1 acceptance criteria (AC1/AC2/AC3).
5. Reports: `T-110-T-113.md`, `T-114.md`, `CP1-closure.md`, `CP1-summary.md`, `CP1-review.md`, `A11Y-focus-indicator-finding.md`.
6. Evidence: `test/e2e.cjs` (374 checks), `test-results/cp1-verify/*.log`, `test-results/cp1-closure/*.png` (12 populated-state screenshots, both themes).

**Specifically ask the reviewer to challenge:** the 374/0 and 56/56 claims against the logs; the palette focus handoff when the opener unmounts (no screen-reader verification exists); the no-match guard and its mutation proof; 13px/20px editors and gutter alignment; rendered highlight contrast in both themes; the 5.15:1 vs 5.2:1 internal-target exception; and that **all** browser evidence is Chromium-only with production headers and real 404 behaviour unverified.

**CP1 remains `PENDING`.** This document was written by the implementer and is not an independent verdict.

---

## Addendum — T-201 YAML ⇄ JSON shipped on `v3` (2026-10-25)

**What happened.** P2 started. `yaml@2.9.1` (ISC, zero dependencies) was added with `--save-exact`, and the first P2 tool went in as two commits: the pure core (`07da1fe`) and the tool + wiring, so the converter logic can be reviewed or dropped independently of the UI.

**Gate state on the final tree.** `npm run check` PASS — 90 unit tests across 6 files (24 YAML core, 37 detector), `check:registry` 7 tools, boundaries 19 pure files, `verify:lib` and `verify:debugkit` ALL PASS (225 checks), build and size budgets OK, 10 static URLs generated. `npm run test:e2e` PASS 413 / FAIL 0 with no console errors. Four deliberate mutations and their exact failures are recorded in `reports/T-201.md`; every mutated file was restored byte-identically (`diff` verified) before the final run.

**CP1 is still `PENDING`.** T-201 was started on owner instruction while the checkpoint waits, which is a recorded deviation from AGENTS.md §4 — see footnote ¹ in `TASK_QUEUE.md`. The implementer set T-201 to `DONE` and changed no checkpoint row.

**Two things the next task should know.**

1. `test/e2e.cjs` used to hard-code the tool count (`=== 6`) in `shell_sidebar_has_all_tools` and `home_cards_link`; both broke the moment a 7th tool arrived. They now derive it from `dist/<slug>/index.html`, so T-202 … T-206 need no test edit for the count.
2. `npm run test:e2e` does **not** rebuild. Source edits need `npm run build` (or `npm run check`) first, or the suite tests a stale `dist`. It also refuses to start when something already holds port 4173 — a preview server orphaned by a timed-out run will look like a passing suite with 0 checks.

**Open items handed forward, unchanged in status:** the `region`/moderate axe finding that sits on all six tool pages (shared `ToolLayout`, recorded in `reports/T-201.md`), production headers and real 404 behaviour, Firefox/Safari, screen-reader verification of the palette focus handoff, the 5.15:1 vs 5.2:1 internal-target exception, and the Tailwind v4 decision behind three moderate dev-only advisories.

---

## Addendum — T-202 and T-203 shipped on `v3` (2026-10-25)

**Verified remote state.** `origin/v3` = `76e32e7`, matching local HEAD with no divergence. This addendum itself lands as one further docs-only commit on top. Commits since the last handoff: `faaa2e3` (T-201), `792d1f8` (T-202 Text Diff), `cf954cb` + `abc07d8` (T-203 cURL Converter and its test-token fix), `76e32e7` (CI secret-scan fix). `master` and `deploy` untouched. CP1 is still `PENDING`; T-202 and T-203 carry the same owner-instruction footnote ¹ in `TASK_QUEUE.md`.

**Gate state on the shipped tree.** `npm run check` PASS — 149 unit tests (8 files), `check:registry` 9 tools, boundaries 21 pure files, `verify:lib` + `verify:debugkit` ALL PASS, build and size budgets OK, 12 static URLs. `npm run test:e2e` PASS **477 / FAIL 0**, no console errors. Mutation evidence: 4 for T-202, 5 for T-203, each breaking exactly the test that names it, every file restored byte-identically.

**Three things the next task needs to know.**

1. **`npm run test:e2e` fails fast now, and that is new.** The suite used to hang if it threw, because `browser.close()` sat after the failure point; a UI mutation proved it by holding port 4173 and printing nothing for 30 minutes. `main()`'s rejection path now closes the browser. If the suite reports 0 checks, suspect an orphaned `vite preview` on 4173 before suspecting the tests.
2. **CI runs a secret scan that local gates do not.** `.gitleaks.toml` now allows specific *fake literals* by value, on top of the older path-scoped entries. Adding another `paths` line is the easy wrong answer: it stops scanning files that legitimately handle credentials. If a future fixture trips the scan, prefer a value entry, or build the literal at runtime so it never enters history.
3. **Two shared components grew during P2.** `JsonEditor` gained `language="text"` (no grammar) for YAML/Python/Go panes, and the e2e tool count is derived from `dist/<slug>/index.html` instead of a typed number — so T-204…T-206 need no count edit.

**Open items, unchanged in status:** the `region`/moderate axe finding on all nine tool pages (shared `ToolLayout`; recorded in `reports/T-201.md`), production headers and real 404 behaviour, Firefox/Safari, screen-reader verification of the palette focus handoff, the 5.15:1 vs 5.2:1 internal-target exception, the Tailwind v4 decision behind three moderate dev-only advisories, and **Go output from the cURL converter is unvalidated** because no Go toolchain is installed here.

**Next ready task:** T-204 URL parser + query-string editor (`tasks/P2_tools.md`), dependency T-203 → DONE.

---

## Addendum — T-204 URL Parser shipped on `v3` (2026-10-25, late)

**Gate state on the shipped tree, all measured on it:** `npm run check` PASS exit 0 — 186 unit tests (9 files), `check:registry` 10 tools, boundaries 23 pure files, `verify:lib`/`verify:debugkit` ALL PASS, build + budgets OK, 13 URLs generated. `npm run test:e2e` PASS **516 / FAIL 0** exit 0, no console errors; the reconciliation is 477 (the T-203 tree) + 36 `url_parser_*` + 2 `a11y_url-parser_*` + 1 `curl_converter_related_url_parser`. Six targeted mutations, each breaking exactly its own test, each restored byte-identically.

**Commit layout:** the pure core went in first (`facf7ac`) and the UI, wiring, e2e and docs follow in the next commit, mirroring how T-201 was split. `origin/v3` was `582b759` before this task's commits.

**Two things worth carrying forward.**

1. A mutation that *passes* is a finding, not a success. Disabling the protocol-relative branch left all 30 tests green, because `//example.com/x` is handled twice over and the URL parser collapses the extra slashes. The branch was untested rather than wrong; `//localhost:3000/h` (which no other path can reach) made it load-bearing and the mutation then failed as intended. Prefer adding the missing test to deleting the branch.
2. Windows argument quoting is a live hazard for scripted evidence: Git Bash strips embedded `"` from arguments handed to `node -e`, so a mutation pattern containing `"//"` silently never matched and reported a false "no effect". Anchor such patterns on quote-free substrings, and always assert the pattern was found.

**Next task: T-205 Cron Explainer** (`tasks/P2_tools.md`). Both dependencies it needs (`cronstrue@3.38.0`, `croner@10.0.1`, MIT, zero transitive) are already approved for T-205 in `DEPENDENCIES.md` and are **not yet installed** — no package.json change was made while T-204 was in flight.

---

## Addendum — T-205 Cron Explainer shipped on `v3` (2026-10-25, final)

**Verified numbers, each tied to the tree it came from.** `npm run check` PASS exit 0 on the final tree: **237 unit tests (10 files)**, `check:registry` 11 tools, boundaries 25 pure files, both verify scripts ALL PASS, budgets OK, 14 static URLs. `npm run test:e2e` PASS **548 / FAIL 0**, exit 0, no console errors — 516 (T-204's tree) + 30 `cron_*` + 2 a11y route checks. Six mutations, each breaking exactly its own test, each restored byte-identically.

**Batch A status:** T-201, T-202, T-203, T-204 and T-205 are `DONE`; **T-206 CSV ⇄ JSON is the next READY row**, then CP2. Ten shipped tools plus the JSON workbench's own pages make 11 routes.

**Two things worth the next task's attention.**

1. A mutation that produces no failure is a result, not a dead end. Deleting the Quartz branch stayed green because the generic "…has 7 fields…" fallback satisfied the same assertion; the test could not tell the paths apart. Tightening it to require the words "Quartz" and "seconds" made the mutation fail as it should. When an assertion cannot distinguish the code it guards, it is not a test.
2. `H`, `5-1`, and `L` outside the day fields are all *rejected* rather than approximated — the tool states the disagreement instead of producing a confident wrong answer. If a future task wants Quartz or Jenkins support, it needs its own dialect decision, not a permissive regex.

**Also recorded:** the e2e numbers above came from a `dist` built before the last two test-only edits; those files are not part of the bundle, and the final `npm run check` re-validated the same tree. Nothing in this addendum is carried over from an earlier report.


---

## Addendum — T-206 CSV ⇄ JSON shipped on `v3`; Batch A complete (2026-10-26, ~01:15)

**Verified numbers, each tied to the tree it came from.** The tested tree is `c01ffac`. On it: `npm run check` **PASS exit 0** — **328 unit tests (11 files)**, `check:registry` **12 tools**, boundaries **27 pure files**, `verify:lib`/`verify:debugkit` ALL PASS, build OK, `check-budgets: OK`, `postbuild-pages: 12 tool pages + 3 static pages + 404 + sitemap (15 URLs)`. `npm run test:e2e` **PASS 595 / FAIL 0**, exit 0, console errors `(none)` **and console warnings `(none)`** — 548 (T-205's tree) + 45 `csv_json_*` + 2 route checks from the now-derived a11y sweep. Eight mutations, each breaking exactly its own tests; every restore verified by SHA-256 (the runner prints before/after digests, so a partially-restored file cannot pass unnoticed). Local `gitleaks 8.28.0` over all 45 commits: no leaks.

**Commit layout, as before:** pure core first (`8f44b96`, with the two exact-pinned dependencies), then UI + registry + detector + e2e (`303775f`), then the test-only fixes that the first full run exposed (`c01ffac`). papaparse (`5.7.0`, MIT, zero transitive) and `@types/papaparse` (`5.5.2`, dev) were already approved for T-206 in `DEPENDENCIES.md`; `npm` installed them with `^` ranges and they were re-pinned to exact versions by hand.

**Batch A status: complete.** T-201 … T-206 are `DONE`. **Row 23 is CP2, status `PENDING`, and that is where this branch stops** — row 24 (T-301) depends on `CP2` and has not been started. Twelve tool routes now exist.

**Two things worth the next task's attention.**

1. **A green suite can be measuring nothing.** Two assertions were vacuous and only the run told me: `download.path()` is a promise, so reading the downloaded `.csv` threw inside a `catch` that turned a real file into `null`; the populated-theme check read the editor *container*, whose text starts with CodeMirror's line-number gutter, so it would pass on any page. A third gap — the duplicate-header test matching a phrase the module's own fallback path also emits — was spotted by reasoning while planning the mutations, and tightening it first is what made mutation M1 fail one test instead of surviving. Any assertion that cannot distinguish the code path it guards is not a test, and a `catch` that swallows an exception can turn a passing check into a fake one.
2. **Measure the library before trusting its defaults.** Four findings changed the design: papaparse renames duplicate headers to `a_1` *and* `console.warn`s (so ambiguous headers are now refused before it runs — which is also why the suite reports zero warnings); `unparse` renders a nested object as `[object Object]` and a nested array as `1,2`; `unparse` **throws** on `[1,2,3]`, which is why the row-shape validator exists; and its own `escapeFormulae` force-quotes the escaped cell, contradicting the spec's exact expected output.

**Open questions the reviewer may want to reverse, both one-line changes:** D1 (duplicate column names are refused rather than collision-renamed) and D2 (formula protection defaults to off, with the risk announced, because it edits exported text). D4 records the detector's known cost: a hand-typed CSV spaced like prose (`name, age`) is not detected, though it converts normally once the tool is open.


---

## Addendum — Batch A frozen for CP2, evidence packet prepared (2026-10-26, ~01:50)

The independent reviewer's assessment accepted T-206's result but raised three specific questions to
settle **before** CP2 closes. Nothing in Batch A was changed in response: the branch stays at
`20c7e83`, the worktree is clean, and T-301 was not started. Instead the three questions were turned
into measurements, in [CP2-EVIDENCE-PACKET.md](CP2-EVIDENCE-PACKET.md):

- **Formula warning** — wording is accurate, countable and explicitly *not* a guarantee; the note is
  above the fold at 1440×900 and 1366×768, but **below the fold at 390×844** and styled in the same
  dim 12 px tone as informational notes. Packet §2.
- **Detector strictness** — a 21-sample corpus replayed through five rule variants shows the
  tightened "all records must agree" clause I added buys **no precision at all** while losing two
  genuine CSV shapes; the tight-delimiter rule is what actually rejects prose, logs and SQL. My own
  deviation D5 is therefore recorded as over-restriction, with the matrix to prove it. Packet §3.
- **Detect numbers** — reproduced exactly: a leading zero in row 200 is warned about, row 201 is
  rewritten in silence. A bounded repair (one always-on coverage sentence, no second full parse) is
  specified with acceptance criteria and is **not implemented** while the freeze holds. Packet §4.

**Next actor is Opus, not the implementer** ([REVIEW_PROTOCOL.md](../REVIEW_PROTOCOL.md) §1, §3):
`npm ci`, `npm run check`, `npm run test:e2e`, screenshots at 1440×900 and 390×844, the diff since
Batch A started, then a `REVIEW_LOG.md` entry, `ACCEPTED`/`REJECTED` on rows 17–22 and any
`R-CP2-<k>` repair rows. The owner's protocol step is to tell the reviewer: *"CP2 ready, pushed to
v3."* — `origin/v3` is already at `20c7e83` with `verify` green.


**Same evening, after the packet was first written — self-correction and one new finding.** The
packet's own reproduction code was run end to end, which found that its §3 table carried a stale V3
row (3 → 4 CSV forms missed, written from the corpus before the footer-line and ragged-row samples
were added) and that the appendix needed the corpus itself, not just a description of it. Both are
fixed in the packet, with the provenance stated rather than quietly edited. Running that code also
surfaced **Finding D**, which none of the three review questions anticipated: a spaced CSV
(`name, age / Ana, 30 / Bo, 40`) and a plain comma list (`milk, bread, eggs, …`) are claimed by
**T-205's cron rule** at confidence 0.7, and the home page really renders
*"Looks like a cron expression → Open in Cron Explainer"* for them. The mechanism is that the shape
rule accepts any 5-6 whitespace tokens, the field alphabet allows letters plus commas, and a *trailing*
comma counts as structure. Real schedules stay safe under a proposed discriminator (internal commas,
digits, `*`) — measured, not yet coded. Still frozen: no source change, no severity assigned, no
repair started. Packet §5 and §9.


**And one more, from checking CI instead of assuming.** After a documentation-only push, CI `verify`
**failed** on `614f5f4` while it had **passed** on `20c7e83` — the same source (`git diff` over
`src test scripts package.json package-lock.json` between them is empty). Two assertions in
`src/core/diff/diff.test.ts` (:82 and :152) demand that the diff library's own 2-second timeout fire;
measured here they run in 2020–2027 ms, so on GitHub's faster runner the work completes in time,
`r.ok` is `true`, and the gate turns red on untouched code. Recorded as Finding E in the packet (§6):
pre-existing in T-202, not introduced here, and the first thing that makes the CP2 gate itself
unreliable. A repair direction that does not depend on CPU speed is sketched there and deliberately
not implemented. The freeze still holds — three docs commits, zero source changes.
