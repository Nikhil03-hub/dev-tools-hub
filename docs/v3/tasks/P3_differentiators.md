# Phase 3: differentiators (T-301 … T-306)

**Why this phase matters.** The research (plan file 01) found that "more utilities in one place" is saturated: IT-Tools has 88 tools, CyberChef hundreds, and more than a dozen new hubs launched in 2025–26 with 2–6 upvotes each. What no product combines is this one flow:

**paste any failing request or log → deterministic diagnosis → structure-preserving redaction you can review → a report shaped for a ticket, an issue or an AI agent.**

This phase deepens exactly that flow.

**Engine rules for this phase** (`src/lib/debugkit/*` may change here, and only additively):
- All 147 existing checks in `scripts/verify_debugkit.ts` must still pass. Never edit or delete them.
- Add new checks **at the end** of that file in a section `// ---- V3 (T-30x) ----`. Pure new modules also get vitest tests.
- Existing exported signatures stay compatible: new options are optional and new formats are additive.
- `no_raw_secret_leaks_anywhere` style: every new output path (compare, agent, json, policy) gets a test proving that every planted secret in the existing leak fixture (the list used by `no_raw_secret_leaks_anywhere` in `scripts/verify_debugkit.ts`) never appears in it.

---

## T-301: Custom redaction policy (engine)

**Files:**
- `src/lib/debugkit/policy.ts` (new)
- `src/lib/debugkit/redact.ts`
- `src/lib/debugkit/report.ts`
- `src/lib/debugkit/types.ts`
- `scripts/verify_debugkit.ts` (append only)
- `src/lib/debugkit/policy.test.ts` (new, vitest)

**Contract:** see ARCHITECTURE.md §10 (`RedactionPolicyV1`, `parsePolicy`, `isPatternSafe`, `POLICY_FILE_NAME`).

**Implementation:**
1. `types.ts`: `export type RedactionCategory = <existing union> | \`CUSTOM_${string}\`;`
2. `policy.ts`:
   - **`parsePolicy(json)`** uses `parseJsonWithDiagnostics` from `src/tools/json/lib/jsonParse.ts` for the line/column of syntax errors. It then validates:
     - `version === 1`;
     - only known keys (an unknown key is an error naming it);
     - the limits from ARCHITECTURE §10;
     - every pattern passes `isPatternSafe` and compiles with `new RegExp(regex, (flags ?? "") + "g")`.

     Error messages name the field, e.g. `patterns[2].regex: nested quantifier "(a+)+" can freeze the page`.
   - **`isPatternSafe(src)`** rejects:
     - length > 200;
     - backreferences `\1`–`\9` and `\k<`;
     - lookbehind `(?<=` and `(?<!`;
     - nested quantifiers, detected by the regex `/\((?:[^()\\]|\\.)*[+*}](?:\?)?\)\s*[+*{]/`;
     - the empty pattern;
     - a pattern that matches the empty string (`new RegExp(src).test("")`).
3. `redact.ts`:
   - The `Redactor` constructor accepts `options: Partial<RedactOptions> & { policy?: RedactionPolicyV1 }`.
   - Store `policyKeys: Set<string>`, built from `policy.keyNames` normalised with the existing `nameTokens(...).join("")`.
   - Add the private method `isSecretName(name)` = `isSecretKey(name) || policyKeys.has(nameTokens(name).join(""))`. Replace **internal** calls of `isSecretKey(` inside the class with `this.isSecretName(`. The exported `isSecretKey` stays unchanged.
   - `placeholder(category, value)`: if `allowValues` contains the exact value, return the value unchanged and don't count it. It must be `placeholder()`, not `rep()`: most redaction paths (including the Stripe-key path) call `placeholder()` directly.
   - `redactText()`, as its **last** step: for each policy pattern in order, replace matches that are not already inside a placeholder with `this.rep(\`CUSTOM_${name}\`, match)`. Use the global regex compiled once in the constructor.
   - `policy.emails` / `policy.ips`, when present, override the options.
4. `report.ts`: `analyze(input, { …, policy })` passes the policy to the Redactor.

**Tests** (vitest for `parsePolicy`/`isPatternSafe`; verify_debugkit for engine behaviour):
- a valid policy round-trips;
- unknown key → error;
- `(a+)+` rejected; `\d{4}-\d{4}` accepted; `(?<=x)y` rejected; `a*` rejected (matches empty);
- `keyNames: ["x-tenant-secret"]` → the header `X-Tenant-Secret: abc12345` becomes `<SECRET_1>` (or whatever category the existing `redactPair` uses for secret-named headers; assert it is not the raw value);
- pattern `{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }` → `EMP-123456` appears as `<CUSTOM_EMPLOYEE_ID_1>`, and the same value twice gets the same placeholder;
- `allowValues: ["pk_test_EXAMPLE"]` keeps that value;
- the 147 old checks still pass;
- determinism: the same input + policy gives an identical report twice.

