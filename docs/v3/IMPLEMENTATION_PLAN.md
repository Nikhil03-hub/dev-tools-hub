# Dev Tools Hub V3: implementation plan

Version 1.0 (2026-10-22). Written by Claude Opus. This file explains the **phases, order and recipes**; it does not list tasks. The live list of tasks is `TASK_QUEUE.md`, and each task's full spec is in `tasks/`.

## 0. How the work is split

| Who | Does | Never does |
|---|---|---|
| **Implementer** (DeepSeek V4.1 Flash in Qoder, or any coding model) | One task at a time, exactly as specified. Writes tests and a report, then commits | Redesign, add scope, push, deploy, or mark its own work accepted |
| **Reviewer/architect** (Claude Opus; Sonnet for independent second reviews) | Writes specs, reviews at checkpoints, runs the full suites in a clean environment, accepts or rejects work, writes repair tasks | Write large features (it may write small reference code for risky infrastructure) |
| **Owner** (Nikhil) | Starts the implementer, pushes `v3` at checkpoints, calls the reviewer, decides product questions, deploys releases | — |

**Reference code.** Some infrastructure files were written and tested by the reviewer before implementation started. The implementer copies them in, or they are already in place:
- `scripts/check-boundaries.mjs`, `scripts/run-e2e.mjs`, `vitest.config.ts`
- `src/core/result.ts`, `src/core/router/router.ts` (+ tests)
- `src/registry/types.ts`, `src/registry/meta.ts`, `src/registry/pages.ts`
- `scripts/postbuild-pages.ts`, `scripts/lib/pages-render.ts` (+ tests)
- `docs/v3/reference/postbuild-security.v3.mjs`

They were verified on 2026-10-22 against commit `c7488ef` in a clean Linux sandbox:
- **T-101 applied:** `npm run check` passes (3 unit files / 15 tests) and e2e is 252/252 through the new runner.
- **T-104's build pipeline** (multi-file build, 10 generated pages, per-page CSP) gives e2e 250/252 with zero console errors. The two failures are exactly the ones T-104 permits editing: `title_is_dev_tools_hub` and `initial_requests_only_document`. With those two edits applied it is 252/252. An independent review then found 9 blockers and 18 major spec issues; all are fixed in this version.

## 1. Phases and checkpoints

| Phase | Goal | Tasks | Ends with |
|---|---|---|---|
| **P1 Foundation** | Scalable shell, themes, registry, path URLs, static SEO pages, new look, without breaking any V1 behaviour | T-101 … T-109 | **CP1** |
| **P2a Core tools, batch A** | The six most-searched missing tools, using the tool recipe | T-201 … T-206 | **CP2** |
| **P3 Differentiators** | What competitors lack: request compare, redaction review, custom policy, secret scanner, worker offload, agent format | T-301 … T-306 | **CP3** (security review by Sonnet as well) |
| **P2b Core tools, batch B** | Breadth for search traffic and daily use | T-211 … T-226 | **CP4** |
| **P4 CLI and MCP** | `npx debugreport` + MCP server sharing the same engine | T-401 … T-406 | **CP5** (security review by Sonnet as well) |
| **P5 Integrations** | GitHub Action, sanitizing intake-page template, docs pages | T-501 … T-503 | **CP6** |
| **P6 Release** | Accessibility/performance pass, docs, README, release candidate | T-601 … T-605 | **RC1** → owner deploys |

**Why this order:**
- P1 must come first: every later tool depends on the registry, tokens and page frame.
- Batch A comes before the differentiators because those tools are low-risk, warm up the implementer on the recipe, and bring search traffic.
- The differentiators (P3) come before the long tail (P2b) because they are the reason to choose this product over the 20 other hubs.
- The CLI and MCP (P4) reuse the P3 engine work.

**Time.**
- The free implementer window ends **Sat 24 Oct 2026, 21:29 IST** (23:59 UTC+8). The realistic target for that window is P1 + P2a + most of P3.
- Everything after continues at 0.1x Qoder credits, or with any other implementer, using the same queue.

## 2. Dependency graph

