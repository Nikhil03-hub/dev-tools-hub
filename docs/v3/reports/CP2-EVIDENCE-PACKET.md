# CP2 evidence packet — prepared by the implementing agent (Qoder)

**This document records evidence and reproduction steps. It records no decision.**
CP2's reviewer is **Opus** ([REVIEW_PROTOCOL.md](../REVIEW_PROTOCOL.md) §1); the implementation
author may not mark any checkpoint row. CP1 remains `PENDING` and no status column here was touched.

Prepared 2026-10-26 at ~01:45, after the owner relayed the independent reviewer's three questions
about T-206. Batch A implementation is **frozen**: nothing was committed to source after `20c7e83`,
no repair was made to any flagged item, and no post-CP2 task was started.

---

## 1. State the reviewer should confirm before running anything

**Everything in this section is a command to run, not a number to copy.** Only documentation commits
land on `v3` during the freeze, so any tip hash, run count or tally transcribed into this file is
stale the moment the next one lands — and one already was (an earlier revision named `7bd3f5d` as the
tip and "5 pass / 2 fail" when the true figures had moved). Read the repository instead.

### 1.1 Branch, worktree and remote — what the path diff alone does not prove

A clean `git diff` over the source paths says *what* changed; it says nothing about *where* you are.
Run all five:

```
git fetch origin v3                 # read-only; origin/v3 is meaningless without it
git rev-parse --abbrev-ref HEAD     # expected: v3
git rev-parse HEAD                  # the tip under review
git rev-parse origin/v3             # must equal the line above
git status --porcelain              # expected: no output at all
```

Then confirm the packet you are reading is the packet that is pushed:

```
git diff --name-only origin/v3 -- docs/v3/reports/CP2-EVIDENCE-PACKET.md
```

Empty means this file matches the branch. If it is not empty, review the `origin/v3` copy
(`git show origin/v3:docs/v3/reports/CP2-EVIDENCE-PACKET.md`), not the working tree.

### 1.2 Which source is actually under review

```
git diff --name-only 20c7e83..HEAD -- src test scripts package.json package-lock.json .github
```

Must print **nothing**. `20c7e83` is the code commit (its own tested tree is `c01ffac`, the last commit
before it that touched anything but `docs/`); everything after it in §1.4's list is documentation only.
If that command lists a file, this packet's measurements no longer describe the branch and the review
scope has to be re-established rather than reused. The same claim as one value per path:

| Path | Tree/blob at `20c7e83` | Equal at `b31cff6` | Re-derive |
|---|---|---|---|
| `src` | `7edee32bbb6c78437f24c0ed97c3661bcc4c8d48` | ✓ | `git rev-parse <rev>:src` |
| `test` | `6dcc532e4c4db5c0e8959d29ef5709fea0bd755a` | ✓ | same |
| `scripts` | `32758358a4a991a5f7ac24ad8931e25b2710005c` | ✓ | same |
| `package.json` | `16bc937074c84b1f2260ff7d060706674e9f5186` | ✓ | same |
| `package-lock.json` | `0d009827b0ffda7e04037d6808016b831c47f9de` | ✓ | same |
| `.github` | `0e37357510e31d0682f3f3d1dcaaa90d0a744e81` | ✓ | same |

The `.github` row carries its own weight: **the CI workflow file is byte-identical across every run
discussed in Finding E**, so the pass/fail spread cannot be explained by an edit to the pipeline — only
by how long the runner takes.

### 1.3 CI verdicts, enumerated live rather than transcribed

```
for c in $(git rev-list --reverse 20c7e83..HEAD); do
  printf "%s " "${c:0:7}"
  curl -s -H "Accept: application/vnd.github+json"     "https://api.github.com/repos/Nikhil03-hub/dev-tools-hub/commits/$c/check-runs" |
  python -c "import sys,json;d=json.load(sys.stdin);print(*[r['name']+':'+r['status']+'/'+str(r['conclusion']) for r in d.get('check_runs',[])] or ['no runs'])"
done
```

