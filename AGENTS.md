# AGENTS.md: rules for any coding agent working in this repository

This file is read automatically by Qoder and other coding agents. **Read it fully before every session.** If anything in a task file conflicts with this file, this file wins. If something is unclear, stop and ask; do not guess.

## 1. Your role

You are the **implementation engineer** for Dev Tools Hub V3. Other people handle everything else:

- **The architect/reviewer (Claude Opus)** wrote the plan in `docs/v3/` and accepts or rejects your work.
- **The owner (Nikhil)** runs you, pushes commits and deploys.

You implement **exactly one task at a time** from `docs/v3/TASK_QUEUE.md`, following its spec in `docs/v3/tasks/`. You do not redesign the product, add scope, or change architecture. If a task seems wrong, impossible or under-specified, write the question in your task report and stop that task.

## 2. Golden rules (never break these)

1. **No user data ever leaves the browser.**
   - Never add `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `EventSource`, remote `<img>`/`<script>`/`<link>`/font URLs, analytics or CDNs to app code.
   - The CSP keeps `connect-src 'none'`.
   - The only allowed outbound request is the existing GoatCounter pixel in `src/lib/metrics.ts`, and only with its fixed event names. Do not add events.
2. **Never weaken a test to make it pass.**
   - Do not delete, skip or loosen an existing check in `scripts/verify_lib.ts`, `scripts/verify_debugkit.ts` or `test/e2e.cjs`.
   - You may ADD checks. You may change an existing check only when the task file explicitly says so, and you must quote that sentence in your report.
3. **Do not change the Debug Report engine's behaviour** (`src/lib/debugkit/*`) unless the task explicitly allows it. When it is allowed, all 147+ existing checks must still pass.
4. **No new npm dependency** unless the task names it with an exact version. That list is in `docs/v3/DEPENDENCIES.md`.
   - Install with `npm install --save-exact <name>@<version>` (`--save-dev` for dev tools).
   - Never add a dependency that makes network calls, uses `eval` (except the existing Ajv), or needs a CDN.
5. **Never deploy, never push, and never run** `netlify`, `npm publish`, `git push`, `git push --force`, `git reset --hard`, `git clean -fdx` or `rm -rf` outside `dist/` or `node_modules/`. The owner pushes and deploys.
6. **Never put secrets in the repo.**
   - Test fixtures use obviously fake values: `example.com`, `203.0.113.x`, keys with `FAKE`/`EXAMPLE` in them.
   - New fake-secret fixtures go ONLY in files already allow-listed in `.gitleaks.toml`, or in a task-approved new file that the task also adds to `.gitleaks.toml`.
7. **Never render untrusted input as HTML.**
   - No `dangerouslySetInnerHTML`, except the Markdown preview task, which must use DOMPurify exactly as specified.
   - No `innerHTML`, no `new Function`, no `eval`.
8. **Pure logic stays pure.**
   - Code in `src/core/**` and `src/lib/debugkit/**` must not import React, touch `window`, `document`, `navigator` or `localStorage`, or use timers for logic.
   - It must run under Node.
   - `npm run check:boundaries` enforces this.
9. **Keep it working at every commit.** Each task ends with `npm run check` passing. Never commit a broken build.
10. **Small, reviewable diffs.**
    - Touch only the files the task lists (plus `docs/v3/TASK_QUEUE.md` and your report).
    - If you must touch another file, explain why in the report.

## 3. Repository map (after Phase 1)

```
src/
  main.tsx                 app entry
  App.tsx                  shell: sidebar, top bar, routing, palette
  registry/
    types.ts               ToolMeta, ToolCategory (CONTRACT, do not change without a task)
    tools.ts               the list of tools (pure data + lazy loaders)
  shell/                   Sidebar, TopBar, HomePage, ToolLayout, ThemeToggle, PrivacyPopover...
  components/              shared UI (CommandPalette, ToastHost, Button, Pane, CodeArea...)
  core/<tool>/             PURE logic per tool (no React/DOM) + its tests (*.test.ts)
  tools/<tool>/            React UI per tool (imports from core/)
  lib/                     existing V1 helpers (jwt, regex, timestamp, hash...); lib/debugkit = engine
  theme/                   design tokens
scripts/                   verify_*.ts, postbuild-*.mjs, check-*.mjs, e2e runner
test/e2e.cjs               browser end-to-end suite (Playwright)
docs/v3/                   the plan: ARCHITECTURE, UX_SPEC, IMPLEMENTATION_PLAN, TASK_QUEUE, tasks/, reports/
cli/                       (Phase 4) the `debugreport` command-line tool
```

## 4. How to work a task (always this loop)

1. Open `docs/v3/TASK_QUEUE.md` and take the **first task with status `READY`** whose dependencies are all `ACCEPTED` or `DONE`. Set it to `IN_PROGRESS`.
2. Read its full spec in `docs/v3/tasks/<file>.md`, plus any sections of `docs/v3/ARCHITECTURE.md` / `docs/v3/UX_SPEC.md` it references.
3. Read every file you are going to change **before** changing it.
4. Implement exactly what the spec says. Write the tests the spec lists.
5. Run `npm run check`. When the task says so, also run `npm run test:e2e`. Fix failures.
   - If the same check fails 3 times in a row, STOP: set the task to `BLOCKED`, write the report, and move on to nothing else.
6. Write the report `docs/v3/reports/<TASK-ID>.md` using the template in §10.
7. `git add -A` then `git commit -m "<TASK-ID>: <title>"`. One task = one commit. Fix-up commits for the same task use `"<TASK-ID> fix: ..."`.
8. Set the task status to `DONE` in `TASK_QUEUE.md` (in the same commit).
9. If the next queue row is a **CHECKPOINT** row, STOP and tell the owner: "Checkpoint <CP-ID> reached." Otherwise continue with the next READY task.

Statuses: `READY` → `IN_PROGRESS` → `DONE` (by you) → `ACCEPTED` / `REJECTED` (by the reviewer only).
- Never mark a task `ACCEPTED`.
- A `REJECTED` task gets repair tasks `R-xxx` added by the reviewer. Do those first.

## 5. Commands (work on Windows PowerShell and Linux)

| Command | What it does |
|---|---|
| `npm ci` | clean install (only when package-lock changed or node_modules is missing) |
| `npm run dev` | dev server at http://localhost:5173 |
| `npm run check` | **the gate**: typecheck + boundaries + unit tests + verify_lib + verify_debugkit + build. Must pass before every commit |
| `npm run test:unit` | vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:e2e` | builds nothing; previews `dist/` and runs the browser suite (needs `npx playwright install chromium` once) |
| `npm run build` | production build into `dist/` (counters OFF) |

Until task T-101 is done, use the V1 commands from README.md.

**On Windows PowerShell:**
- Use `git grep -nE "<pattern>"` instead of `grep`.
- Set environment variables like this: `$env:VITE_GC_CODE="nikhil03"; npm run build; Remove-Item Env:VITE_GC_CODE`.
- `npm run test:e2e` refuses to start if something already listens on port 4173. Close old `vite preview` windows first.

## 6. Coding conventions

- **TypeScript strict.** No `any` in new code (use `unknown` + narrowing). No `// @ts-ignore`.
- **React 18** function components and hooks.
  - Every tool UI is `const <Name>Tool = forwardRef<ToolHandle, ToolProps>(function <Name>Tool(props, ref) { … }); export default <Name>Tool;`. It is loaded lazily from the registry and exposes palette commands through `useImperativeHandle(ref, () => ({ getCommands }))` (see `src/lib/toolHandle.ts` and the V1 tools).
  - Tools **never** wrap themselves in `ToolLayout`: `ToolHost` does that (T-108).
- **Styling:**
  - Tailwind classes using the semantic tokens only: `bg-canvas`, `bg-surface`, `bg-raised`, `text-ink`, `text-ink-dim`, `text-ink-faint`, `border-border`, `text-accent`, `bg-accent`, `text-ok`, `text-warn`, `text-err`, `text-info`.
  - **Never hard-code hex colours** in components.
  - Reuse the shared components in `src/components/` (Button, Pane, Tabs, CodeArea, CopyButton, EmptyState...). Do not invent new visual styles. Follow `docs/v3/UX_SPEC.md`.
- **Icons:** `lucide-react` (already installed). Size 16 in toolbars, 20 in cards.
- **Files:** components `PascalCase.tsx`, logic `camelCase.ts`, tests next to logic as `name.test.ts`.
- **Errors:** pure functions never throw on user input. They return `{ ok: true, value } | { ok: false, error: { message, line?, column? } }` (type `Result<T>` in `src/core/result.ts`).
- **Big input:** treat inputs up to 5,000,000 characters as normal. Never freeze the tab for more than about 200 ms. Debounce typing at 150 ms. Heavy work goes to a Web Worker when the task says so.
- **Accessibility:**
  - Every interactive element is reachable by keyboard and has a visible focus ring.
  - Icon-only buttons have `aria-label`.
  - Results areas use `aria-live="polite"`.
- **Copy and text:** plain, short, friendly English. Sentence case. No exclamation marks. No marketing fluff in the UI.
- **Comments:** explain WHY, not what. Keep the existing comment style.

## 7. Privacy and security checklist (run mentally before every commit)

- [ ] No new network APIs, remote URLs or third-party embeds.
- [ ] No user input written to `localStorage`. Only preferences may be stored: theme, last tool, policy rules the user explicitly saved. Always wrap in `try/catch`.
- [ ] No user input put into the URL (no `?q=<input>`, no share links carrying data) unless a task explicitly specifies it.
- [ ] No HTML rendering of user input. Text goes through React text nodes only.
- [ ] Regexes from users run with the protections in the task (length limits, worker + timeout).
- [ ] Downloads use `Blob` + object URL and are created only on user click.
- [ ] Clipboard writes only on user action.

## 8. Testing rules

- Every pure function in `src/core/**` gets unit tests (vitest) covering:
  - a happy path;
  - edge cases: empty input, huge input, unicode, malformed input;
  - one "never throws" fuzz loop over random strings.
- **Where new e2e code goes:** insert every new section **immediately before the line `await browser.close();`** in `test/e2e.cjs`.
  - A section that navigates (`goto`, `reload`, a new URL) must use its own page from the helper `newCheckedPage(context)` (added in T-102) and close it at the end.
  - Never navigate the shared `page` in a new section: that adds requests to the after-load network checks.
- localStorage keys the app may write: `dth.debug.firstSeen`, `dth.theme`, `dth.sidebar`, `dth.recent`, `dth.policy.v1`. Nothing else.
- Every new tool gets e2e checks in its own section:
  - page loads at its URL with no console errors;
  - main action works;
  - copy works;
  - no requests after load other than same-origin assets.
- Name e2e checks `<toolid>_<what>`, e.g. `yaml_json_roundtrip`.

## 9. Stop conditions (stop and report instead of improvising)

- The task needs a file, dependency or decision that is not in the spec.
- A golden rule would have to be broken.
- An existing test fails and you cannot see why after 3 attempts.
- The build size budget in the task is exceeded by more than 10%.
- You notice a security or privacy problem anywhere. Report it, do not fix it silently.

## 10. Task report template (`docs/v3/reports/<TASK-ID>.md`)

```
# <TASK-ID>: <title>
Status: DONE | BLOCKED
Commit: <short sha after commit, or "see commit">

## What I changed
- <file>: <one line>

## Commands run and results
- npm run check → PASS (unit N passed; verify_lib ALL PASS; verify_debugkit N passed; build OK, dist size X kB)
- npm run test:e2e → PASS N / FAIL M (or "not run: reason")

## Acceptance criteria
- [x] AC1 ... (how verified)
- [ ] AC2 ... (why not)

## Deviations from the spec
- none | <what and why>

## Questions / risks for the reviewer
- none | <...>
```