---

## T-302: Policy UI in Debug Report

**Files:**
- `src/tools/debug/components/PolicyDialog.tsx` (new)
- `src/tools/debug/DebugReportApp.tsx`
- `src/shell/policyStore.ts` (new; localStorage key `dth.policy.v1`, try/catch)
- e2e

**UI:**
- A "Policy…" button in the input toolbar opens a dialog (Popover-style modal, focus trapped) with:
  - (a) a textarea of key names, one per line;
  - (b) a patterns table (name, regex, case-insensitive checkbox) with Add/Remove buttons;
  - (c) a textarea of allowed values;
  - (d) Import `.debugreport.json` (file input) and Export (download);
  - (e) Save, which validates with `parsePolicy`, shows errors inline next to the field, and on success stores the policy and re-runs the analysis;
  - (f) "Reset to none".
- When a policy is active, the toolbar shows a Badge "Policy: N rules".
- The policy **never** contains pasted input. It holds only what the user typed into the dialog.

**e2e:** `policy_dialog_opens`, `policy_custom_pattern_redacts` (add `EMP-\d{6}`, paste a log containing `EMP-123456`, the Sanitized tab shows `<CUSTOM_EMP`), `policy_bad_regex_rejected`, `policy_persists_after_reload`, `policy_export_import_roundtrip`.

---

## T-303: Secret Scanner tool ("Is this safe to paste?")

**Registry:** id `secret-scanner`, slug `secret-scanner`, title "Secret Scanner: is this safe to paste?", navTitle "Secret Scanner", category `debug`, icon `ShieldCheck`, status `new`. Write a description and docs in the batch A style. The FAQ must include: "Does it check whether a key is live? No — that would require sending it to the provider."

**API:** `src/core/secrets/scan.ts`
```ts
export interface SecretHit { category: string; placeholder: string; line: number; column: number; preview: string /* the line with the secret replaced by its placeholder, max 160 chars */ }
export function scanSecrets(text: string, opts: { emails: boolean; ips: boolean; policy?: RedactionPolicyV1 }): { hits: SecretHit[]; sanitized: string; summary: RedactionSummaryRow[] };
```
- **Algorithm (follow exactly):**
  1. Add one additive public method to `Redactor`: `mappings(): ReadonlyArray<{ placeholder: string; category: RedactionCategory; value: string }>`, returning the internal value → placeholder map. Its doc comment says "memory only; never render `value`".
  2. Create one Redactor (options + policy) and run `sanitized = r.redactText(text)` once over the **whole** text. That handles multi-line private keys and gives consistent placeholders.
  3. For each mapping, find every occurrence of `value` in the **original** text with an `indexOf` loop. Convert each offset with `offsetToLineCol` from `src/core/result.ts`.
  4. `preview`: take that original line, replace every mapping value occurring in it with its placeholder (longest values first), and cut it to 160 characters. If the value spans several lines, the preview is `<PLACEHOLDER> (multi-line)`.
  5. A mapping whose value is not found verbatim (for example a decoded Basic-auth value) produces no hit, but still counts in `summary`.
  6. Sort hits by offset.
- Positions refer to the original text. `preview` never contains the raw value.

**UI.** Analyze pattern:
- the input on the left;
- on the right: a big verdict ("No known secrets found" in `ok`, or "Found 3 likely secrets" in `warn`), the list of hits (category badge, line:column, preview), and a "Copy sanitized text" button;
- Toggles for emails and IPs;
- it uses the saved policy.

**e2e:**
- `secret_scanner_finds_jwt`;
- `secret_scanner_clean_text`;
- `secret_scanner_never_shows_raw`: the raw fixture token is absent from the whole page text.

---

## T-304: Compare working vs failing request (engine + UI)

**Files:**
- `src/lib/debugkit/compare.ts` (new; contract in ARCHITECTURE §10)
- `scripts/verify_debugkit.ts` (append)
- `src/tools/debug/DebugReportApp.tsx`
- `src/tools/debug/components/CompareView.tsx` (new)

**Engine:**
1. Parse both inputs with the existing `splitSegments` and `segmentsToExchanges` / `harToExchanges`. Take the **first** exchange of each side. When a side has several, add the note "Compared the first request of each side."
2. Use **one** shared `Redactor` for both sides.
3. Diff, in this order:
   - method;
   - URL origin + path;
   - query keys (values compared through their placeholders);
   - request headers by name, case-insensitive (values compared after redaction, so equal secrets compare equal and different secrets differ);
   - cookies by name;
   - top-level JSON body keys;
   - response status;
   - content-type.
