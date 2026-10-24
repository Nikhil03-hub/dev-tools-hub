# Review and repair protocol

## 1. When reviews happen

| Checkpoint | After | Reviewer | Extra |
|---|---|---|---|
| CP1 | P1 foundation | Opus | visual comparison with `design/reference.html` |
| CP2 | batch A tools | Opus | — |
| CP3 | differentiators (engine changes) | Opus + **Sonnet independent security review** | redaction leak tests, ReDoS, workers |
| CP4 | batch B tools | Opus | dependency review (`eval`, network, licences) |
| CP5 | CLI + MCP | Opus + **Sonnet independent security review** | stdin/file handling, exit codes, MCP protocol |
| CP6 | integrations | Opus | — |
| RC1 | release pass | Opus | full release checklist, then the owner approves the deploy |

**Ad-hoc reviews:**
- the implementer marks a task `BLOCKED`;
- the same failure repeats across two tasks;
- the owner sees something wrong.

## 2. What the owner does at a checkpoint (about 5 minutes)

1. In the repo folder (PowerShell):
   ```
   git status        # must be clean
   git log --oneline -15
   git push -u origin v3
   ```
   (The first time, also open a **draft PR** `v3 → master` on GitHub so CI runs on every push. Do not merge it.)
2. In the Claude (Cowork) chat, say:

   > "CP<n> ready, pushed to v3."

   If pushing isn't possible, say:

   > "CP<n> ready, not pushed."

   The reviewer then reads the repo from `D:\Claude\Business\Dev Tools Hub\V3\dev-tools-hub` directly.

## 3. What the reviewer does (Opus)

1. **Get the code.** Either clone `v3` from GitHub into a clean sandbox, or pack the local repo (excluding `node_modules`, `dist` and `test-results`) and stage it.
2. **Run everything independently:**
   - `npm ci`;
   - `npm run check`;
   - `npm run test:e2e` (Chromium);
   - the counters build when relevant;
   - screenshots at 1440×900 in light and dark, and at 390×844.
3. **Read the diff** for every task since the last checkpoint: `git diff <last-accepted>..v3`. Check:
   - scope;
   - golden rules (AGENTS §2);
   - boundaries;
   - test quality (no weakened checks; new tests really test something);
   - copy and UX against UX_SPEC;
   - security (SECURITY_REVIEW threat list).
4. **Classify every issue:**

   | Severity | Meaning | Action |
   |---|---|---|
   | S1 Blocker | privacy/security breach, data could leave the browser, a secret leak in output, a broken build, a lost V1 behaviour | task → `REJECTED`; a repair task comes first |
   | S2 Major | an acceptance criterion not met, a wrong result, an accessibility violation, UX far from the spec | repair task before the next phase |
   | S3 Minor | polish, copy, small inconsistency | repair task, may run later in the same phase |
   | S4 Note | an idea or follow-up | logged in DECISIONS/backlog, no task |

5. **Write the outcome:**
   - a `REVIEW_LOG.md` entry (template below);
   - mark tasks `ACCEPTED` or `REJECTED` in `TASK_QUEUE.md`;
   - insert `R-CP<n>-<k>` repair rows, each with a mini-spec: file, problem, expected behaviour, test to add;
   - update `PROJECT_STATE` (the owner's `Project_State.md`, Dev Tools Hub section).
6. **Tell the owner,** in one message, what to tell the implementer, normally:

   > "Continue with the queue."

## 4. Regression rules

- A previously accepted e2e check that fails is always S1 until it is explained.
- The e2e PASS count never goes down between checkpoints. It only goes up.
- verify_debugkit's count only goes up.
- The bundle budgets never get looser without a DECISIONS entry.

## 5. Interruption and resumption

All state lives in git and in `docs/v3/`. To resume after any break, with any model:
1. read `AGENTS.md`;
2. read `TASK_QUEUE.md`;
3. take the first `IN_PROGRESS` or `READY` row;
4. if the row is `IN_PROGRESS`, read its report draft and `git status`. If the working tree is dirty and the task isn't finished, either finish it, or, if the changes are unclear, `git stash` and restart the task.

## 6. REVIEW_LOG entry template

```
## CP<n> — <date> — <ACCEPTED | ACCEPTED WITH REPAIRS | REJECTED>
Commit range: <sha>..<sha>   Reviewer: Opus (+ Sonnet)
Environment: clean Linux sandbox, Node <v>, Chromium <v>
Results: check PASS/FAIL · unit N · verify_lib · verify_debugkit N · e2e N/N · budgets OK/…
Accepted: T-…, T-…
Rejected: T-… (why)
Issues:
- [S1] <file:line> <problem> → R-CP<n>-1
- [S2] …
Screenshots reviewed: <list>
Next: <exact instruction for the implementer>
```
