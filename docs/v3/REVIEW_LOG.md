# Review log

Newest entries go at the bottom. The template is in REVIEW_PROTOCOL.md §6.

## CP0: baseline before V3 (2026-10-22): ACCEPTED

**Commit:** `c7488ef` on `master`, the public repo, which is identical to the live V1 site's source plus README edits.
**Reviewer:** Opus.
**Environment:** clean Linux sandbox, Node 22, Chromium (Playwright 1.6x).

**Results:**

| Check | Result |
|---|---|
| `npm ci` | OK |
| `tsc --noEmit` | clean |
| verify_lib | ALL PASS |
| verify_debugkit | 147 passed, 0 failed (20k-line log in 481 ms) |
| build | 1,028,456 bytes |
| e2e | 252 PASS / 0 FAIL, 0 console errors, 0 requests after load |

**Pre-verified reference work (not yet committed by the implementer):**
- **T-101 applied** to a fresh clone: `npm run check` passes (3 unit files / 15 tests), and e2e 252/252 runs through `scripts/run-e2e.mjs`.
- **T-104 build pipeline applied** (multi-file build, postbuild-pages, V3 CSP):
  - 6 tool pages, 3 static pages, a 404 page and the sitemap are generated, each with the `connect-src 'none'` CSP;
  - e2e 250/252 with 0 console errors. The 2 failures are `title_is_dev_tools_hub` and `initial_requests_only_document`, exactly the edits T-104 permits. With those two permitted edits applied, e2e is **252/252**.
- An earlier sandbox run reported 252/252 for the T-104 pipeline. That run was wrong: an old `vite preview` was still holding port 4173 and served the V1 build. `run-e2e.mjs` now refuses to start when the port is busy.
- **Independent spec review** (2026-10-22): 9 blockers and 18 major issues found in the first draft of the task specs, mostly e2e checks that later tasks would have broken without permission. All of them are fixed in this version of the pack.

**Known V1 issues carried into V3 (each has a task):**
- Regex Tester runs user patterns on the main thread, so a catastrophic pattern freezes the tab. Fixed by T-306.
- `ink-faint` contrast is 3.0:1 on canvas, which fails WCAG AA. Fixed by T-102.
- Top-tab navigation does not scale. Fixed by T-105.

**Next:** start T-101.