4. Findings (label DETECTED):
   - "Authorization header is present in the working request but missing in the failing one" (high);
   - "Different credentials: the token differs between the two requests" (medium);
   - "Origin differs" (medium, CORS-relevant);
   - "Content-Type differs" (medium);
   - "Method differs" (high);
   - "Cookie <name> missing in failing request" (medium).

   Use the existing `Finding` shape with evidence lines built from placeholders only.

**UI:**
- A Segmented "Single / Compare" (`debug-mode`) in the input pane. Compare shows two stacked editors (`debug-compare-working`, `debug-compare-failing`).
- The output Findings tab shows the compare findings, and a "Differences" table: name, working, failing, with differing rows highlighted.

**Tests:**
- working (with Authorization) vs failing (without) → the high finding;
- two different JWTs → the "token differs" finding, and both sides show different `<JWT_n>` placeholders;
- the same JWT on both sides → `same: true` for that header;
- the planted-secrets leak test over `sanitizedA`, `sanitizedB` and all findings.

**e2e:** `debug_compare_mode`, `debug_compare_missing_auth_finding`.

---

## T-305: Review tab (before/after diff with local reveal)

**Files:** `src/tools/debug/components/ReviewView.tsx` (new), `DebugReportApp.tsx`.

**Behaviour:**
- A new output tab **Review**, between Sanitized and Share.
- It shows a line diff (use `computeDiff` from `src/core/diff`, line mode) between the original input and the sanitized output.
- **By default, the original side's changed lines are masked:** each changed span shows `••••••`. A Toggle "Show original values" (`debug-review-reveal`, default off, resets to off whenever the input changes) reveals them.
- A banner explains: "Only you can see this. Original values never leave this tab."
- Clicking a ledger category filters the diff to the lines with that category.

**e2e:**
- `debug_review_masked_by_default`: the raw token is not in the page text while the toggle is off;
- `debug_review_reveal_shows_original`;
- `debug_review_resets_on_input_change`.

---

## T-306: Web Workers, agent/JSON report formats, regex timeout

**Files:**
- `src/workers/runInWorker.ts`, `src/workers/debug.worker.ts`, `src/workers/regex.worker.ts` (new)
- `src/lib/debugkit/report.ts` (formats)
- `src/tools/debug/*` and `src/tools/regex/RegexTesterApp.tsx` (use the workers)
- `scripts/verify_debugkit.ts` (append)

**Steps:**
1. `runInWorker` as in ARCHITECTURE §9. The worker files import only pure code. The CSP already has `worker-src 'self'`; verify there are no CSP errors in e2e.
2. Debug Report:
   - inputs over 200,000 characters, and any analysis with a policy that has patterns, run in `debug.worker.ts` with a 15 s timeout. This covers **both** Debug Report and Secret Scanner (`scanSecrets`): the worker accepts `{ kind: "analyze" | "scan", … }`;
   - a timeout shows "Analysis took too long and was stopped. Try a smaller part of the input.";
   - smaller inputs stay synchronous, as today.
3. Regex Tester: matching runs in `regex.worker.ts` with a 1,000 ms timeout. A timeout shows (`data-testid="regex-timeout"`): "This pattern took too long on this text (possible catastrophic backtracking). It was stopped so the page stays responsive." **This fixes the V1 ReDoS freeze.**
4. `renderReport(rep, "agent")`: like `"ai"`, but placeholders in the summary section are annotated:
   - JWTs: `<JWT_1 alg=RS256 exp=2026-10-22T09:15Z expired>`, from `rep.jwts`;
   - other categories: `<COOKIE_2 cookie>` and similar.

   The first line reads: `Context for an AI coding agent. Secrets were replaced with placeholders; do not ask for the real values.`
5. `renderReport(rep, "json")`: `JSON.stringify` of
   ```
   { schemaVersion: 1, generator: "dev-tools-hub debugkit", findings: [{ id, severity, label, title, why, action, evidence }],
     redactions: rep.redactions, segments: rep.segments, jwts: rep.jwts, logs: summary-only fields, notes }
   ```
   with 2-space indent. **No raw values, and no `sanitized` field** (sizes vary).
6. The Share tab gets two more format options: "Agent" and "JSON".

**Tests:**
- worker timeout (a busy-loop worker) → `reason: "timeout"`;
- regex `(a+)+$` against `"a".repeat(30)+"!"` → e2e `regex_redos_stopped` within 3 s, and the page still responds (palette opens);
- agent and json formats pass the planted-secret leak test;
- json format parses back and has `schemaVersion: 1`.

Then **STOP: Checkpoint CP3.** The reviewer also runs an independent security review (Sonnet) of `src/lib/debugkit/**` and the workers.
