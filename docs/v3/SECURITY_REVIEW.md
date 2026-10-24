# Security and privacy review (threat model)

Version 1.0 (2026-10-22), Opus. It is re-checked at CP3, CP5 and RC1.

## 1. What we protect

1. **What users paste:** tokens, cookies, HAR files, logs, `.env` files, source code and personal data.
2. **The integrity of the redacted output** (no secret survives into a "safe to share" output).
3. **The user's browser and machine** (no XSS, no hangs, no harmful downloads).
4. **The repository and the release pipeline** (no secrets committed, no supply-chain tampering).

## 2. Trust boundaries

- **Browser tab.** All processing happens here. CSP `connect-src 'none'` blocks fetch, XHR, WebSocket, beacons and EventSource. `img-src` allows only `'self'`, `data:`, `blob:` and, optionally, the GoatCounter host.
- **CLI/MCP process.** It runs on the user's machine and reads only the files or stdin it is given. It imports no network modules (enforced by check-boundaries plus review).
- **GitHub (CI).** gitleaks scans the full history; actions are pinned to SHAs; the token is read-only.
- **Netlify.** Static hosting. Headers come from `_headers`. Deploys are manual only.

## 3. Threats and controls

| # | Threat | Control | Verified by |
|---|---|---|---|
| T1 | Pasted data leaves the browser through code we add | CSP `connect-src 'none'`; AGENTS golden rule 1; check-boundaries bans network APIs in pure code; review | e2e `zero_network_after_load`, `only_same_origin_assets_after_load`, CSP probe (fetch/beacon/WebSocket refused) |
| T2 | Data leaves through a dependency | Pinned versions; dependency review (no network, no eval); CSP still blocks it at runtime | DEPENDENCIES.md review at CP4; CSP |
| T3 | Data leaves through image URLs (e.g. Markdown preview with remote images) | `img-src` does not allow remote hosts (except the counter host) | e2e in T-222 |
| T4 | Data is persisted where it shouldn't be | Only preferences go to localStorage (ARCHITECTURE §8); handoff stays in memory; nothing in URLs | e2e `handoff_not_persisted`; review |
| T5 | Redaction false negative (a secret survives) | Known formats + secret-named fields + custom policy; the Review tab; honest UI wording | verify_debugkit `no_raw_secret_leaks_anywhere` (every planted fixture secret) extended to every new output (compare, agent, json, CLI, MCP) |
| T6 | Redaction false positive (debugging value lost) | Precision over recall (redact.ts rules); allowValues in the policy | verify_debugkit false-positive checks on real code |
| T7 | ReDoS (Regex Tester, policy patterns, our own regexes on big input) | Workers with timeouts (T-306); `isPatternSafe`; input caps (5 M characters web, 50 MB CLI) | e2e `regex_redos_stopped`; perf checks (20k-line log < 2.5 s) |
| T8 | XSS through rendering input | React text nodes only; no `innerHTML`; Markdown only via DOMPurify; links `rel=noopener noreferrer` | review; T-222 tests (`<script>`, `onerror`, `javascript:`) |
| T9 | Malicious files (huge HAR, deeply nested JSON, YAML alias bombs, zip bombs) | Size caps; `maxAliasCount`; JSON parse in try; binary HAR bodies omitted; no archive extraction | unit tests per tool (alias bomb, 5 MB input) |
| T10 | Harmful downloads | Downloads only on user click, as `Blob` text with fixed safe extensions (.json, .txt, .md, .har, .csv, .svg, .png, .patch) | review |
| T11 | CSV formula injection in exported CSV | Formula protection, on by default (T-206) | unit test |
| T12 | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | e2e header checks |
| T13 | Secrets committed to the repo | gitleaks in CI over the full history; fixtures use FAKE/EXAMPLE values and are allow-listed only in named files | CI |
| T14 | Supply chain (CI actions, npm) | Actions pinned to SHAs; gitleaks binary checksum-verified; `npm ci` with lockfile; exact pins for new dependencies | CI review |
| T15 | MCP/agent misuse: an agent sends secrets to us, or prompt injection in logs | The MCP server only transforms text locally and returns sanitized output; it executes nothing from the input and has no network | CP5 review + tests |
| T16 | CLI overwrites user files | `sanitize` refuses to overwrite without `--force`; writes only to an explicit `-o` path or `<name>.sanitized<ext>` | T-402 tests |
| T17 | Counter pixel misuse | Fixed allow-list of 12 event names; the function takes no free-form argument; off unless `VITE_GC_CODE` is set | verify_debugkit metrics checks; e2e counters variant |

## 4. Things we must never claim

- "Catches every secret" or "100% safe". Say "known formats and secret-named fields; review before sharing".
- "Works offline", until a service worker is shipped and tested.
- "Verified" for anything a rule did not verify (JWT signatures are always "Not verified").

## 5. Open items

- Choosing the MCP implementation (D-15) needs a supply-chain look at `@modelcontextprotocol/sdk`'s transitive dependencies on the stdio path.
- Sonnet independent reviews at CP3 and CP5.
