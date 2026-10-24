// V3 version of scripts/postbuild-security.mjs (T-104 copies this file over
// the old one). Injects the CSP <meta> into every app HTML page in dist/ and
// writes dist/_headers. See ARCHITECTURE.md §6.2.
//
// Why each piece exists:
//  - connect-src 'none' makes it IMPOSSIBLE for the page to send data with
//    fetch/XHR/beacon/WebSocket — the core privacy guarantee. Never change it.
//  - script-src 'self': V3 ships code as same-origin files; inline scripts
//    are forbidden (the build fails if one appears in an app page).
//  - 'unsafe-eval' only because Ajv compiles JSON Schemas with new Function.
//  - img-src may add the GoatCounter pixel host when VITE_GC_CODE is set.
//  - The waitlist pages carry their own CSP (form-action 'self'), so the CSP
//    header is attached per page — never to "/*", because Netlify merges
//    matching rules and two CSPs would both apply.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST = "dist";
const gc = /^[a-z0-9-]{2,40}$/.test(process.env.VITE_GC_CODE ?? "") ? process.env.VITE_GC_CODE : "";

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const imgSrc = ["'self'", "data:", "blob:", ...(gc ? [`https://${gc}.goatcounter.com`] : [])].join(" ");
const directives = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
];
const metaCsp = directives.join("; ");
const headerCsp = `${metaCsp}; frame-ancestors 'none'`;

const appPages = [];
for (const file of htmlFiles(DIST)) {
  const rel = relative(DIST, file).split(sep).join("/");
  if (/^waitlist(-thanks)?\.html$/.test(rel)) continue; // own CSP, untouched
  let html = readFileSync(file, "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    console.error(`postbuild-security: inline <script> found in ${rel}. V3 forbids inline scripts.`);
    process.exit(1);
  }
  if (/<meta[^>]+http-equiv="Content-Security-Policy"/i.test(html)) {
    html = html.replace(/\s*<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i, "");
  }
  const anchored = html.replace(/(<meta charset="UTF-8"\s*\/?>)/i, `$1\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`);
  if (anchored === html) {
    console.error(`postbuild-security: could not find <meta charset> in ${rel}.`);
    process.exit(1);
  }
  writeFileSync(file, anchored);
  appPages.push(rel);
}

// URL paths for each app page: "index.html" → "/" and "/index.html";
// "jwt-decoder/index.html" → "/jwt-decoder/" and "/jwt-decoder/index.html"; "404.html" → "/404.html".
const paths = [];
for (const rel of appPages.sort()) {
  if (rel === "index.html") paths.push("/", "/index.html");
  else if (rel.endsWith("/index.html")) {
    const dir = rel.slice(0, -"index.html".length);
    paths.push(`/${dir}`, `/${rel}`);
  } else paths.push(`/${rel}`);
}

const blocks = [
  `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin`,
  `/assets/*
  Cache-Control: public, max-age=31536000, immutable`,
  ...paths.map((p) => `${p}\n  Content-Security-Policy: ${headerCsp}`),
];
writeFileSync(join(DIST, "_headers"), blocks.join("\n\n") + "\n");
console.log(
  `postbuild-security: CSP injected into ${appPages.length} pages${gc ? `, counter host ${gc}.goatcounter.com` : ", no counter"}; dist/_headers has ${paths.length} CSP paths.`,
);
