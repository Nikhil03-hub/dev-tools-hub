# CP1 closure — specification reconciliation, focus handoff, typography, test hardening

**Branch:** `v3` · **Date:** 2026-10-25 · **Predecessor:** CP1 release-gate pre-review of `78b6698`
**Author:** the implementing agent (Qoder). **CP1 remains `PENDING` — this is not independent approval.**

---

## 1. Baseline and final repository state

| | Branch | HEAD | Tree | vs `origin/master` |
|---|---|---|---|---|
| Start | `v3` | `78b6698` | clean | 19 ahead / 0 behind |
| End | `v3` | `3083922` — `T-115: close CP1 review items -- spec reconciliation, palette focus, editor typography` | clean | 20 ahead / 0 behind |

Remote verified before working, not assumed: `origin` = `https://github.com/Nikhil03-hub/dev-tools-hub`, remote branches are `origin/master` and `origin/HEAD` only — **there is no `origin/v3`**, so all V3 work is still local-only.

**The `0ee8b6e` / `78b6698` question is settled by diff, not by commit message:** `git diff --name-only 0ee8b6e 78b6698` returns exactly two files, both under `docs/v3/reports/`. No `src/`, `test/` or config file. The gates were then re-run on `78b6698` itself, so the tested tree and the reported HEAD coincide.

## 2. Findings confirmed vs. disproved