`gh` is **not** installed on this machine, hence the raw API. What the output demonstrates is the
pattern, not a number: commits whose §1.2 paths are byte-identical carry **both** verdicts. Two of them
failed, and both failures were the same two assertions in T-202's diff tests (§6). Do not re-run the
pipeline to collect a nicer ratio — Finding E says the ratio is not evidence either way.

For a specific commit, the annotations name the failing lines:
`https://api.github.com/repos/Nikhil03-hub/dev-tools-hub/check-runs/<id>/annotations`.

### 1.4 Other facts worth re-checking rather than trusting

| Fact | Value to confirm | How |
|---|---|---|
| CI on `8925903` (T-205) | `verify` completed / success | the §1.3 loop extended backwards, or the per-commit endpoint |
| Secret scan at `20c7e83` | gitleaks 8.28.0 over 45 commits → no leaks found | re-run per §7's caveat about which binary |
| CI's own scan on later commits | it is the **first** step, before any install, so any run that reached `npm run test:unit` cleared it — including both failures; the failing runs' annotations list only the two diff assertions | §1.3 plus the annotations endpoint |
| Batch A commit range | `git log --oneline 07da1fe^..HEAD` — 19 commits. Per task: T-201 `07da1fe`+`faaa2e3`; T-202 `792d1f8`; T-203 `cf954cb`+`abc07d8`+`76e32e7`; T-204 `facf7ac`+`7cd9896`; T-205 `e86d6b7`+`8925903`; T-206 `8f44b96`+`303775f`+`c01ffac`; the rest are `docs/`-only | `git log --name-only --oneline c01ffac..HEAD` shows every later commit touching only `docs/` |
| Note §10's corpus | it contains a fake `authorization: Bearer x` header, and CI's scan has cleared it on every run since | same as above |

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
| V3 — V1 + JSON excluded + **tight delimiter** | 4 — spaced numeric column, spaced text-only column, padded spacing, spaced + footer line | 1 (markdown table) |
| V4 — V1 + JSON excluded + **all records agree** | 3 — footer line, one ragged row, spaced + footer | 3 — two prose lines, three prose lines, markdown table |
| V5 — **shipped**: V1 + JSON + tight + all-agree | 6 | 1 (markdown table) |

Provenance, since this table changed once already: the V3 row originally read "3 missed" — it was
written from the corpus *before* the footer-line and ragged-row samples were added, and the
re-verification through Appendix A (which reproduces every number above from the shipped modules)
showed it should be 4. V5's 6 and V4's 3 were already current. The conclusion is unchanged and gets
slightly stronger: dropping the all-agree clause recovers 2 CSV forms at zero precision cost.

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
  `full name, city / Ana Rivera, Madrid` are **not detected as CSV** by V3 or V5. **Corrected after
  the first version of this packet:** the claim that "only the paste suggestion is missing" was
  incomplete. Those inputs are not silent — the home page offers a confidently wrong suggestion
  instead, which is documented as Finding D in §5. Recovering them as CSV means accepting
  `Hello, world / Goodbye, friend` under the current rule set, so the correction belongs in the cron
  rule rather than in loosening the CSV rule. Recorded as a judgement for the reviewer, not resolved
  by me.
* The markdown-table false positive is common to every variant including the spec literal; the chip
  is a suggestion, not a routing rule, and it sits at confidence 0.6 below the sharper signatures.

Reproducible with the source in **Appendix A** (§10); the same code also ran from `D:/tmp` while this
packet was written.

**Differential confirmation, because "V5 = shipped" is a claim about someone else's code.** The
re-implemented V5 predicate was replayed against all 34 corpus samples next to the detector the app
actually runs (`detectInput`, with the available-id set narrowed to `csv-json` so neither the
three-result cap nor a competing confidence can hide a match). **34 of 34 agree** — including the six
missed CSV forms and the one markdown-table false positive. So the table above describes the shipped
rule, not a look-alike. Reproduce it with Appendix B.

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

## 5. New finding D — a spaced CSV or a comma list is routed to the Cron Explainer

