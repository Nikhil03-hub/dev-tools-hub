# Task queue

**Rules:** see AGENTS.md §4.
- The implementer takes the first `READY` row whose dependencies are `DONE` or `ACCEPTED`, works it, and sets it to `DONE`.
- The reviewer sets `ACCEPTED`, `REJECTED` or `NEEDS_SPEC_UPDATE`, and inserts repair rows `R-…` directly under the checkpoint that found them.
- **CHECKPOINT** rows mean STOP. Their status starts as `PENDING`. The reviewer sets it to `PASSED`, and a task that depends on `CPn` may start only when that row says `PASSED`.

Status values: `READY` · `IN_PROGRESS` · `DONE` · `BLOCKED` · `ACCEPTED` · `REJECTED` · `NEEDS_SPEC_UPDATE`

| # | ID | Title | Spec | Depends on | Status |
|---|---|---|---|---|---|
| 1 | T-101 | Tooling and gates (no behaviour change) | tasks/P1_foundation.md | — | DONE |
| 2 | T-102 | Design tokens, light/dark/system theme | tasks/P1_foundation.md | T-101 | DONE |
| 3 | T-103 | Tool registry + lazy loading + keep-alive | tasks/P1_foundation.md | T-102 | DONE |
| 4 | T-104 | Multi-file build, path URLs, static SEO pages, V3 CSP | tasks/P1_foundation.md | T-103 | DONE |
| 5 | T-105 | App shell: sidebar, top bar, mobile drawer | tasks/P1_foundation.md | T-104 | DONE |
| 6 | T-106 | Home page with "Paste anything" detection | tasks/P1_foundation.md | T-105 | DONE |
| 7 | T-107 | Command palette v2 | tasks/P1_foundation.md | T-106 | DONE |
| 8 | T-108 | Tool page frame + shared components | tasks/P1_foundation.md | T-107 | DONE |
| 9 | T-109 | Accessibility gate + CP1 summary | tasks/P1_foundation.md | T-108 | DONE |
| 10 | T-110 | CodeMirror keyboard trap: Tab/Shift-Tab must escape the editor | reports/T-110-T-113.md | T-109 | DONE |
| 11 | T-111 | Editor focus ring: all four edges, pixel-verified | reports/T-110-T-113.md | T-110 | DONE |
| 12 | T-112 | Dark accent hover contrast pair (foreground vs background split) | reports/T-110-T-113.md | T-102 | DONE |
| 13 | T-113 | Palette focus return, drawer ARIA, axe + scroll coverage | reports/T-110-T-113.md | T-111 | DONE |
| 14 | T-114 | Rendered regex-highlight contrast (N-1) + rendered-state a11y gate | reports/T-114.md | T-113 | DONE |
| 15 | T-115 | CP1 closure: spec reconciliation, focus handoff, editor typography, test hardening | reports/CP1-closure.md | T-114 | DONE |
| 16 | **CP1** | **CHECKPOINT: STOP. Owner pushes `v3`, reviewer reviews P1** | REVIEW_PROTOCOL.md | T-109…T-115 | PENDING |
| 17 | T-201 | YAML ⇄ JSON | tasks/P2_tools.md | CP1 | READY |
| 18 | T-202 | Text diff | tasks/P2_tools.md | T-201 | READY |
| 19 | T-203 | cURL converter (redacting) | tasks/P2_tools.md | T-202 | READY |
| 20 | T-204 | URL parser + query editor | tasks/P2_tools.md | T-203 | READY |
| 21 | T-205 | Cron explainer | tasks/P2_tools.md | T-204 | READY |
| 22 | T-206 | CSV ⇄ JSON | tasks/P2_tools.md | T-205 | READY |
| 23 | **CP2** | **CHECKPOINT: STOP** | REVIEW_PROTOCOL.md | T-206 | PENDING |
| 24 | T-301 | Custom redaction policy (engine) | tasks/P3_differentiators.md | CP2 | READY |
| 25 | T-302 | Policy UI | tasks/P3_differentiators.md | T-301 | READY |
| 26 | T-303 | Secret Scanner tool | tasks/P3_differentiators.md | T-302 | READY |
| 27 | T-304 | Compare working vs failing request | tasks/P3_differentiators.md | T-303 | READY |
| 28 | T-305 | Review tab with local reveal | tasks/P3_differentiators.md | T-304 | READY |
| 29 | T-306 | Workers, agent/JSON formats, regex timeout | tasks/P3_differentiators.md | T-305 | READY |
| 30 | **CP3** | **CHECKPOINT: STOP (+ Sonnet security review)** | REVIEW_PROTOCOL.md | T-306 | PENDING |
| 31 | T-211 | Base64 / URL / UUID / Hash SEO pages | tasks/P2_tools.md (batch B) | CP3 | READY |
| 32 | T-212 | JSON → code (TS, Zod, Go, Python, Rust) | tasks/P2_tools.md (batch B) | CP3 | READY |
| 33 | T-213 | Number base converter | tasks/P2_tools.md (batch B) | CP3 | READY |
| 34 | T-214 | Color converter + contrast | tasks/P2_tools.md (batch B) | CP3 | READY |
| 35 | T-215 | Case converter + slugify | tasks/P2_tools.md (batch B) | CP3 | READY |
| 36 | T-216 | String escape/unescape | tasks/P2_tools.md (batch B) | CP3 | READY |
| 37 | T-217 | HMAC / SHA generator | tasks/P2_tools.md (batch B) | CP3 | READY |
| 38 | T-218 | Password & secret generator | tasks/P2_tools.md (batch B) | CP3 | READY |
| 39 | T-219 | QR code generator | tasks/P2_tools.md (batch B) | CP3 | READY |
| 40 | T-220 | Subnet / CIDR calculator | tasks/P2_tools.md (batch B) | CP3 | READY |
| 41 | T-221 | SQL formatter | tasks/P2_tools.md (batch B) | CP3 | READY |
| 42 | T-222 | Markdown preview (sanitized) | tasks/P2_tools.md (batch B) | CP3 | READY |
| 43 | T-223 | XML formatter | tasks/P2_tools.md (batch B) | CP3 | READY |
| 44 | T-224 | TOML ⇄ JSON | tasks/P2_tools.md (batch B) | CP3 | READY |
| 45 | T-225 | HTTP status codes reference | tasks/P2_tools.md (batch B) | CP3 | READY |
| 46 | T-226 | JWT encoder (test tokens) | tasks/P2_tools.md (batch B) | CP3 | READY |
| 47 | **CP4** | **CHECKPOINT: STOP** | REVIEW_PROTOCOL.md | T-211…T-226 | PENDING |
| 48 | T-401 | CLI build skeleton | tasks/P4_P6_cli_integrations_release.md | CP4 | READY |
| 49 | T-402 | CLI report + sanitize | tasks/P4_P6_cli_integrations_release.md | T-401 | READY |
| 50 | T-403 | CLI scan + compare | tasks/P4_P6_cli_integrations_release.md | T-402 | READY |
| 51 | T-404 | CLI policy file | tasks/P4_P6_cli_integrations_release.md | T-403 | READY |
| 52 | T-405 | MCP server | tasks/P4_P6_cli_integrations_release.md | T-404 + D-15 | NEEDS_SPEC_UPDATE |
| 53 | T-406 | /cli/ docs page | tasks/P4_P6_cli_integrations_release.md | T-405 | READY |
| 54 | **CP5** | **CHECKPOINT: STOP (+ Sonnet security review)** | REVIEW_PROTOCOL.md | T-406 | PENDING |
| 55 | T-501 | GitHub Action | tasks/P4_P6_cli_integrations_release.md | CP5 | READY |
| 56 | T-502 | Intake page template | tasks/P4_P6_cli_integrations_release.md | T-501 | READY |
| 57 | T-503 | Docs guides | tasks/P4_P6_cli_integrations_release.md | T-502 | READY |
| 58 | **CP6** | **CHECKPOINT: STOP** | REVIEW_PROTOCOL.md | T-503 | PENDING |
| 59 | T-601…T-605 | Release pass → RC1 | tasks/P4_P6_cli_integrations_release.md | CP6 (or the owner may pull RC1 forward after CP3) | READY |
