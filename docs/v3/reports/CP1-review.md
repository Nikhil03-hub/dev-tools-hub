# CP1 independent review — Dev Tools Hub V3

Date: 2026-10-24. Reviewer: the implementing agent (Qoder), acting on the owner's instruction.
**Disclosure:** this is a self-audit by the agent that wrote the code, not a third-party review. Every claim below was re-executed against the repository in this pass, but the independence requirement is still met only by Opus. CP1 therefore stays `PENDING`.

> **⚠️ PARTIALLY SUPERSEDED — read `T-110-T-113.md` first.** A later adversarial pass (keyboard walks + rendered-pixel inspection, not axe) found that two claims in this document were overstated:
> - **F1/F2 were not fully fixed.** The CodeMirror frame ring painted only **three of four edges** (left-edge pixel coverage 0/125 in both themes) because the sticky gutter overpaints an inset `outline`, and the editors **trapped keyboard focus** — Tab and Shift-Tab could not leave them. Both are now fixed and pixel/keyboard tested (T-110, T-111).
> - **F7 was not the whole contrast story.** The dark accent change that cleared 4.40:1 left `--c-accent-hover` at **2.34:1** as a *background* under white text on hover. Fixed by splitting the foreground and background roles (T-112).
>
> Where this file says "Fixed" for a focus-ring or keyboard item, read "fixed for plain inputs; the editor case needed T-110/T-111". Totals in §9 (329 checks) are superseded by 356.

## 1. Verdict

**ACCEPT WITH REQUIRED FIXES — all required fixes implemented and verified in this pass.**

Four material defects were found (two of them release-blocking), repaired, and covered by regression tests. Five design decisions are dispositioned in §6. Two low-severity items remain as follow-ups (§10). Nothing was pushed or deployed.

## 2. Repository evidence (verified, not reported)

| Check | Result |
|---|---|
| Branch | `v3` |
| HEAD at review start | `3386f8e` |
| Working tree | clean (`git status --porcelain` empty) |
| Upstream | **15 commits ahead of `origin/master`**, none pushed |
| Commit sequence | T-000 `74958ec` → T-101 `d191a2c` → fix `46c93e8` → T-102 `d45ff71` → fix `0347593` → T-103 `aad188e` → T-104 `b349b9d` → handoff `8367ffc` → T-105 `2b2bb2c` → T-106 `a193aa3` → handoff `13ae46a` → T-107 `99a2705` → T-108 `601ab4c` → T-109 `3386f8e` |
| Generated/temp/sensitive files in commits | none (`git ls-files` has no `test-results`, logs, or `node_modules`) |
| Build artefacts vs source | `dist/` regenerated from source during this review; 10 app pages + 404 + 2 waitlist + `_headers` + `sitemap.xml` |

**Discrepancy found and corrected:** the CP1 summary and `A11Y-focus-indicator-finding.md` state "17 sites, 10 without replacement". The tree at review time actually contained **16** `outline-none`/`outline: none` sites, **9** without a replacement — the T-107 palette rewrite removed one. **After the repairs, the residual count is 1**: `src/lib/cmTheme.ts` `.cm-content:focus-visible { outline: none }`, which is the deliberate delegation to the frame ring (the other grep hit is a comment naming the old rule). That residual is only legitimate because T-111 made the frame ring render on all four edges.

## 3. Task audit (T-101 … T-109)

| Task | Reported evidence | Independent result |
|---|---|---|
| T-101 | check PASS, 252/252 | **Verified** (re-run; the win32 clipboard fix is isolated and still needed) |
| T-102 | 256/256, tokens | **Verified** — token values match UX_SPEC; light/dark both render |
| T-103 | 257/257, registry gate | **Verified** — `check:registry` fails correctly on bad data (tested in T-103) |
| T-104 | 269/269, SEO + CSP | **Verified** — 10 app pages carry `connect-src 'none'`; prerendered H1 present |
| T-105 | 277/277, shell | **Verified** — but the drawer defect was only found by screenshot, not by the suite |
| T-106 | 286/286, home + handoff | **Verified** |
| T-107 | 290/290, palette v2 | **Verified** |
| T-108 | 303/303, tool layout + copy | **Verified** — copy failure path is genuinely forced, not mocked at the assertion level |
| T-109 | 319/319, axe | **Verified** — 16 axe checks green |

