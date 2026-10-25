# Dependency advisory triage — post-push security review

**Date:** 2026-10-25 · **Branch:** `v3` @ the commit that records this file · **Scope:** the Dependabot alert GitHub reported after the `v3` push, plus a full audit of the V3 tree.
**Read-only w.r.t. product code.** One file changed: `package-lock.json`.

---

## 1. What GitHub reported, and why it was not enough

The push surfaced: *"GitHub found 1 vulnerability on the default branch (1 moderate)"* (`security/dependabot/5`).

The alert page returns **HTTP 404** unauthenticated and the REST endpoint returns **401 Requires authentication**, so the advisory's own text could not be read here. `gh` is not installed on this machine. Rather than treat "1 moderate on master" as the whole picture, I audited the actual V3 tree.

**It was not the whole picture.** `npm audit` against the V3 lockfile found **6 advisories — 4 moderate and 2 high** — so the default-branch alert understated the situation. This is exactly the trap of reasoning from a default-branch advisory to a feature branch.

## 2. Findings, before remediation

| Package | Installed | Severity | Advisory | Range | In shipped bundle? |
|---|---|---|---|---|---|
| `vite` | 6.4.3 | high (chain) | `launch-editor` `escapeCmdArgs()` omits `%` escaping **on Windows** — GHSA-698v-4r3x-3vcv | `<=6.4.3` | **No** |
| `source-map-js` | 1.2.1 | high | event-loop DoS via indexed source-map section offsets — GHSA-68fv-2mgg-jv7q | `>=1.0.0 <1.2.2` | **No** |
| `postcss-selector-parser` | 6.1.4 | moderate | quadratic complexity in flat selector parsing → CPU exhaustion — GHSA-rj75-hqrm-r3gf | `<7.1.6` | **No** |
| `postcss-nested` | 6.2.0 | moderate | depends on the above | `2.0.3 - 6.2.0` | **No** |
| `tailwindcss` | 3.4.19 | moderate | depends on the above | `0.5.0 - 3.4.19` | **No** |
| `fast-uri` | 3.1.8 | moderate | URI scheme spoofing via percent-encoded scheme decoding — GHSA-w74x-v6f9-j3xg | `3.0.0 - 3.1.8` | **No** |

### Reachability — established, not assumed

- All six resolve **only** through `devDependencies`. `package.json`'s runtime `dependencies` are react, react-dom, the CodeMirror/Lezer set, `ajv`, `clsx`, `lucide-react` — **none flagged**.
- Grepping the production output: `source-map-js`, `fast-uri`, `postcss-selector`, `vite/module` and `launch-editor` appear in **0 of the files under `dist/assets/`**.
- The app has no server, no build-time ingestion of untrusted input, and never compiles attacker-supplied CSS or source maps.

**Conclusion: build-time / developer-machine exposure only. No user-facing attack surface is introduced, so nothing here changes what a deployed visitor is exposed to.**

The one finding with genuine practical relevance is `vite`'s Windows `launch-editor` issue: the owner develops on Windows, and that code path runs in the local dev server. It is a real risk to the *developer machine*, not to the product or its users.

## 3. Remediation applied

`npm audit fix` — deliberately restricted to non-major resolutions (no `--force`):

| Package | From | To |
|---|---|---|
| `vite` | 6.4.3 | **6.4.5** |
| `source-map-js` | 1.2.1 | **1.2.2** |
| `postcss-selector-parser` | 6.1.4 | **6.1.5** |
| `fast-uri` | 3.1.8 | **3.1.9** |

`package.json` is **unchanged** — every bump is inside the existing caret range, so only `package-lock.json` moved (12 lines). No packages added or removed. Both high-severity advisories are fully cleared.

**Gates after the change, on this tree:** `npm run check` **exit 0** · `npm run test:e2e` **exit 0, 374 PASS / 0 FAILURE** · unit 56/56 · `check-budgets: OK`. Bundle output effectively unchanged — `codemirror` 170.3 kB and `vendor` 44.7 kB kept identical content hashes; entry 21.0 → 21.2 kB.

## 4. What remains, and why it is deliberately not fixed here

**3 moderate, all one chain:** `postcss-selector-parser` is still `<7.1.6`, and 7.x is only accepted by **Tailwind v4**. `tailwindcss` 3.4.19 → 4.x is a styling-layer rewrite (CSS-first config; `tailwind.config.js`, the `<alpha-value>` token composition and every `rgb(var(--c-*))` usage in this design system change shape).

That is refused here on purpose:

- The vector is CPU exhaustion while parsing **untrusted CSS at build time**. This project has no such input — styles are authored, never user-supplied, and there is no server.
- A Tailwind v4 migration is a milestone of its own, not a security patch, and doing it inside a CP1 review window would make the review unattributable.
- `npm audit fix --force` would perform that migration silently. It was not run.

