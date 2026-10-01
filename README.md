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
```

`dist/` contains `index.html`, `_headers`, `robots.txt` and `sitemap.xml`.

## Test

```bash
npm run verify:lib
npx vite preview --port 4173 &
PW_CHROMIUM=/opt/pw-browsers/chromium SHOT_DIR=/tmp/shots npm run test:e2e
```

## Deploy

Drag the **entire `dist/` folder** onto Netlify → Deploys. Never drag a single file, and never use the Netlify CLI (it returns a 403).

## Privacy & measurement

There is no application backend, and the page's Content-Security-Policy includes `connect-src 'none'`. The hosted deployment may enable anonymous counters: a fixed event name such as `debug-analyze`, sent as a 1×1 image request to GoatCounter.

Your input, files, reports, headers, tokens or logs are never sent, stored or logged; there are no cookies, and GoatCounter keeps only aggregate counts and doesn't store IP addresses. The only browser storage is a first-seen date used to count returning visits.

Counters are off unless a build sets `VITE_GC_CODE`.

To verify the application's network behavior, use a counters-off build and open DevTools → Network. See [SECURITY.md](SECURITY.md) for the full privacy promise and how to report a vulnerability.

## License

MIT — see [LICENSE](LICENSE).