Discovered while measuring §3; it is not one of the reviewer's three questions, and nothing was
changed. Measured in the **built app** — the home page's visible `home-suggest-*` chips at 1440×900
(screenshot `D:/tmp/cp2-home-spaced-csv.png`):

| Paste | Chip the home page actually shows |
|---|---|
| `name, age` / `Ana, 30` / `Bo, 40` — a spaced CSV | **"Looks like a cron expression → Open in Cron Explainer"** |
| `milk, bread, eggs, butter, flour, sugar` | **"Looks like a cron expression → Open in Cron Explainer"** |
| `id,name` / `1,Ana` / `2,Bo` — a tight CSV | "Looks like CSV → Open in CSV ⇄ JSON" ✓ correct |

So the spaced-CSV cost described in §3 is not merely a *missing* suggestion; the user gets a
confidently **wrong** one at confidence 0.7. The rule responsible is **T-205's cron detector**, which
runs before T-206's — that is also why T-205's own tests never saw it.

Mechanism, read from `src/core/detect/detect.ts` (`CRON_SHAPE`, `CRON_FIELD`, `CRON_STRUCTURED`):
the shape's second branch accepts any 5- or 6-token whitespace chunk, so three lines of two tokens
become six; `CRON_FIELD` permits letters **and** commas, so `name,` `Ana,` `30` all pass; and
`CRON_STRUCTURED` counts a bare trailing comma as evidence of structure. Per token:

| Token | passes field alphabet | "structured" | structured if a trailing comma is discounted |
|---|---|---|---|
| `name,` | yes | yes | **no** |
| `Hello,` | yes | yes | **no** |
| `and` | yes | no | no |
| `30` | yes | yes | yes |
| `*`, `*/15` | yes | yes | yes |

Real schedules still separate themselves under the last column: `1,3,5` and `MON,WED` carry
*internal* commas, and any 5-field expression also contains a digit or `*`. A bounded repair therefore
looks plausible — require structure that is not merely a trailing comma — but that is a proposal for
a repair row, not something I implemented. Such a change must keep every existing cron positive green
(`* * * * *`, `*/15 9-17 * * 1-5`, `30 0 * * * *`, `0 0 1 1 SUN`, all seven macros) and add the two
negatives above, both directions, as protocol §3 requires.

Severity is the reviewer's call. My reading, offered without claiming the decision: **S2-leaning**
because the paste box is the home page's flagship entry point and this sends a CSV author to a cron
tool; **S3-leaning** because navigation still reaches the right tool and no data is affected.

### 5.1 The blast radius is wider than the two examples, and the cause is the specification

Measured with 15 realistic non-cron pastes and 24 valid cron forms, against the shipped rule and two
candidate discriminators (corpus and predicates in Appendix D):

| | shipped rule | P1 — a trailing comma no longer counts as structure | P2 — every token must parse as a cron field |
|---|---|---|---|
| Non-cron pastes wrongly claimed | **6 of 15** | 4 of 15 | **0 of 15** |
| Valid cron forms rejected | 0 of 24 | 0 of 24 | 0 of 24 |
| *New* false positives introduced | — | none | **two classes** |

The six the shipped rule claims: `name, age / Ana, 30 / Bo, 40`; `milk, bread, eggs, butter, flour,
sugar`; `alpha, beta, gamma, delta, epsilon, zeta`; `5 apples, 6 pears, 7 plums`;
`123 Main St, Springfield, IL`; and `Lorem ipsum dolor sit, amet consectetur`. So Finding D is not two
unlucky inputs — the rule claims **any 5- or 6-token chunk whose tokens contain only letters, digits and
commas**.

P1 should be dismissed as a fix: it still claims the spaced CSV, because `30` and `40` are digits and so
count as structure under that definition anyway.