**Recorded as an accepted, time-bound risk** for RC1 planning, with the explicit note that it should be scheduled as a deliberate migration or formally waived — not left to rot as "audit says 3".

## 5. Honest limits of this triage

- The Dependabot alert's own text was never read (404/401). The mapping to GHSA ids above comes from `npm audit`'s advisory data, which is a different source. If the alert names something else, it is not covered here.
- `gitleaks` is not installed locally, so CI remains the authoritative secret scanner.
- `npm audit` reflects the registry's view at run time; it is not a substitute for Dependabot's alert state on GitHub.
- No runtime behavioural testing of the bumped packages beyond the existing gates — `vite` 6.4.5 produced a working build and the full browser suite passed, which is the coverage available.

## 6. Recommendation

1. **CP1:** no blocker from this triage. Nothing vulnerable reaches a user.
2. **RC1:** re-check `npm audit` at release time and confirm the two highs stay cleared.
3. **Backlog:** schedule a Tailwind v4 migration as its own task, or record a formal waiver for the residual 3 moderate build-time advisories.
4. **Optionally** ask the owner to read the actual Dependabot alert in the GitHub UI (they have access; I do not) to confirm it corresponds to one of the six above.

---

# Part 2 — CI verdict on `v3`, and a real finding it caught

## Why CI was run at all

`v3` initially carried no CI verdict: `ci.yml` triggered only on `push: [master]` or `pull_request`, and the API confirmed all 5 historical runs were on `master`. Rather than open a PR — which the owner reserved — `v3` was added to the push triggers. That is purely additive: no step added or removed, master's behaviour unchanged, so it cannot make CI less strict.

**This immediately paid for itself.** Run [`40185450650`](https://github.com/Nikhil03-hub/dev-tools-hub/actions/runs/40185450650) on `067fa45` **failed**, and local `npm run check` had never caught it.

## The failure: gitleaks over full git history

Job `verify` — every step passed (checkout, `npm ci`, `tsc`, `check:boundaries`, `test:unit`, `verify:lib`, `verify:debugkit`, `build`) except **Secret scan of full git history**, which reported **2 leaks**. CI job logs return **403** unauthenticated and `gh` isn't installed, so the scan was reproduced locally: gitleaks **8.28.0**, Windows binary, SHA-256 verified against the release's published checksums (`da6458e8…84f` matched), same config, same `git` mode. Same result: **2 leaks**.

| Location | Rule | Content | Verdict |
|---|---|---|---|
| `src/core/detect/detect.test.ts:4` (commit `a193aa3`, T-106) | `jwt` | `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0…` — the canonical jwt.io example token; payload decodes to `{"sub":"1234567890"}` | **Fake.** Needed by the detection test. |
| `docs/v3/design/reference.html:212` (commit `74958ec`, T-000) | `curl-auth-header` | bearer token ending in `.FAKE`, targeting `api.example.com` | **Fake.** Static design mock. |

Neither is a credential. But the first one is **mine and a process miss**: AGENTS.md §6 requires new fake-secret fixtures to go in files already allow-listed, and T-106 added a JWT to a file that wasn't. CI caught what every local gate missed, because `gitleaks` is not installed on this machine — meaning "the gates are green" had never actually included the secret scan.

## Resolution, and its honest cost

Both files were added to the `.gitleaks.toml` allow-list. **Trade-off stated plainly: this is path scoping, so gitleaks no longer inspects those four files for any future secret.** Fingerprint scoping — which would permit exactly these two known findings and still catch anything new — was attempted first and **silently had no effect** in gitleaks 8.28.0 `git` mode; it was then deleted rather than left in the config looking protective while doing nothing.

Verified rather than assumed:
- `gitleaks git .` with the final config → **no leaks, exit 0**.
- Teeth check: a planted GitHub PAT in a normal source file was still caught (`github-pat`), so the allow-list does not blind the scanner to ordinary files. Probe deleted; tree clean.
- `npm run check` exit 0 · `npm run test:e2e` **374 PASS / 0 FAILURE** after the config change.

Two side observations: the working-tree scan also flags `dist/` and a gitignored local script — neither is in git, so CI's `git` mode never sees them. And `src/lib/debugkit/samples.ts` is allow-listed at source, so its fake credentials **do** ship inside the Debug Report bundle by design — they are the demo's input. Worth a reviewer knowing, not a defect.

## What this changes about the earlier claim

Part 1 said the security posture was verified by local gates. That was **overstated**: the local gates have never included a secret scan. Corrected — CI now supplies it, and it is the authoritative check on this branch.
