# Dev Tools Hub

Dev Tools Hub — privacy-first developer tools (JSON, JWT, Regex, Timestamp, Base64/URL/UUID/Hash) that run entirely in the browser.

## Tools

- **JSON Workbench** — format, validate, tree view, diff, schema check and TypeScript generation.
- **JWT Decoder** — decode and inspect JSON Web Tokens locally.
- **Regex Tester** — test regular expressions with live match highlighting.
- **Timestamp Converter** — convert between Unix timestamps and human-readable dates.
- **Generators** — Base64, URL encode/decode, UUID and hash utilities.

## Privacy

There is no backend. Every tool runs in your browser. The page's Content-Security-Policy includes `connect-src 'none'`, so the browser itself refuses any background request (fetch, XHR, beacons, WebSockets) from the page. To verify it: open DevTools → Network, use every tool, and confirm zero requests after load.

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

There is no backend, and the page's Content-Security-Policy includes `connect-src 'none'`. The hosted deployment may enable anonymous counters: a fixed event name such as `debug-analyze`, sent as a 1×1 image request to GoatCounter. Your input, files, reports, headers, tokens or logs are never sent, stored or logged; there are no cookies, and GoatCounter keeps only aggregate counts and doesn't store IP addresses. The only browser storage is a first-seen date used to count returning visits. Counters are off unless a build sets `VITE_GC_CODE`. Verify everything in DevTools → Network. See [SECURITY.md](SECURITY.md) for the full promise and how to report a vulnerability.

## License

MIT — see [LICENSE](LICENSE).
