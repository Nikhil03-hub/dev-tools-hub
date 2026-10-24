# Phases 4–6: CLI + MCP, integrations, release

These specs are complete enough to start. The reviewer refines them at CP3/CP4 with the latest engine state; if the queue says `NEEDS_SPEC_UPDATE`, wait.

---

## P4: CLI and MCP (T-401 … T-406)

**Architecture:** ARCHITECTURE.md §11. Zero runtime dependencies in the published package (everything is bundled), Node ≥ 20, `util.parseArgs`, no telemetry, and no network modules imported (`check-boundaries` covers `cli/src`).

### T-401: CLI build skeleton
- Create:
  - `cli/package.json` (fields as in ARCHITECTURE §11, `"version": "0.1.0"`, and `"private": true` until the owner reserves the npm name);
  - `cli/README.md`;
  - `cli/LICENSE` (copy of the root LICENSE);
  - `cli/src/main.ts`, which prints `--help` and `--version`;
  - `vite.cli.config.ts`.
- `vite.cli.config.ts` builds with `build: { ssr: "cli/src/main.ts", outDir: "cli/dist", target: "node20", rollupOptions: { output: { entryFileNames: "debugreport.mjs", banner: "#!/usr/bin/env node" } } }` and `ssr: { noExternal: true }`.
- Root scripts: `"build:cli": "vite build --config vite.cli.config.ts"`. Add `npm run build:cli` to `check`.
- vitest `cli/test/cli.test.ts` spawns `node cli/dist/debugreport.mjs --version` and expects `0.1.0`.

### T-402: `debugreport [file|-]` and `debugreport sanitize`
- Report: read the file or stdin, call `analyze`, then `renderReport(format)`.
  - Options: `--format ai|issue|plain|agent|json` (default `plain`), `--no-emails`, `--no-ips`, `--now <ISO>`.
  - Files over 50 MB → exit 2 with the message "File is larger than 50 MB."
- `sanitize <file> [-o out]`:
  - a HAR goes through the HAR path (`analyze().sanitized` is valid JSON for HAR input; verify that with a test);
  - other files are written as `sanitized` text;
  - default output `<name>.sanitized<ext>`. It refuses to overwrite an existing file unless `--force`.
- Tests:
  - the 3 built-in samples;
  - stdin piping;
  - a sanitized HAR still parses as JSON;
  - the planted-secret leak test on every output.

### T-403: `scan` and `compare`
- `scan <files…> [--json]`: per file, the hits (category, line:column, placeholder). Never the value.
  - Exit codes: **0 clean / 1 secrets found / 2 error**.
  - `--json` prints `{ files: [{ path, hits: [...] }] }`.
- `compare <working> <failing>`: prints the compare report (plain or `--format json`).
- Tests: the exit codes, and that `--json` parses.

### T-404: Policy file
- `.debugreport.json` is auto-loaded from the current working directory. `--policy <path>` overrides it and `--no-policy` disables it.
- Invalid policy → exit 2 with the `parsePolicy` message.
- Policy regexes run in a `worker_threads` worker with a 15 s timeout (same rule as the web).

### T-405: MCP server (`debugreport mcp`)
- Stdio transport only.
- Tools:
  - `diagnose { text, format? }`;
  - `sanitize { text }`;
  - `scan { text }`;
  - `compare { working, failing }`.
- Each tool description states: "Runs locally; never sends data anywhere."
- Results are text content. No raw secrets ever: the leak test runs over every tool's output.
- **Decision D-15 (made by the reviewer at CP4):** the official `@modelcontextprotocol/sdk` (bundled, stdio server only) or a minimal hand-written JSON-RPC implementation for protocol `2025-06-18` (`initialize`, `tools/list`, `tools/call`, `notifications/initialized`).
- Test: spawn the server, send `initialize`, then `tools/list` and `tools/call` over stdin, and assert the responses.

### T-406: `/cli/` docs page
- A static page (`pages.ts` id `cli`, route enabled in the router tables).
- Content:
  - install (`npx debugreport …`);
  - examples (pipe a log, sanitize a HAR before attaching it to a ticket, `scan` as a pre-commit check);
  - MCP setup snippets for Claude Code (`claude mcp add debugreport -- npx -y debugreport mcp`), Cursor and VS Code;
  - the privacy statement.
- Then **STOP: Checkpoint CP5** (Sonnet security review of `cli/**`).

---

## P5: Integrations (T-501 … T-503)

### T-501: GitHub Action (composite)
- Folder `action/` with `action.yml`:
  - inputs `paths` (glob), `fail-on-secrets` (default `true`), `sanitize` (default `false`);
  - runs `npx --yes debugreport@<pinned version> scan …`, or `sanitize` in place when `sanitize: true`.
- Docs: use it before `actions/upload-artifact` to stop HAR files, Playwright traces and logs leaking tokens. This is documented ArtiPACKED-class risk; see the research file.
- Published later by the owner, in a separate repo `debugreport-action` or as a subfolder reference.

### T-502: Sanitizing intake-page template
- `templates/intake/index.html`: one self-contained static HTML file with no network, in the same visual style.
- Flow:
  - a vendor's customer drops a HAR or log;
  - it is sanitized locally (the engine is bundled in by a small build script `scripts/build-intake.mjs` using the Vite library build);
  - the customer reviews it;
  - the customer downloads `<name>.sanitized.har` and attaches it to the vendor's own help desk.
- Configurable: a JSON block in the file sets the vendor name, colour, policy and support link.
- No hosting by us.

### T-503: Docs pages
- `/docs/` index plus short guides:
  - "Share a HAR file safely";
  - "Debug a 401 with an expired JWT";
  - "Fix CORS preflight failures";
  - "Give an AI agent your logs without leaking secrets".

  Each is a static page with real examples from the samples. These are the SEO and education layer.
- Then **STOP: Checkpoint CP6.**

---

## P6: Release (T-601 … T-605)

- **T-601: Performance pass.** Budgets hold. Lighthouse in the reviewer's environment ≥ 90 performance and ≥ 95 accessibility, best practices and SEO on `/`, `/debug-report/` and `/json-formatter/`. Fix whatever is found.
- **T-602: Accessibility pass.** axe is clean in both themes on every page. Do a keyboard-only walkthrough of the five flagship flows and record it in the report.
- **T-603: Content.**
  - README rewrite: what it is, screenshots, privacy, tools list, CLI, contributing;
  - SECURITY.md: V3 wording, workers, policy;
  - `/about/` changelog.
- **T-604: Counters build check.** PowerShell `$env:VITE_GC_CODE="nikhil03"; npm run build` (bash: `VITE_GC_CODE=nikhil03 npm run build`):
  - the CSP img-src includes the counter host;
  - the 12 events still fire only on the Debug Report actions;
  - the e2e counters variant passes. The reviewer specifies the exact checks at CP6.
- **T-605: Release candidate.**
  - every RELEASE_CHECKLIST.md item is ticked;
  - tag `v3.0.0-rc1` locally;
  - write `docs/v3/reports/RC1.md`;
  - **STOP**. The owner deploys after the reviewer accepts.
