# CP2 evidence packet — prepared by the implementing agent (Qoder)

**This document records evidence and reproduction steps. It records no decision.**
CP2's reviewer is **Opus** ([REVIEW_PROTOCOL.md](../REVIEW_PROTOCOL.md) §1); the implementation
author may not mark any checkpoint row. CP1 remains `PENDING` and no status column here was touched.

Prepared 2026-10-26 at ~01:45, after the owner relayed the independent reviewer's three questions
about T-206. Batch A implementation is **frozen**: nothing was committed to source after `20c7e83`,
no repair was made to any flagged item, and no post-CP2 task was started.

---

## 1. State the reviewer should confirm before running anything

| Fact | Value | How to re-check |
|---|---|---|
| Branch | `v3` (no other branch was touched) | `git rev-parse --abbrev-ref HEAD` |
| Local HEAD | `20c7e83b4afe2ba461f7eb55ecf4f99e2b8ef982` | `git rev-parse HEAD` |
| `origin/v3` | `20c7e83…` — identical, `0 0` ahead/behind | `git fetch origin v3 && git rev-list --left-right --count origin/v3...HEAD` |
| Worktree | clean, no untracked files | `git status --porcelain` (empty) |
| CI on `20c7e83` | `verify` **completed / success** | `curl -s -H "Accept: application/vnd.github+json" https://api.github.com/repos/Nikhil03-hub/dev-tools-hub/commits/20c7e83/check-runs` — note `gh` is **not** installed on this machine |
| CI on `8925903` (T-205) | `verify` **completed / success** | same endpoint, that hash |
| Diff range for Batch A | `git log --oneline 582b759..v3` = the 6 commits of T-205/T-206 plus earlier; T-201…T-206 core/UI pairs are `07da1fe`, `792d1f8`, `cf954cb`/`76e32e7`, `facf7ac`/`7cd9896`, `e86d6b7`/`8925903`, `8f44b96`/`303775f`/`c01ffac` | `git log --oneline -20` |
| Secret scan | `gitleaks 8.28.0 git . --config .gitleaks.toml --redact --no-banner` → **no leaks found**, 45 commits | see caveat in §4 |

The counts below were produced by the implementation agent and must be **re-derived** by the
reviewer, not accepted: `npm ci`, `npm run check`, `npm run test:e2e`. Reported values for
`20c7e83` were check **PASS exit 0** (328 unit tests / 12 registry tools / 27 pure files / budgets OK /
15 URLs) and e2e **595 PASS / 0 FAIL**.

## 2. Reviewer question 1 — formula protection: accurate, but is it *seen*?

Probed in the built app (`vite preview` + Playwright, the shipped CSP and lazy chunk), source
`[{"acct":"-45.5","total":"12","note":"=SUM(A1)","who":"@ada","phone":"+1 555 0100","n":-7}]`.

**Unprotected (the default).** Output: `acct,total,note,who,phone,n` / `-45.5,12,=SUM(A1),@ada,+1 555 0100,-7`.
One note renders: *"4 cells start with = + - @ and can run as a formula when the file is opened in a
spreadsheet. Turn on Formula protection to prefix them with an apostrophe."* The count of 4 is correct:
the four **string** cells, while `12` (numeric text) and `-7` (a JSON number) are not counted.

**Protected.** Output `'-45.5,12,'=SUM(A1),'@ada,'+1 555 0100,-7` and the note reads *"Formula
protection put a leading apostrophe on 4 cells. It makes a spreadsheet treat them as text; it is
not a guarantee against every formula-injection trick."* No JSON number was mutated; no cell outside
the four matched values changed. `console` stayed clean at every step.

**Measured prominence** (bounding boxes against the viewport height; screenshots `D:/tmp/cp2-formula-*.png`):

| Viewport | Status line ("formula protection off") | Risk note | Note styling |
|---|---|---|---|
| 1440×900 | visible | y=823..880 — **visible without scroll** | `rgb(82,82,94)` 12 px, weight 400 |
| 1366×768 | visible | y=691..748 — **visible without scroll** | same |
| 390×844 | visible | y=1034..1107 — **below the fold, needs scrolling** | same |

Computed contrast of the note text on its background: **7.70:1** (legible at any size), but it is
rendered in the neutral `text-ink-dim` tone that all notes share, so nothing visually distinguishes
a risk warning from an informational one.

**No over-claim found in the UI**, and the on-screen wording explicitly refuses the guarantee. One
phrase to judge: the registry `description` (spec-authored verbatim in `P2_tools.md`) ends
*"…and protection against spreadsheet formulas."* That is the tool's own summary line on the home
page and in the prerendered meta description. It claims a capability, not a guarantee, but it is
stronger than the note's framing — recorded for the reviewer rather than reworded by me, because
changing spec text is not the implementer's call.

**Not a defect I fixed:** the honest observation for the reviewer is that `-45.5`-style numeric text
also receives the apostrophe. That is the documented rule (strings starting `-`), it is counted in the
warning, and it changes exported text — worth an explicit S3/S4 judgement rather than a silent tweak.

