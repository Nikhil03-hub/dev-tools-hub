# Test matrix

| Area | Unit (vitest) | Legacy suites | e2e (Playwright) | a11y (axe) | Manual / review |
|---|---|---|---|---|---|
| Engine (debugkit) | policy, compare | verify_debugkit (147 + new, append-only) | debug_* | — | Sonnet security review at CP3 |
| V1 libs (jwt, regex, timestamp, hash, uuid, base64, url) | — | verify_lib | V1 sections | yes | — |
| Router / detect / fuzzy / result | router, detect, fuzzy, result | — | paths, home, palette | — | — |
| Registry | check-registry (build) | — | home cards count, sidebar | — | copy review |
| Static pages and CSP | pages-render | — | csp_meta_on_every_page, headers_csp_per_page, sitemap, 404 | — | `_headers` inspection |
| Shell (sidebar, top bar, drawer, theme) | — | — | shell_*, theme_* | every page × 2 themes | screenshots vs reference.html |
| Each P2 tool | core/<tool>.test.ts (examples table + fuzz + big input) | — | `<id>_loads/_main/_error/_copy/_no_console_errors` | yes | copy + UX review |
| Workers | runInWorker timeout | — | regex_redos_stopped | — | — |
| CLI | cli.test.ts (spawn) | — | — | — | Sonnet review at CP5 |
| MCP | mcp.test.ts (stdio JSON-RPC) | — | — | — | Sonnet review at CP5 |
| Budgets | — | check-budgets (build) | — | — | Lighthouse at RC1 |
| Mobile | — | — | 360/390 px overflow checks per page | yes | real phone at RC1 (owner) |
| Counters build | — | metrics checks in verify_debugkit | counters variant at RC1 | — | GoatCounter dashboard test (owner) |

**Gate commands:**
- `npm run check`: every commit.
- `npm run test:e2e`: tasks that say so, and every checkpoint.

**A test that is unavailable** must be reported honestly, with the alternative used (for example: "Playwright browsers not installed; ran unit and build only").
