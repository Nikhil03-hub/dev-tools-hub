# Release checklist (RC → production)

Copy this list into `docs/v3/reports/RC<n>.md` and tick each item with evidence.

## Code and tests
- [ ] Every task in the release is `ACCEPTED`; no `S1`/`S2` issues are open.
- [ ] `npm ci && npm run check` passes in a clean environment (reviewer).
- [ ] `npm run test:e2e` all PASS; the count is ≥ the last checkpoint's.
- [ ] verify_debugkit count ≥ the previous one, with 0 failed.
- [ ] axe: 0 serious or critical violations on every page in both themes.
- [ ] The budgets table is within limits.
- [ ] Lighthouse on `/`, `/debug-report/` and `/json-formatter/`: perf ≥ 90, a11y/BP/SEO ≥ 95.

## Privacy and security
- [ ] Every app HTML page has the CSP with `connect-src 'none'`; `_headers` has CSP per page and none under `/*`.
- [ ] The CSP probe (fetch/beacon/WebSocket refused) passes on the release build.
- [ ] The counters build (`VITE_GC_CODE=nikhil03`): img-src includes only `https://nikhil03.goatcounter.com`, and only the 12 allowed events exist.
- [ ] gitleaks is clean in CI on the release commit.
- [ ] README, SECURITY.md, `/privacy/` and the popover all use `PRIVACY_PROMISE`, word for word.
- [ ] No claims from SECURITY_REVIEW §4 appear anywhere.

## Content and UX
- [ ] Every tool page: title, description, how-to, FAQ and related links read well. No placeholder text.
- [ ] Screenshots at 1440×900 (light + dark) and 390×844 were reviewed against `design/reference.html`.
- [ ] The owner tested on their own phone (Android Chrome) and laptop.
- [ ] `/about/` changelog updated.

## Release mechanics
- [ ] On `master`: `git tag v1-final <current master sha>` (the rollback point).
- [ ] Keep `DevTools_Hub_Dist_2026-09-30_WP2_counters` as the rollback dist.
- [ ] Merge `v3` → `master` (PR, CI green).
- [ ] Release build. PowerShell: `$env:VITE_GC_CODE="nikhil03"; $env:SITE_ORIGIN="https://json-workbench.netlify.app"; npm run build`. Bash: `VITE_GC_CODE=nikhil03 SITE_ORIGIN=https://json-workbench.netlify.app npm run build`. The domain changes if the owner buys one.
- [ ] Zip and keep `dist/` as `DevTools_Hub_Dist_<date>_V3_RC<n>.zip` in `D:\Claude\Business\Dev Tools Hub\`.
- [ ] Netlify credits ≥ 30 left (15 per deploy).
- [ ] The owner drags the **whole `dist/` folder** to Netlify → Deploys. Never the CLI.
- [ ] Post-deploy checks:
  - `curl.exe -sI https://json-workbench.netlify.app/debug-report/` shows the CSP;
  - `/#debug` redirects;
  - 3 random tool pages load;
  - DevTools Network shows only `/assets/` after load.
- [ ] Project_State.md entry written.