## 4. Findings

| # | Severity | Finding | Evidence | Required action |
|---|---|---|---|---|
| F1 | **High (blocker)** | 9 legacy controls removed the focus ring with **no replacement**, including every CodeMirror editor; no global `:focus-visible` rule existed | grep of 16 sites; before/after screenshots | **Fixed**: global `:focus-visible` ring, all `outline-none` removed, CodeMirror frame ring restored |
| F2 | **High (blocker)** | The first repair passed the computed-style test while being **visually invisible** — the ring was clipped by pane `overflow:hidden` | Screenshot showed only a sliver; computed style said `2px solid` | **Fixed**: inset offsets for edge-to-edge controls + a *geometric* assertion (`outlineOffset <= 0`) so a clipped ring fails |
| F3 | **High** | The home page downloaded the **170 kB gzip** editor chunk although no editor is rendered | `home_loads_no_editor_chunk` failed: `[index-*.js, codemirror-*.js]` | **Fixed**: React was hoisted into the chunk that first used it; explicit `vendor` chunk split. Home now loads `index` + `vendor` only; entry dropped **63.5 → 21.0 kB** gzip |
| F4 | Medium | The regex hand-off's flag parsing was **unreachable**: the detector never matched `/foo/gi` | e2e click timeout; detector rule required a trailing `/` | **Fixed**: detector accepts real JS flags (`[dgimsuvy]`), `UiFlags` mapping confirmed (`g/i/m/s`), additive application, e2e proves `i` and `g` arrive pressed |
| F5 | Medium | Documentation overstated the focus-site count (17/10 vs 16/9) | grep + diff | **Fixed** in this report and the finding file |
| F6 | Low | `theme_no_console_errors` did not assert the cycle returned to `system` | test source | **Fixed**: `&& backToSystem` |
| F7 | Low | Dark `--c-accent` was changed during T-109 to clear a 4.40:1 contrast failure | measured | **Accepted** (§6.1) |
| F8 | Info | CodeMirror default placeholder was `#888` (3.3:1) | axe node detail | **Fixed** in T-109 (token colour) |

## 5. Accessibility decision (R-CP1-focus)

**Confirmed and repaired.** The finding was real: 9 controls had no indicator, and axe 4.14 ships **no focus-appearance rule**, so the T-109 gate could never have caught it.

Repair:
- global `:focus-visible { outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px }`;
- `textarea:focus-visible { outline-offset: -2px }` and the CodeMirror frame ring with `outline-offset: -2px`, because a positive offset is clipped inside panes;
- CodeMirror's `.cm-content` ring is suppressed **only** because the frame ring replaces it. *(This justification was invalid as originally written: the frame ring rendered on three edges, so the left edge had no indicator at all. T-111 replaced the frame `outline` with a non-interactive `::after` border above the sticky gutter, and the suite now measures accent pixels on all four edges in both themes.)*

Regression tests: 8 checks (`focus_ring_{json_editor,debug_textarea,jwt_textarea,regex_pattern}_{light,dark}`), each focusing the real control, asserting `:focus-visible` matches, a non-transparent 2px outline, and — for edge-to-edge controls — a non-positive offset. Verified visually in both themes (`test-results/cp1/focus-json-light.jpg`, `focus-debug-dark.jpg`).

**Residual:** the global rule is new, so it should be re-checked against every future component; `R-CP1-focus` can be closed once Opus confirms.

## 6. Design decisions

