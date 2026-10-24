# Dependency register

Only the packages listed here may be added, at exactly these versions. Versions and licences were checked against the npm registry on 2026-10-22. Install with `npm install --save-exact` (`--save-dev` for dev).

## Already in V1 (unchanged)

React 18.3, CodeMirror 6 (+ `@uiw/react-codemirror`), Ajv 8 (needs `'unsafe-eval'`), `lucide-react` 0.451, `clsx`, Vite 6.4, Tailwind 3.4, TypeScript 5.6.

`vite-plugin-singlefile` is **removed in T-104**.

## Approved for V3

| Package | Version | Licence | Type | Task | Why / notes |
|---|---|---|---|---|---|
| vitest | 5.0.5 | MIT | dev | T-101 | unit tests; peer `vite ^6.4` ✓ |
| tsx | 4.23.15 | MIT | dev | T-101 | runs the TS scripts (verify, postbuild-pages) |
| playwright | 1.64.1 | Apache-2.0 | dev | T-101 | e2e; browsers via `npx playwright install chromium` |
| axe-core | 4.14.0 | MPL-2.0 | dev | T-109 | accessibility checks in e2e (injected from disk) |
| yaml | 2.9.1 | ISC | runtime | T-201 | 0 dependencies; alias-bomb guard via `maxAliasCount` |
| diff | 9.0.0 | BSD-3-Clause | runtime | T-202 | 0 dependencies; has a `timeout` option |
| cronstrue | 3.38.0 | MIT | runtime | T-205 | 0 dependencies |
| croner | 10.0.1 | MIT | runtime | T-205 | 0 dependencies; time zones via Intl |
| papaparse | 5.7.0 | MIT | runtime | T-206 | 0 dependencies |
| @types/papaparse | 5.5.2 | MIT | dev | T-206 | types |
| qrcode-generator | 2.0.4 | MIT | runtime | T-219 | 0 dependencies (chosen over `qrcode`, which pulls in yargs/pngjs) |
| sql-formatter | 15.9.0 | MIT | runtime | T-221 | depends on nearley, argparse. **Check the built chunk for `eval`/`new Function` at CP4** |
| marked | 18.1.1 | MIT | runtime | T-222 | 0 dependencies |
| dompurify | 3.4.17 | MPL-2.0 OR Apache-2.0 | runtime | T-222 | sanitizer for the Markdown preview |
| smol-toml | 1.9.1 | BSD-3-Clause | runtime | T-224 | 0 dependencies |
| @modelcontextprotocol/sdk | 1.32.1 | MIT | dev (bundled into the CLI) | T-405 | **pending D-15**; stdio path only |

## Rejected

| Package | Why |
|---|---|
| `qrcode` | pulls in a CLI framework (yargs) and pngjs; `qrcode-generator` is dependency-free |
| `fast-xml-parser` (5.x) | 6 transitive packages for a feature we can do with a small tokenizer plus the native DOMParser |
| `prettier` (standalone) | multi-MB bundle for code formatting; out of scope for V3 |
| any analytics SDK, CDN or font service | breaks the privacy model |
