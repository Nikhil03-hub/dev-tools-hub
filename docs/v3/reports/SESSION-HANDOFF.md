# Session handoff — V3 P1 progress

Last implementation commit: `b349b9d` (T-104). This handoff was committed immediately after as `8367ffc`.
Git HEAD on branch `v3` is **`8367ffc`**, working tree clean. (Verified with `git rev-parse HEAD` at the start of the next session, not copied from prose.)
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
| **T-106 home page + paste detection** | **NOT STARTED** | — | next READY task |
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

1. T-106 (home page + "Paste anything" detection). Read `docs/v3/tasks/P1_foundation.md` §T-106. It adds `src/core/detect/*`, `HomePage`, `handoff.ts`, `StaticPage`, and switches the `activeId` fallback in `src/App.tsx` from `DEFAULT_TOOL` to a real route switch. That single line is commented in `App.tsx` for exactly this change. It also fixes the currently inert `/privacy/` link in `PrivacyPopover`.
2. T-107 … T-109, then **STOP at CP1** and hand to Opus with `git log`, the e2e log and screenshots. Do not push.
3. Reviewer decides on `R-CP1-focus` before RC1.

## Lessons from T-105 worth not repeating

- Screenshots caught a defect the suite could not: the mobile drawer rendered as a 56px icon rail because the collapse default was derived from the desktop breakpoint. The e2e check now asserts the drawer's text contains tool labels, so "visible but useless" fails.
- Never verify focus visibility with programmatic `.focus()`: Chromium does not apply `:focus-visible` to it. The shell check presses Tab and then reads `getComputedStyle(activeElement)`.
- `npm run test:e2e` output stays buffered to a file (`PASS=0` mid-run is normal).
- `vite preview` takes ~8–10s to answer on this machine; a 5s curl check reports 000 and is not a failure.