| Reported | Verdict | Evidence |
|---|---|---|
| Dark `accent` spec value `#8B7CF8` ≠ shipped `#968AFA` | **Confirmed** | [UX_SPEC.md:53](../UX_SPEC.md) vs `src/theme/tokens.css:23` |
| Focus clause mandates `outline-offset: 2px`, implementation deviates | **Confirmed** | UX_SPEC §2 Focus vs `src/index.css`, `src/lib/cmTheme.ts` |
| `regex_highlight_contrast_no_match_*` could pass vacuously | **Confirmed** | asserted `minHighlights: 0`, never `=== 0` |
| Palette focus falls to `<body>` when the opener unmounts | **Confirmed and reproduced** | `{"tag":"body","isHeading":false,"path":"/regex-tester/"}` |
| `13.5px` editor font off the `code` 13/20 scale | **Confirmed — and worse than reported** | rendered values were **13.5px / 18.9px**: the size *and* the line-height were off (18.9 is CodeMirror's default 1.4 multiplier) |
| Highlight intensity change is user-visible and needs owner review | **Confirmed** | §6 screenshots |
| Tightest highlight contrast 4.80:1 may not survive a future token change | **Disproved (for the risky direction)** | §7 sensitivity sweep — the gate fails on a wrong-way accent shift in both themes |

## 3. Changes made

| File | Change | Why |
|---|---|---|
| `docs/v3/UX_SPEC.md` | Dark `accent` row corrected to `#968AFA` + Note 1 with measured table; Focus clause records the two clipping-forced exceptions and the pixel-evidence rule | The spec is the CP1 acceptance contract; it contradicted the shipped, evidence-backed implementation |
| `src/lib/cmTheme.ts` | `fontSize: 13px`, `lineHeight: 20px` (repeated on `.cm-content`, where CodeMirror's base theme otherwise wins) | Brings editors to UX_SPEC `code` = 13/20. Closes the long-standing F-1 follow-up |
| `src/components/CommandPalette.tsx` | On close: restore to the opener if still mounted and visible; otherwise focus the **visible** route heading. Guarded by `wasOpenRef` so it can never fire on initial mount | Fixes focus stranded on `<body>` after a palette command navigates away |
| `src/shell/ToolLayout.tsx`, `HomePage.tsx`, `StaticPage.tsx` | `tabIndex={-1}` on the single `<h1>` each route renders | Standard programmatic announcement target; adds no tab stop |
| `test/e2e.cjs` | `exactHighlights: 0` on the no-match fixture; 3 new check templates (unmount landing, never-stranded across 3 navigations, rapid-toggle stability) | Closes the vacuous pass and locks in the focus behaviour |

**A design note worth recording:** the first attempt used `document.querySelector("main h1")`, which failed — a tool page's `<h1>` is in the `ToolHost` wrapper, not inside `<main>` (the tool reserves `<main>` for its workspace), and keep-alive means several `<h1>`s exist at once. The working version selects the *visible* one across both containers. No timers were used.

## 4. Test totals and gates

| Command | Exit | Result |
|---|---|---|
| `npm run check` | **0** | typecheck · boundaries 17 · registry 6 · unit **56/56** · verify_debugkit **147/0** · build · `check-budgets: OK` |
| `npm run test:e2e` | **0** | **374 PASS / 0 FAILURE** (was 368) |

Logs: `test-results/cp1-verify/closure-check.log`, `closure-final-e2e.log`.

**No test removed or weakened** — verified by parsing every `check(` call in both revisions: 310 distinct check-name templates before, 313 after, **0 removed, 3 added**.

## 5. Mutation evidence

Two mutations applied together (failure names keep them attributable), then reverted:

| Mutation | Result |
|---|---|
| no-match fixture pattern `zzz`→`a.c` so it now matches | `regex_highlight_contrast_no_match_{light,dark}` **FAIL** — the vacuous-pass hole is genuinely closed |
| `heading?.focus()` deleted from the palette fallback | `palette_focus_lands_on_heading_when_opener_unmounts_{light,dark}` **FAIL** with `{"tag":"body","isHeading":false}` |

Restored tree re-verified: no mutation strings remain, suite green.

**Methodological trap found and worth passing on:** `npm run test:e2e` does **not** rebuild (by design — `run-e2e.mjs` serves the existing `dist/`). The first mutation run therefore silently tested a stale bundle and only the test-file mutation registered. Any source mutation here must be followed by `npm run build`. Recording this because a mutation check that appears to pass while testing the wrong artifact is exactly the false confidence CP1 exists to prevent.

## 6. Regex highlight visual review

Fresh 2× captures of populated results, both themes, in `test-results/cp1-closure/`: `regex-{plain_match,one_group,nested_groups,multiple_matches,no_match,selection}-{light,dark}.png`. Rendered counts confirmed per case (e.g. `nested_groups`: 2 marks, 6 group spans).

Observations, honestly bounded:
- Text is legible in both themes at every level; unhighlighted text stays clearly distinct from highlighted runs.
- Group boundaries are visible as stepped shading, which is the feature's purpose.
- Because the outermost capture group usually spans nearly the whole match, the `/40` match tint is rarely visible when groups exist — depth reads mainly through the inner steps. Inherent to nesting, not a regression.
- Adjacent group levels (`/80` vs `/90`) are subtly different; a busy-looking but informative patchwork inside a word.

**I am not claiming design acceptance.** The appearance is measurable and legible; whether it is *right* is the owner's call on the screenshots above.

## 7. Contrast margin robustness (the question asked)

Swept `--c-accent` in both directions at runtime and re-ran the shipped measurement logic:

| Theme | Accent shift | Min ratio | Gate |
|---|---|---|---|
| light | shipped | 4.80 | pass |
| light | lighter (+20) | 3.79 | **FAIL — detected** |
| light | much lighter (+54) | 2.58 | **FAIL — detected** |
| light | darker | 6.91 | pass (correctly: improves) |
| dark | shipped | 5.56 | pass |
| dark | lighter | 6.80 | pass (correctly: improves) |
| dark | darker | 3.89 | **FAIL — detected** |
| dark | much darker | 2.79 | **FAIL — detected** |

The gate fails in precisely the direction that harms each theme, so the 4.80:1 margin is monitored, not merely asserted. Per instruction I am **not** demanding extra margin: 4.80:1 satisfies the applicable 4.5:1 criterion for 13px text.

**One honest internal shortfall, recorded rather than hidden:** recomputing the accent token for Note 1 showed accent-on-`accent-soft` in dark = **5.15:1**, i.e. 0.05 below UX_SPEC's own ≥5.2:1 target on that one background. Not a WCAG failure (AA is 4.5:1, and the automated gate enforces 4.5:1). I documented it in the spec instead of re-wording the target to make it pass.

## 8b. Commit

`3083922` is the single commit for this milestone and the tree the §4 gates ran on. A follow-up docs-only commit records this hash, because a commit cannot contain its own id; that follow-up touches no source, test or config file.

## 8. Security, privacy, build integrity

7 files changed — 4 source, 1 test, 1 spec, plus reports. Verified: **no** new network API, `localStorage` key, dependency or bundle growth; `connect-src 'none'` and 19 CSP paths unchanged; no counter host; no secrets, local paths or artifacts in the diff; budgets enforced by a real `process.exit(1)`, not documentation. Home still loads no editor chunk; no duplicate asset requests; zero off-origin requests and zero console errors in the suite.

## 9. Remaining issues and classification

| ID | Item | Classification |
|---|---|---|
| C-1 | Independent CP1 verdict (this document is a self-authored pre-review) | **Blocker for acceptance, not a code defect** — only a reviewer who didn't write T-110…T-114 can clear it |
| C-2 | Dark accent-on-tint 5.15:1 vs internal 5.2:1 | **Non-blocking**, documented in UX_SPEC Note 1 |
| C-3 | Regex highlight appearance | **Owner decision** (§6) |
| C-4 | Chromium-only; production `_headers`; real HTTP 404 | **RC1 requirement** — cannot be established locally |
| C-5 | Duplicate Recents/Tools destinations | **Non-blocking follow-up** (unchanged) |
| C-6 | Screen-reader announcement of the new heading focus target | **RC1 requirement** — no AT verification has been performed; do not claim SR-tested |

## 10. Boundary

**Nothing pushed, merged, deployed or published. CP1 remains `PENDING`.** The incremental-push policy applies to future milestones; this task's instructions explicitly withhold push authority until the independent CP1 verdict. Next action: owner reads §6 and C-3, then routes to a non-author reviewer, then RC1.
