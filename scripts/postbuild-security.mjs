// Post-build security step for the single-file build.
// Run automatically by `npm run build` (see package.json "build").
//
// What it does (deterministic — same dist in, same dist out):
//  1. Computes a SHA-256 hash of every inline <script> in dist/index.html.
//  2. Injects a Content-Security-Policy <meta> tag right after <meta charset>.
//     connect-src 'none' makes it IMPOSSIBLE for the page to send data with
//     fetch/XHR/WebSocket/sendBeacon — the browser enforces our privacy claim.
//  3. Writes dist/_headers so Netlify serves the same CSP (+ frame-ancestors,
//     which only works as a real header) and the other security headers.
//     IMPORTANT: deploy the whole dist/ FOLDER, not just index.html, or
//     _headers is lost (that is exactly why V1's headers were never live).
//
// Env:
//   GC_CODE=<goatcounter code>  (optional) allows ONLY the anonymous counter
//   pixel host in img-src. Leave unset for a build with zero outbound traffic.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const file = "dist/index.html";
let html = readFileSync(file, "utf8");

if (html.includes('http-equiv="Content-Security-Policy"')) {
  console.error("postbuild-security: CSP meta already present — refusing to inject twice.");
  process.exit(1);
}

const hashes = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  hashes.push(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
}
if (hashes.length === 0) {
  console.error("postbuild-security: no inline scripts found — unexpected for a single-file build.");
  process.exit(1);
}

const gc = (process.env.GC_CODE || "").trim();
if (gc && !/^[a-z0-9-]{2,40}$/.test(gc)) {
  console.error("postbuild-security: GC_CODE must be a goatcounter site code (a-z, 0-9, -).");
  process.exit(1);
}
const imgSrc = ["'self'", "data:", "blob:", ...(gc ? [`https://${gc}.goatcounter.com`] : [])].join(" ");

// 'unsafe-eval' is required by Ajv (JSON Workbench → Schema check compiles
// schemas with new Function). connect-src stays 'none', so even eval'd code
// cannot send anything anywhere.
const directives = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")} 'unsafe-eval'`,
  "style-src 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
];
const metaCsp = directives.join("; ");
html = html.replace(/(<meta charset="UTF-8"\s*\/?>)/i, `$1\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`);
if (!html.includes('http-equiv="Content-Security-Policy"')) {
  console.error("postbuild-security: could not find <meta charset> to anchor the CSP tag.");
  process.exit(1);
}
writeFileSync(file, html);

// The CSP header is attached ONLY to the app page. Netlify combines values
// when several rules match the same path, and two CSP values would become
// two policies — so "/*" carries only the non-CSP headers. The static
// waitlist pages in public/ carry their own <meta> CSP.
const headerCsp = `${metaCsp}; frame-ancestors 'none'`;
const headers = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/
  Content-Security-Policy: ${headerCsp}

/index.html
  Content-Security-Policy: ${headerCsp}
`;
writeFileSync("dist/_headers", headers);
console.log(`postbuild-security: CSP injected (${hashes.length} script hash${hashes.length === 1 ? "" : "es"}${gc ? `, counter host ${gc}.goatcounter.com` : ", no counter"}); dist/_headers written.`);