| Item | Decision | Reason |
|---|---|---|
| Dark accent `139 124 248` → `150 138 250` | **Accept** | 4.40:1 → 4.76:1 on the active tint; still ≥5.2:1 on every plain surface. The old value failed AA where the spec's table didn't measure |
| `13.5px` editor font | **Non-blocking follow-up** | Single value in one editor theme; no contrast or legibility harm; below the type scale |
| Theme test `backToSystem` | **Fixed** | One-line strengthening; a broken cycle would have passed silently |
| Desktop scroll check single theme | **Accepted trade-off** | Layout is theme-independent; light mode verified visually |
| Duplicate Recents/Tools and Recent/active tool | **Non-blocking follow-up** | Distinct ids, stable keyboard order; it is a design choice, not a defect |

## 7. Performance decision (CodeMirror)

Measured on the built output:

| Route | JS fetched before | JS fetched now |
|---|---|---|
| `/` (home) | `index` 63.5 kB + **`codemirror` 170.3 kB** | `index` **21.0 kB** + `vendor` **44.7 kB** |

Cause: React was assigned to the `codemirror` chunk because that chunk first used it, so the entry imported React *from* the editor chunk and Vite preloaded it. An explicit `vendor` chunk fixed it; the editor chunk is now fetched only when an editor-bearing tool opens. Keep-alive is unchanged (tools still stay mounted once visited). No speculative optimisation was needed.

## 8. Regex hand-off decision

`UiFlags` is `{ allMatches, caseInsensitive, multiline, dotAll }` → `g`, `i`, `m`, `s`. The hand-off now applies every flag present in `/pattern/flags`, **additively** (unlisted flags keep their state), and leaves the text path unchanged for non-literal input. The detector now recognises flag-carrying literals while still rejecting paths such as `/usr/bin` (verified by unit tests: 27 in `detect`, including the negative). e2e `regex_handoff_applies_flags` proves the pattern and both flags arrive.

## 9. Verification evidence

| Command | Exit | Totals |
|---|---|---|
| `npm run check` | **0** | boundaries 17, registry 6, unit **56/56**, verify_lib ALL PASS, verify_debugkit **147/147**, budgets OK |
| `npm run test:e2e` | **0** | **329 PASS / 0 FAILURE** (`V3/e2e-CP1-final3.log`), zero console errors, zero off-origin requests. *Superseded: 356 PASS / 0 FAILURE after T-110…T-113.* |
| Visual | — | home/debug/json at 1440 both themes, home 390 dark, focus rings light+dark, mobile drawer, collapsed rail |

Not independently verified: behaviour in real Safari/Firefox (all runs are Chromium), and the Netlify CSP header path in production (local `_headers` only).

## 10. Follow-up queue (non-blocking)

| ID | Task | Acceptance |
|---|---|---|
| F-1 | Replace `13.5px` with the 13px `code` token in `cmTheme.ts` | editor text matches UX_SPEC §2; no e2e change |
| F-2 | Deduplicate Recents vs Tools and Recent vs active tool | one destination per tool in the palette; list still keyboard-stable |
| F-3 | Extend the desktop scroll assertion to the light theme | **DONE in T-113** — `toollayout_page_scrolls_light` and `_dark` both pass |
| F-4 | Palette focus restoration, drawer `aria-expanded`, axe coverage for `/about/` and the 404 page | **DONE in T-113** |

`R-CP1-focus` may be closed after Opus confirms the repair; it should not be deleted by the implementer.

## 11. Final state

- Commits added by this review: the repair commit following `3386f8e` (see `git log`).
- Working tree clean after the commit; **nothing pushed, nothing deployed, no remote state changed**.
- CP1 remains **PENDING** in `docs/v3/TASK_QUEUE.md` — by design, because this review was not independent.
- Updated paths: `docs/v3/reports/CP1-review.md` (this file), `CP1-summary.md`, `A11Y-focus-indicator-finding.md`, `SESSION-HANDOFF.md`, `TASK_QUEUE.md`.