```
T-101 ─► T-102 ─► T-103 ─► T-104 ─► T-105 ─► T-106 ─► T-107 ─► T-108 ─► T-109 ─► [CP1]
                                                                      │
             ┌────────────────────────────────────────────────────────┘
             ▼
   T-201 YAML⇄JSON ─► T-202 Text diff ─► T-203 cURL converter ─► T-204 URL parser ─► T-205 Cron ─► T-206 CSV⇄JSON ─► [CP2]
             │
             ▼
   T-301 Policy (engine) ─► T-302 Policy UI ─► T-303 Secret scanner ─► T-304 Compare (engine+UI)
        ─► T-305 Review tab ─► T-306 Workers + agent/json formats ─► [CP3]
             │
             ▼
   T-211…T-226 (batch B, any order inside the batch) ─► [CP4]
             │
             ▼
   T-401 CLI build ─► T-402 report/sanitize ─► T-403 scan/compare ─► T-404 policy file ─► T-405 MCP ─► T-406 /cli/ page ─► [CP5]
             ▼
   T-501 Action ─► T-502 Intake template ─► T-503 docs ─► [CP6] ─► T-601…T-605 ─► [RC1]
```

Repair tasks `R-<CP>-<n>` added at a checkpoint always run **before** the next normal task.

## 3. The tool recipe (every new tool in P2 follows this)

For a tool with id `<id>` and pure-logic folder `<name>`:

1. **Pure logic** in `src/core/<name>/<name>.ts`:
   - functions return `Result<T>` (`src/core/result.ts`);
   - no React, DOM or network;
   - errors carry `line`/`column` when the input is text.
2. **Unit tests** in `src/core/<name>/<name>.test.ts`:
   - happy paths from the task's example table (exact expected outputs);
   - empty input;
   - unicode;
   - malformed input (error message and position);
   - a large input (≥ 1 MB) finishing under the task's time budget;
   - a 1,000-iteration "never throws" loop over random strings.
3. **UI** in `src/tools/<name>/<Name>Tool.tsx`:
   - `forwardRef<ToolHandle, ToolProps>`. **Do not wrap it in `ToolLayout`**: `ToolHost` already does that, and a second wrapper would give the page two H1s;
   - uses the pattern from UX_SPEC §10 (Convert / Inspect / Generate / Compare / Analyze);
   - shared components only;
   - debounced live update of 150 ms;
   - an empty state with 2–3 samples;
   - Copy (and Download where the output is a file);
   - palette commands via `getCommands()`.
4. **Registry:**
   - append a `ToolMeta` to `src/registry/meta.ts` (title, description, keywords and docs exactly as the task gives them);
   - add a loader to `src/registry/tools.ts`.
5. **Detector** (only if the task lists one): add a rule to `src/core/detect/detect.ts` and a test.
6. **e2e** tests appended to `test/e2e.cjs` in a new section `// ---- <id> ----`:
   - opens `/<slug>/`;
   - main action;
   - copy;
   - `<id>_no_console_errors`.
7. **Dependency** (only if the task names one): `npm install --save-exact name@version`, then confirm the entry in `docs/v3/DEPENDENCIES.md` is already there.
8. `npm run check`, then `npm run test:e2e`, then the report, then commit.

## 4. Conventions

- **Branch.** All work is on `v3`. Commit messages are `T-xxx: <title>` or `R-CPn-m: <title>`.
- **Line endings.** LF in the repo. The `.gitattributes` from T-101 sets `* text=auto eol=lf`, so Windows checkouts don't create noisy diffs.
- **Formatting.** Follow the existing style: 2 spaces, double quotes, semicolons, about 140-column lines. There is no formatter dependency.
- **Test ids.** Keep every existing `data-testid`. New ones are kebab-case and prefixed with the tool id: `yaml-json-input`.
- **Copy.** UX_SPEC §8.

## 5. Definition of done for a task

All of these must be true:
- every acceptance criterion in the task spec is met;
- `npm run check` passes;
- `npm run test:e2e` passes when the task requires it, or always from T-103 onward at checkpoints;
- the report is written;
- the commit is made and the queue is updated.

A task is only **ACCEPTED** after the reviewer's checkpoint review.

## 6. Definition of done for V3.0 (release candidate RC1)

These must all be true. Release candidate 1 can be cut at **any** phase boundary from CP3 onward.
- P1 is accepted. Every tool that ships has been through the recipe and is accepted.
- `RELEASE_CHECKLIST.md` is fully ticked:
  - security review;
  - accessibility (axe: 0 serious or critical violations);
  - performance budgets;
  - mobile at 360 and 390 px;
  - both themes;
  - docs;
  - README;
  - SECURITY.md wording;
  - rollback ready.
- The owner has seen it on their own machine and approved it.

Release candidate 1 does **not** need P4–P5. The CLI can ship separately to npm.
