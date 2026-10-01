# Dev Tools Hub

Dev Tools Hub — privacy-first developer tools that run entirely in the browser. New: **Debug Report** — paste a failing request, HAR file or log and get the likely cause plus a redacted, share-ready report.

## Tools

- **Debug Report** — paste a cURL command, raw HTTP request/response, HAR file, JWT, .env or log. It explains likely causes (expired or not-yet-valid JWTs, 401/403, CORS preflight problems, cookie issues, credentials in URLs, root exceptions in logs) with evidence, redacts secrets with consistent placeholders, and formats a report for an AI chat, a GitHub issue or a support ticket. Try it: https://json-workbench.netlify.app/#debug
- **JSON Workbench** — format, validate, tree view, diff, schema check and TypeScript generation.
- **JWT Decoder** — decode and inspect JSON Web Tokens locally.
- **Regex Tester** — test regular expressions with live match highlighting.
- **Timestamp Converter** — convert between Unix timestamps and human-readable dates.
- **Generators** — Base64, URL encode/decode, UUID and hash utilities.

## Privacy

There is no application backend. Every tool runs in your browser. The page's Content-Security-Policy includes `connect-src 'none'`, so the browser itself refuses arbitrary background requests such as fetch, XHR, beacons or WebSockets.

The hosted deployment may enable anonymous usage counters through GoatCounter. These are limited to fixed event names sent as 1×1 image requests; they do not receive your input, files, reports, headers, tokens or logs.

To verify the application's network behavior, use a counters-off build and open DevTools → Network. The application should make no requests after load.

## Build

```bash
npm ci
npm run build