## 3. Reviewer question 2 — the detector: my tightening was partly unnecessary

Measured with a 21-sample corpus (16 CSV forms, 5 non-CSV) replayed through five rule variants against
the shipped parser, no source changed.

| Rule variant | CSV forms missed | Non-CSV forms claimed |
|---|---|---|
| V1 — spec literal (any 2 of 5 records agree, count ≥2) | 0 | 6 — two prose lines, three prose lines, comma-separated log, pretty JSON, markdown table, SQL fragment |
| V2 — V1 + JSON excluded | 0 | 5 (same, minus pretty JSON) |
| V3 — V1 + JSON excluded + **tight delimiter** | 3 | 1 (markdown table) |
| V4 — V1 + JSON excluded + **all records agree** | 3 | 3 — two prose lines, three prose lines, markdown table |
| V5 — **shipped**: V1 + JSON + tight + all-agree | 6 | 1 (markdown table) |

Definitions and what this shows:

* "Tight delimiter" = at least one delimiter is immediately followed by the next field rather than a
  space. In English, a comma is followed by a space; in an export it is not. **This is the rule doing
  all the prose/log/SQL precision work.**
* "All records agree" (my addition beyond the spec's "any two of five") was measured to buy
  **zero additional precision** over V3 — both leave exactly one false positive (the markdown table) —
  while costing two real CSV forms: a file followed by a footer line (`(exported 2026-10-25 …)`) and a
  file with one unquoted stray comma. The reviewer's suspicion is confirmed: that clause is
  unnecessarily strict and should be dropped, leaving V3.
* The residual, and it is the tight rule's cost, not the all-agree rule's: `name, age / Ana, 30` and
  `full name, city / Ana Rivera, Madrid` are **not detected** by V3 or V5. They convert correctly once
  the tool is opened; only the paste suggestion is missing. Recovering them means accepting
  `Hello, world / Goodbye, friend`, which is the misclassification the batch mandate named. Recorded
  as a judgement for the reviewer, not resolved by me.
* The markdown-table false positive is common to every variant including the spec literal; the chip
  is a suggestion, not a routing rule, and it sits at confidence 0.6 below the sharper signatures.

Reproducible with: `npx tsx D:/tmp/cp2evidence.probe.ts` (imports `src/core/csv/csv.ts` and
`src/core/detect/detect.ts` directly; writes nothing into the repo).

## 4. Reviewer question 3 — Detect numbers: confirmed silent past row 200

Reproduced against the shipped module, a 1,000-row file with `00123` placed in one row at a time:

| Row holding `00123` | Converted value | Warned? |
|---|---|---|
| 5 | `123` (number) | yes — names the column |
| 200 | `123` | yes — names the column |
| 201 | `123` | **no warning at all** |
| 250 / 999 | `123` | **no warning at all** |
| same file, option OFF | `"00123"` (string) | n/a — correct by default |

So the behaviour is exactly as the report disclosed, and the reviewer's framing is the accurate one:
past the audit window the tool performs a data-type rewrite and says nothing, so the note list can
imply an audit it did not perform. **Not fixed** (frozen). A bounded, correct repair that adds no
unbounded parse, for the reviewer to accept or reject as a repair row:

* File: `src/core/csv/csv.ts` → `csvToJson`, the `dynamicTyping` branch.
* Problem: per-column rewrite warnings are derived from the first 200 rows only; rows 201+ are
  converted with no notice.
* Expected: when the option is on and the file has more rows than the audit window, always emit one
  baseline warning that the option rewrites numeric-looking cells across the **whole** file and that
  column naming covers the first N rows. Keep the existing per-column warnings when they do fire.
* Test to add: unit case asserting the baseline warning at 201+ rows *and* that no per-column warning
  appears for a rewrite beyond the window; e2e case `csv_json_detect_numbers_coverage`.

## 5. Caveats about the evidence in this packet

* The browser measurements ran against `vite preview` on port **4174**, started by me and stopped
  again; port 4173 (the suite's own port) was verified free. Chromium only, so nothing here speaks to
  Firefox/Safari/screen-reader behaviour, which stay unverified since CP1.
* `npm run check` and `npm run test:e2e` were **not** re-run after these probes, because no file in
  the repository changed during them. The recorded green run remains the one on `20c7e83`.
* The local secret scan used the **windows_x64** build of gitleaks 8.28.0, because CI's pinned linux
  binary cannot execute on this machine; same version, same config, same history. The reviewer's
  clean-environment run of CI's own job is the authoritative form of this evidence.
* Probe scripts are in `D:/tmp` deliberately: they import the shipped modules but are not part of the
  build, the gates, or the repository, and they leave no artefact in `dist/` or `test-results/`.

## 6. What this packet does not do

It does not classify severities, does not set a status on any queue row, does not declare CP2
accepted, and does not start T-301. It does not repair the three items above, even though two have
one-line fixes, because the review has not been recorded and the repair workflow has not been
authorised. The decision and any `R-CP2-<k>` repair rows belong to the reviewer.