P2 removes all six and keeps all 24 valid forms, but it is not free — measured against adversarial input
it newly claims `the and for not you` (five space-separated three-letter tokens pass
an alphabet that allows `[A-Za-z]{3}`) and `MON TUE WED THU FRI` / `JAN FEB MAR APR MAY`. It does
correctly reject `0x1 0x2 0x3 0x4 0x5`, which the shipped rule claims today. A defensible repair is
therefore **position-aware** validation — names only in the month and day-of-week fields, from the real
name sets; `L`, `W`, `#` and `?` only where they are legal — rather than a flatter token test.

**The decision the reviewer owns, beyond which fix to choose:** the loose grammar is *specified*, not
invented in implementation. [P2_tools.md:265](../tasks/P2_tools.md) gives the cron detector as
`^(@(yearly|annually|monthly|weekly|daily|midnight|hourly)|(\S+\s+){4,5}\S+)$` "where every field
matches `^[\d*/,\-?LW#A-Za-z]+$`" — which is precisely what ships. The only departure from that clause is
my own documented D3 tightening in T-205's report (require one structured field), and even that accepts
a trailing comma as the required structure. So any repair is either an amendment to the specification or
a further implementer-side tightening, and specification text is the reviewer's authority. That is why
this is recorded as evidence and left unimplemented.

## 6. New finding E — the CI gate is not deterministic for Batch A

Discovered by checking CI after a documentation-only push, and the most consequential thing in this
packet. Nothing was changed.

| Evidence | Value |
|---|---|
| Identical source, opposite verdicts | §1.3 enumerates the verdicts for every commit after the code under review. Read them from that command rather than from this line; what is invariant is that **some runs passed and some failed while §1.2's paths, `.github` included, were byte-identical**, and every failure was at these two assertions and nowhere else |
| What failed, both times | the same two assertions and nothing else: `src/core/diff/diff.test.ts:82` and `:152`, both `expected true to be false`; each failure's annotations list those two lines plus the job's exit-code-1 note — no other test, gate or scan failed on either run |
| What that means | the gate is nondeterministic rather than persistently broken: the tip is green today, so a green `verify` on `v3` currently carries no information about the tree, and a red one carries no information about the change that preceded it |
| What they assert | `expect(r.ok).toBe(false)` — i.e. the test **requires the diff library's own timeout to fire** |
| Why that flips | `src/core/diff/diff.ts:41` sets `TIMEOUT_MS = 2000`. Measured locally over three repeats, the two tests run in **2020–2027 ms** — about 1% above the budget. On GitHub's runner the same 4,000-line / 40,000-character comparison completed *inside* 2000 ms, so `r.ok` was `true` and the assertion failed |

So the assertion encodes "this machine is slow enough to give up", which is a property of the runner
rather than of the product. The neighbouring `expect(elapsed).toBeLessThan(6000)` in the same test is
fine; it is the demanded-timeout assertion that is environment-dependent.

Two things to hold separately. First, **the product is not what is failing**: every gate —
`npm run check`, the 595-check e2e suite, gitleaks — passes on this machine for this exact tree, and
the failing assertion is about how long a machine takes, not about diff correctness. Second, the pass
pattern is worth reading as load-dependent rather than hardware-dependent: the image-migration note
appears in CI's annotations on every run, passing or failing, so it is a permanent notice rather than
the event that changed the outcome.

Why it matters at a checkpoint: the protocol's regression rules give the gate its authority, and this
one can fail on a tree that nobody changed. The reviewer's own `npm run check` may or may not
reproduce (it passes on this machine), and every future push to `v3` carries a coin-flip until the
test is made deterministic. It is **pre-existing in T-202**, not introduced by T-206 — the docs commit
only exposed it.

Bounded repair direction, offered for the reviewer's repair row rather than implemented: make the
outcome machine-independent instead of inflating the fixture (which just relocates the margin). Either
give the timeout a seam the test can pin, or assert the invariant that holds whichever way the race
goes — *if* it times out, the message must be the "too different to compare quickly" error; *if* it
completes, it must do so within the budget and yield parts. Both directions of that assertion are
testable without depending on CPU speed.

Severity is the reviewer's. My reading, offered not applied: protocol S1 covers "a broken build", and a
gate that fails intermittently on untouched code arguably belongs there because it removes the meaning
of every later green run; S2 is the defensible alternative.

