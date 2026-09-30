# Security & privacy

## What this project promises

- Every tool runs in your browser. There is no backend that receives what you paste.
- The app page ships a Content-Security-Policy with `connect-src 'none'`, so the browser itself refuses any background request (fetch, XHR, beacons, WebSockets) from the page. You can verify this in DevTools → Network.
- If anonymous usage counters are enabled for a deployment, the only outbound requests are 1×1 image requests to GoatCounter carrying a fixed event name (for example `debug-analyze`). Your input, files, reports, headers, tokens or logs are never sent, stored or logged.
- Debug Report's redaction covers known secret formats and fields named like secrets. It can miss unusual secrets, so always review a report before sharing it.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** for this repository (Security tab → "Report a vulnerability"). Don't open a public issue for security problems.

Especially interesting reports include:
- any way for input to leave the browser;
- a redaction bypass where a known secret format survives into a report;
- XSS in any tool.

## Secrets in this repository

`scripts/verify_debugkit.ts` and `src/lib/debugkit/samples.ts` contain **deliberately fake** secrets. They are test fixtures that prove the redaction engine removes them. They are allow-listed in `.gitleaks.toml`, and every commit's full history is scanned by gitleaks in CI.