**On chasing tallies.** Each correction to this packet is itself a push and therefore another sample,
so any count written here is obsolete before it is read — which is why §1.1–§1.3 give commands instead
of numbers, and why this section states no ratio at all. **Two failures on byte-identical code are the
finding.** A longer streak of greens would not weaken it, and one more red would not strengthen it;
neither is a reason to re-run the pipeline.

## 7. Caveats about the evidence in this packet

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

## 8. Review inputs the repository does not actually provide

Three things the review prompt and protocol ask for have no source in this repo. Recorded rather
than invented:

1. **There is no accepted checkpoint to diff against.** No row in
   [TASK_QUEUE.md](../TASK_QUEUE.md) carries `ACCEPTED` (CP1 is still `PENDING`), so "review the diff
   for every task since the last accepted checkpoint" has no baseline commit. The practical range for
   Batch A is `git log --oneline 07da1fe^..v3` (T-201's pure-core commit and everything after it).
2. **The e2e floor has no accepted number.** Protocol §4 says the PASS count never goes down between
   checkpoints; because nothing has been accepted, only the implementer-reported history exists:
   413 (T-201) → 444 (T-202) → 477 (T-203) → 516 (T-204) → 548 (T-205) → 595 (T-206). The reviewer's
   own re-run is what turns that into evidence.
3. **`Project_State.md` does not exist in this repository** — checked at the root, in `docs/` and in
   `docs/v3/`. Protocol §3 step 5 calls it "the owner's `Project_State.md`", so it lives outside the
   repo and cannot be updated from here. The CP2 entry therefore lands in `REVIEW_LOG.md` and
   `TASK_QUEUE.md` only, unless the owner supplies that file.

## 9. What this packet does not do

It does not classify severities, does not set a status on any queue row, does not declare CP2
accepted, and does not start T-301. It does not repair the items above, even though two have
one-line fixes, because the review has not been recorded and the repair workflow has not been
authorised. The decision and any `R-CP2-<k>` repair rows belong to the reviewer.

## 10. Appendix — reproduction source

Both listings import the shipped modules directly and write nothing into the repository. Save as
`probe.ts` outside `src/` and run with `npx tsx probe.ts` from the repo root.

**A. The §3 variant matrix and the §4 audit boundary.**

```ts
import { csvToJson, } from "./src/core/csv/csv";
import { detectInput } from "./src/core/detect/detect";

const DELIMS = [",", ";", "\t", "|"];
function records(text: string, d: string) {           // same scan the shipped rule uses
  const counts: number[] = [];
  let fields = 1, quoted = false, has = false, tight = false;
  const sp = (c?: string) => c === " " || c === "\t" || c === "\n" || c === "\r";
  for (let i = 0; i < text.length && counts.length < 5; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') i++; else if (ch === '"') quoted = false; continue; }
    if (ch === '"') { quoted = true; has = true; }
    else if (ch === d) { fields++; has = true; if (!sp(text[i + 1])) tight = true; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; if (has) { counts.push(fields); fields = 1; has = false; } }
    else if (ch !== " ") has = true;
  }
  if (has && counts.length < 5) counts.push(fields);
  return { counts, tight };
}
const jsonish = (t: string) => { const x = t.trim(); if (/^[{[]/.test(x)) return true; try { JSON.parse(x); return true; } catch { return false; } };
const pairOK = (c: number[]) => { const f = c.filter((n) => n >= 2); return f.some((n) => f.filter((m) => m === n).length >= 2); };
const allOK = (c: number[]) => c.length >= 2 && c.every((n) => n === c[0] && n >= 2);
const V = {
  V1: (t: string) => DELIMS.some((d) => pairOK(records(t, d).counts)),
  V2: (t: string) => !jsonish(t) && V.V1(t),
  V3: (t: string) => !jsonish(t) && DELIMS.some((d) => { const r = records(t, d); return pairOK(r.counts) && r.tight; }),
  V4: (t: string) => !jsonish(t) && DELIMS.some((d) => allOK(records(t, d).counts)),
  V5: (t: string) => !jsonish(t) && DELIMS.some((d) => { const r = records(t, d); return allOK(r.counts) && r.tight; }),
};

// §4: the audit window boundary. target=200 warns, target=201 does not.
const file = (target: number, total: number) =>
  "id,n\n" + Array.from({ length: total }, (_, i) => `${i + 1 === target ? "00123" : "1"},${i + 1}`).join("\n");
for (const target of [5, 200, 201, 250, 999]) {
  const r = csvToJson(file(target, 1000), { header: true, delimiter: ",", dynamicTyping: true });
  if (r.ok) console.log(target, JSON.parse(r.value.json)[target - 1].id, r.value.warnings.length);
}
```

**B. The differential that proves V5 is the shipped rule.** Narrowing the detector's `availableIds`
to `csv-json` removes any effect the three-result cap or a competing confidence could have on the
comparison:

```ts
const shipped = (t: string) => detectInput(t, new Set(["csv-json"])).some((d) => d.toolId === "csv-json");
for (const [label, text] of CORPUS) if (V.V5(text) !== shipped(text)) console.log("MISMATCH", label);
```

**C. The corpus**, so §3 and §5 are reproducible exactly rather than descriptively. `CSV` are forms
the tool should detect; `OTHER` are pastes it should stay quiet about.

```ts
const CSV: [string, string][] = [
  ["plain 3-record", "id,name\n1,Ana\n2,Bo"],
  ["spaced after comma, numeric", "name, age\nAna, 30\nBo, 40"],
  ["spaced after comma, text only", "full name, city\nAna Rivera, Madrid\nBo Lee, Lisbon"],
  ["quoted comma", 'a,b\n"Rivera, Ana",x\nBo,y'],
  ["tab separated", "id\tname\n1\tAna\n2\tBo"],
  ["semicolon", "id;note;n\n1;a;2\n2;b;3"],
  ["pipe", "a|b\n1|2\n3|4"],
  ["CRLF", "id,name\r\n1,Ana\r\n2,Bo\r\n"],
  ["blank lines between", "id,name\n\n1,Ana\n\n2,Bo\n"],
  ["only two records", "a,b\n1,2"],
  ["timestamp column", "timestamp,status,msg\n2026-10-25 10:00:00,OK,up\n2026-10-25 10:00:01,WARN,slow"],
  ["emails + booleans", "name,email,signed_up\nAna,a@b.com,true\nBo,b@c.com,false"],
  ["headerless numbers", "1,2\n3,4\n5,6"],
  ["quoted newline inside", 'id,note\n1,"a\nb"\n2,x'],
  ["long file 9 records", "x,y\n" + "1,2\n".repeat(8)],
  ["spaces around padding", " a , b \n 1 , 2 \n 3 , 4 "],
  ["footer note after the data", "id,name\n1,Ana\n2,Bo\n3,Kim\n(exported 2026-10-25 by reports@corp)"],
  ["one ragged row, unquoted comma", "id,note,score\n1,hello,9\n2,why, the, heck,7\n3,ok,5"],
  ["spaced, with a footer note", "name, age\nAna, 30\nBo, 40\n(continued on the next page)"],
  ["blank cells between commas", "a,b,c\n,,\n1,,3"],
];
const OTHER: [string, string][] = [
  ["two prose lines", "Hello, world\nGoodbye, friend"],
  ["three prose lines, one comma each", "Hello, world\nGoodbye, friend\nSee you, later"],
  ["comma-separated log", "2026-10-25T10:00:01 ERROR payment failed, retrying\n2026-10-25T10:00:02 INFO health check ok\n2026-10-25T10:00:03 ERROR db timeout, giving up"],
  ["pretty JSON object", '{\n "a": 1,\n "b": 2,\n "c": 3\n}'],
  ["minified JSON array", '[{"a":1,"b":2},{"a":3,"b":4},{"a":5,"b":6}]'],
  ["YAML manifest", "# manifest\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\n"],
  ["cURL command", "curl https://api.example.com/me -H 'authorization: Bearer x' -d '{\"a\": 1}'"],
  ["cron expression", "*/15 9-17 * * 1-5"],
  ["markdown table", "| a | b |\n|---|---|\n| 1 | 2 |"],
  ["SQL fragment", "SELECT a, b, c\nFROM t, u\nWHERE x, y"],
  ["plain sentence paragraph", "The report was filed late, and nobody noticed\nfor three weeks.\nPlease fix the pipeline."],
  ["INI-ish config", "[section]\nkey = value, other\nx = y"],
  ["single line CSV", "a,b,c"],
  ["empty-ish paste", "\n\n  \n"],
];
```

Every number in §3's table and the shipped-rule differential in §10-B were produced from exactly these
34 samples, and the Finding D chip readings come from the same `detectInput` call with no id filter —
i.e. the input the home page itself uses. A browser check of the visible chips on `/` confirmed the
same two samples render "Looks like a cron expression → Open in Cron Explainer".

**D. The Finding D corpus and the two candidate predicates** (`shipped` is
`detectInput(t, new Set(["cron"]))`).

```ts
const CRON_MUST_KEEP = ["* * * * *", "*/15 9-17 * * 1-5", "0 0 * * 0", "30 0 * * * *", "0 0 1 1 SUN",
  "0 0,30 * * * *", "*/5 * * * MON-FRI", "0 12 * * SUN,SAT", "0 */2 * * *", "0 0 L * *", "0 0 15 * ?",
  "0 9 * * 1#3", "15 10 * * 6L", "0 0 1 JAN *", "*/10 8-20/2 * * *", "05 02 * * *", "0 0 25 12 MON",
  "@daily", "@hourly", "@weekly", "@monthly", "@yearly", "@annually", "@midnight"];

const NOT_CRON = ["name, age\nAna, 30\nBo, 40", "full name, city\nAna Rivera, Madrid\nBo Lee, Lisbon",
  "milk, bread, eggs, butter, flour, sugar", "alpha, beta, gamma, delta, epsilon, zeta", "id,name\n1,Ana\n2,Bo",
  "2026-10-25, Ana, 30\n2026-10-26, Bo, 40\n2026-10-27, Kim, 12", "5 apples, 6 pears, 7 plums",
  "123 Main St, Springfield, IL", "GET /api/v1/users 200 15ms", "The quick brown fox jumps",
  "Lorem ipsum dolor sit, amet consectetur", "a b c d e", "key = value, other\nx = y\nz = w",
  "Host: api.example.com\nPort: 443\nMethod: GET", "48.8584, 2.2945\n51.5074, -0.1278\n40.7128, -74.0060"];

// P1: shipped grammar, but a trailing comma alone is not "structure".
const p1 = (t) => {
  const x = t.trim();
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(x.toLowerCase())) return true;
  const f = x.split(/\s+/);
  if (f.length < 5 || f.length > 6) return false;
  return f.every((v) => /^[\d*/,\-?LW#A-Za-z]+$/.test(v))
      && f.some((v) => /[\d*/\-?LW#]|,[^\s]/.test(v.replace(/,$/, "")));
};

// P2: every token must parse as a cron field value.
const fieldToken = (tok) => tok === "*" || tok === "?" || tok.split(",").every((p) =>
  /^(L|W|LW)$/.test(p) ||
  /^(\*|\?|[0-9]{1,2}|[A-Za-z]{3})(-[0-9]{1,2}|-[A-Za-z]{3})?(\/[0-9]{1,2})?([LW]|#\d)?$/.test(p));
const p2 = (t) => {
  const x = t.trim();
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(x.toLowerCase())) return true;
  const f = x.split(/\s+/);
  return (f.length >= 5 && f.length <= 6) && f.every(fieldToken);
};
```

Results, as printed by running this: `shipped` 6 of 15 non-cron claimed and 0 of 24 valid rejected;
`P1` 4 and 0; `P2` 0 and 0, with the two new false-positive classes listed in §5.1.
