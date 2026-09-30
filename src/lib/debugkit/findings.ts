// Deterministic diagnosis rules for HTTP exchanges and JWTs.
//
// Every rule is a plain, testable condition on parsed data — no AI, no
// network. Evidence strings are passed through the SAME Redactor used for
// the sanitized output, so placeholders match and no raw secret appears.
//
// Labels: DETECTED = a rule matched on the data you pasted.
//         NOT_VERIFIED = we can show it but cannot confirm it (signatures,
//         whether aud/iss are what the server expects).

import { decodeJwt } from "../jwt";
import { getHeader, getHeaders } from "./parse";
import { isSecretKey, type Redactor } from "./redact";
import type { Exchange, Finding, JwtSummary, Severity } from "./types";

const JWT_RE = /eyJ[A-Za-z0-9_-]{2,}\.eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/;
const SAFE_CLAIMS = ["alg", "typ", "kid", "iss", "aud", "exp", "nbf", "iat", "scope", "scp", "token_use", "azp", "client_id"];

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export interface RefTime {
  ms: number;
  source: string;
}

/** Collects findings, merging repeats of the same rule on the same endpoint. */
export class FindingSet {
  private map = new Map<string, { f: Finding; seen: number[] }>();

  add(key: string, f: Finding, exchangeIndex?: number) {
    const cur = this.map.get(key);
    if (cur) {
      if (exchangeIndex !== undefined && !cur.seen.includes(exchangeIndex)) cur.seen.push(exchangeIndex);
      return;
    }
    this.map.set(key, { f, seen: exchangeIndex !== undefined ? [exchangeIndex] : [] });
  }

  list(): Finding[] {
    const out = [...this.map.values()].map(({ f, seen }) => {
      if (seen.length > 1) {
        const shown = seen.slice(0, 6).map((n) => `#${n}`).join(", ");
        const more = seen.length > 6 ? ` (+${seen.length - 6} more)` : "";
        return { ...f, evidence: [`Seen in ${seen.length} requests: ${shown}${more}`, ...f.evidence] };
      }
      return f;
    });
    return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }
}

function fmtDelta(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

function iso(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function endpoint(x: Exchange, r: Redactor): string {
  const noQuery = x.url.split("?")[0];
  return `${x.method || "?"} ${r.redactText(noQuery) || "(unknown URL)"}`.trim();
}

function exchangeRef(x: Exchange, fallback: RefTime): RefTime {
  const date = getHeader(x.responseHeaders, "date");
  if (date) {
    const ms = Date.parse(date);
    if (Number.isFinite(ms)) return { ms, source: `server "Date" header of request #${x.index}` };
  }
  if (x.startedAt) {
    const ms = Date.parse(x.startedAt);
    if (Number.isFinite(ms)) return { ms, source: `start time of request #${x.index} (HAR)` };
  }
  return fallback;
}

function excerpt(body: string | undefined, r: Redactor, max = 300): string | null {
  if (!body) return null;
  const one = r.redactText(body).replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

// ---------------- JWT ----------------

export function jwtSummary(placeholder: string, raw: string, r: Redactor): JwtSummary | null {
  const d = decodeJwt(raw);
  if (!d.ok) return null;
  const header = (d.data.header ?? {}) as Record<string, unknown>;
  const payload = (d.data.payload && typeof d.data.payload === "object" ? d.data.payload : {}) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  const withheld: string[] = [];
  for (const k of ["alg", "typ", "kid"]) if (k in header) safe[k] = header[k];
  for (const [k, v] of Object.entries(payload)) {
    if (SAFE_CLAIMS.includes(k)) safe[k] = typeof v === "string" ? r.redactText(v) : v;
    else withheld.push(k);
  }
  return { placeholder, alg: d.data.alg, safeClaims: safe, withheldClaimNames: withheld };
}

/** Time/alg checks for one token at one reference time. */
export function checkJwt(placeholder: string, raw: string, ref: RefTime, fs: FindingSet, context: string, exchangeIndex?: number) {
  const d = decodeJwt(raw);
  if (!d.ok) return;
  const payload = (d.data.payload && typeof d.data.payload === "object" ? d.data.payload : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof payload[k] === "number" && Number.isFinite(payload[k]) ? (payload[k] as number) : undefined);
  const exp = num("exp");
  const nbf = num("nbf");
  const iat = num("iat");
  const refLine = `Reference time: ${iso(ref.ms)} (${ref.source})`;

  if ((d.data.alg ?? "").toLowerCase() === "none") {
    fs.add(`jwt-alg-none:${placeholder}`, {
      id: "jwt-alg-none",
      severity: "high",
      label: "DETECTED",
      title: `${placeholder} is unsigned (alg: "none")`,
      why: "A token with alg \"none\" carries no signature. Servers must reject it; if one accepts it, anyone can forge tokens.",
      action: "Issue a properly signed token (e.g. RS256/ES256/HS256) and make sure the server rejects alg \"none\".",
      evidence: [`${placeholder} header alg = "none" ${context}`],
      ref: "https://datatracker.ietf.org/doc/html/rfc8725#section-3.1",
    });
  }
  if (exp !== undefined) {
    const delta = exp * 1000 - ref.ms;
    if (delta < 0) {
      fs.add(`jwt-expired:${placeholder}:${ref.source}`, {
        id: "jwt-expired",
        severity: "high",
        label: "DETECTED",
        title: `${placeholder} had already expired ${fmtDelta(delta)} before the reference time`,
        why: "Servers reject tokens whose exp (expiry) is in the past — a common cause of 401 responses.",
        action: "Get a fresh token (re-login or use the refresh-token flow), then retry. If it expires unexpectedly fast, check the issuer's token lifetime.",
        evidence: [`${placeholder} exp = ${exp} (${iso(exp * 1000)}) ${context}`, refLine],
        ref: "https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.4",
      }, exchangeIndex);
    } else if (delta < 60_000) {
      fs.add(`jwt-expiring:${placeholder}:${ref.source}`, {
        id: "jwt-expiring",
        severity: "low",
        label: "DETECTED",
        title: `${placeholder} expires ${fmtDelta(delta)} after the reference time`,
        why: "A token this close to expiry can fail mid-request or because of small clock differences between machines.",
        action: "Refresh tokens a little before they expire (e.g. 60 s early).",
        evidence: [`${placeholder} exp = ${iso(exp * 1000)} ${context}`, refLine],
      }, exchangeIndex);
    }
  } else {
    fs.add(`jwt-no-exp:${placeholder}`, {
      id: "jwt-no-exp",
      severity: "low",
      label: "DETECTED",
      title: `${placeholder} has no expiry (exp claim missing)`,
      why: "A token without exp never expires on its own; if it leaks, it stays usable until the signing key rotates.",
      action: "If you control the issuer, add a short exp. If not, treat this token as long-lived and protect it accordingly.",
      evidence: [`${placeholder} payload has no "exp" ${context}`],
      ref: "https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.4",
    });
  }
  if (nbf !== undefined && nbf * 1000 > ref.ms) {
    const delta = nbf * 1000 - ref.ms;
    fs.add(`jwt-nbf:${placeholder}:${ref.source}`, {
      id: "jwt-not-yet-valid",
      severity: "high",
      label: "DETECTED",
      title: `${placeholder} is not valid yet (nbf is ${fmtDelta(delta)} after the reference time)`,
      why: delta <= 300_000
        ? "A few minutes of difference usually means the clocks of the issuing server and the receiving server disagree (clock skew)."
        : "The server will reject the token until its nbf (not-before) time.",
      action: delta <= 300_000
        ? "Sync server clocks (NTP) or allow a small leeway (e.g. 60 s) when validating nbf/iat."
        : "Check why the issuer sets nbf in the future.",
      evidence: [`${placeholder} nbf = ${iso(nbf * 1000)} ${context}`, refLine],
      ref: "https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.5",
    }, exchangeIndex);
  }
  if (iat !== undefined && iat * 1000 > ref.ms + 60_000) {
    fs.add(`jwt-iat-future:${placeholder}:${ref.source}`, {
      id: "jwt-iat-future",
      severity: "medium",
      label: "DETECTED",
      title: `${placeholder} claims it was issued ${fmtDelta(iat * 1000 - ref.ms)} in the future`,
      why: "An issued-at time in the future points to clock skew between machines; strict validators reject such tokens.",
      action: "Sync clocks (NTP) on the issuer and the API server, or allow a small leeway.",
      evidence: [`${placeholder} iat = ${iso(iat * 1000)} ${context}`, refLine],
    }, exchangeIndex);
  }
}

// ---------------- HTTP ----------------

function parseAuthChallenge(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  const scheme = /^\s*([A-Za-z-]+)/.exec(v);
  if (scheme) out.scheme = scheme[1];
  const re = /([A-Za-z_]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) out[m[1].toLowerCase()] = m[2];
  return out;
}

function sameOrigin(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();
}

function splitList(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function checkExchange(x: Exchange, r: Redactor, fs: FindingSet, fallback: RefTime) {
  const ep = endpoint(x, r);
  const idx = x.index;
  const auth = getHeader(x.requestHeaders, "authorization");
  const cookie = getHeader(x.requestHeaders, "cookie");
  const origin = getHeader(x.requestHeaders, "origin");
  const secretHeader = x.requestHeaders.some((h) => h.name.toLowerCase() !== "authorization" && h.name.toLowerCase() !== "cookie" && isSecretKey(h.name));

  // JWTs sent with this request (Authorization header or URL).
  const ref = exchangeRef(x, fallback);
  const sentJwts: string[] = [];
  const authJwt = auth ? JWT_RE.exec(auth)?.[0] : undefined;
  if (authJwt) sentJwts.push(authJwt);
  const urlJwt = JWT_RE.exec(x.url)?.[0];
  if (urlJwt && urlJwt !== authJwt) sentJwts.push(urlJwt);
  for (const raw of sentJwts) {
    const ph = r.lookup("JWT", raw);
    checkJwt(ph, raw, ref, fs, `(sent with request #${idx})`, idx);
  }

  // ---- Request-side hygiene (works even without a response) ----
  if (/^http:\/\//i.test(x.url) && !/^http:\/\/(localhost|127\.|\[::1\])/i.test(x.url) && (auth || cookie)) {
    fs.add(`plain-http:${ep}`, {
      id: "plain-http-credentials",
      severity: "high",
      label: "DETECTED",
      title: "Credentials sent over plain HTTP (not HTTPS)",
      why: "Anyone on the network path can read an Authorization header or cookie sent without TLS.",
      action: "Use https:// for this endpoint and rotate any credential that was sent this way.",
      evidence: [`Request #${idx}: ${ep}`],
    }, idx);
  }
  const query = x.url.includes("?") ? x.url.slice(x.url.indexOf("?") + 1) : "";
  const secretParams = query
    .split("&")
    .map((p) => p.split("=")[0])
    .filter((n) => n && isSecretKey(decodeURIComponentSafe(n)));
  if (secretParams.length || urlJwt) {
    fs.add(`cred-in-url:${ep}`, {
      id: "credential-in-url",
      severity: "medium",
      label: "DETECTED",
      title: "A credential is sent in the URL",
      why: "URLs end up in server logs, browser history, proxies and Referer headers, so secrets in them leak easily.",
      action: "Send the credential in a header (e.g. Authorization) or the request body instead, and rotate it.",
      evidence: [`Request #${idx}: ${ep} — parameter(s): ${[...secretParams, ...(urlJwt ? ["(a JWT)"] : [])].join(", ")}`],
    }, idx);
  }
  if (auth && !/^\s*[A-Za-z-]+\s+\S/.test(auth) && JWT_RE.test(auth)) {
    fs.add(`auth-no-scheme:${ep}`, {
      id: "auth-missing-scheme",
      severity: "medium",
      label: "DETECTED",
      title: "Authorization header has a token but no scheme (\"Bearer \" is missing)",
      why: "Most APIs expect \"Authorization: Bearer <token>\". Without the scheme word the server usually ignores the header and answers 401.",
      action: "Send it as: Authorization: Bearer <token>",
      evidence: [`Request #${idx}: Authorization: ${r.redactText(auth)}`],
      ref: "https://datatracker.ietf.org/doc/html/rfc6750#section-2.1",
    }, idx);
  }

  // Set-Cookie problems
  for (const sc of getHeaders(x.responseHeaders, "set-cookie")) {
    const name = sc.split("=")[0].trim();
    const attrs = sc.toLowerCase();
    if (/samesite\s*=\s*none/.test(attrs) && !/;\s*secure(\s*;|\s*$)/.test(attrs)) {
      fs.add(`samesite-none:${name}`, {
        id: "cookie-samesite-none-insecure",
        severity: "high",
        label: "DETECTED",
        title: `Cookie "${name}" uses SameSite=None without Secure — browsers will reject it`,
        why: "Modern browsers drop SameSite=None cookies that are not also marked Secure, so the session silently never gets stored.",
        action: `Add "Secure" to the Set-Cookie for "${name}" (and serve over HTTPS).`,
        evidence: [`Request #${idx}: Set-Cookie: ${r.redactPair("set-cookie", sc)}`],
        ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value",
      }, idx);
    }
    if (/(sess|sid|auth|token|jwt)/i.test(name) && !/;\s*httponly/.test(attrs)) {
      fs.add(`cookie-no-httponly:${name}`, {
        id: "cookie-session-not-httponly",
        severity: "low",
        label: "DETECTED",
        title: `Session-like cookie "${name}" is not HttpOnly`,
        why: "Without HttpOnly, any injected JavaScript (XSS) can read this cookie and steal the session.",
        action: `Add "HttpOnly" to the Set-Cookie for "${name}" unless client-side JS truly needs to read it.`,
        evidence: [`Request #${idx}: Set-Cookie: ${r.redactPair("set-cookie", sc)}`],
      }, idx);
    }
  }

  // ---- CORS (only meaningful for browser requests that carry Origin) ----
  const acao = getHeader(x.responseHeaders, "access-control-allow-origin");
  const acac = getHeader(x.responseHeaders, "access-control-allow-credentials");
  const hasResponse = x.status !== undefined && x.status !== 0;
  if (origin && hasResponse) {
    const isPreflight = x.method === "OPTIONS" && !!getHeader(x.requestHeaders, "access-control-request-method");
    if (isPreflight && (x.status! < 200 || x.status! > 299)) {
      fs.add(`cors-preflight-status:${ep}`, {
        id: "cors-preflight-failed",
        severity: "high",
        label: "DETECTED",
        title: `CORS preflight (OPTIONS) failed with status ${x.status}`,
        why: "The browser asks permission with an OPTIONS request before the real one. If that answer isn't 2xx, the real request is never sent.",
        action: "Make the server answer OPTIONS for this path with 204/200 and the Access-Control-Allow-* headers — often an auth middleware wrongly requires a token on OPTIONS.",
        evidence: [`Request #${idx}: ${ep} → ${x.status}`],
        ref: "https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request",
      }, idx);
    }
    if (!acao) {
      fs.add(`cors-no-acao:${ep}`, {
        id: "cors-missing-allow-origin",
        severity: "high",
        label: "DETECTED",
        title: "Response has no Access-Control-Allow-Origin header — the browser will block it",
        why: `The page at ${origin} made a cross-origin request. Without this header the browser hides the response from your JavaScript (the classic "blocked by CORS policy" error).`,
        action: `Configure the API to return "Access-Control-Allow-Origin: ${origin}" for this route (on error responses too — many frameworks skip CORS headers on 4xx/5xx).`,
        evidence: [`Request #${idx}: ${ep} → ${x.status}`, `Request Origin: ${origin}`],
        ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMissingAllowOrigin",
      }, idx);
    } else {
      const values = acao.split(",").map((s) => s.trim()).filter(Boolean);
      if (values.length > 1) {
        fs.add(`cors-multi:${ep}`, {
          id: "cors-multiple-origins",
          severity: "high",
          label: "DETECTED",
          title: "Access-Control-Allow-Origin contains more than one origin",
          why: "The header may contain exactly one origin (or *). Browsers reject a list.",
          action: "Echo back only the single allowed origin that matches the request's Origin header.",
          evidence: [`Request #${idx}: Access-Control-Allow-Origin: ${acao}`],
          ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMultipleAllowOriginNotAllowed",
        }, idx);
      } else if (acao !== "*" && !sameOrigin(acao, origin)) {
        fs.add(`cors-mismatch:${ep}`, {
          id: "cors-origin-mismatch",
          severity: "high",
          label: "DETECTED",
          title: "Access-Control-Allow-Origin doesn't match the page's origin",
          why: "The browser only allows the response if the header equals the requesting origin exactly (scheme, host and port).",
          action: `Return "Access-Control-Allow-Origin: ${origin}" (check http vs https, www vs no-www, and the port).`,
          evidence: [`Request #${idx}: allowed = ${acao}`, `Request Origin: ${origin}`],
          ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSAllowOriginNotMatchingOrigin",
        }, idx);
      }
      if (acao === "*" && (acac ?? "").toLowerCase() === "true") {
        fs.add(`cors-star-creds:${ep}`, {
          id: "cors-wildcard-with-credentials",
          severity: "high",
          label: "DETECTED",
          title: "Access-Control-Allow-Origin: * cannot be combined with Allow-Credentials: true",
          why: "For credentialed requests (cookies or HTTP auth) browsers refuse the wildcard.",
          action: `Return the specific origin (${origin}) instead of *, plus "Vary: Origin".`,
          evidence: [`Request #${idx}: Access-Control-Allow-Origin: * and Access-Control-Allow-Credentials: true`],
          ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials",
        }, idx);
      } else if (acao === "*" && cookie) {
        fs.add(`cors-star-cookie:${ep}`, {
          id: "cors-wildcard-cookie",
          severity: "medium",
          label: "DETECTED",
          title: "Request sends cookies, but the response allows origin * — credentialed calls will fail",
          why: "If your frontend uses credentials: \"include\" (needed to send cookies cross-origin), the browser rejects a * origin.",
          action: `Return "Access-Control-Allow-Origin: ${origin}" and "Access-Control-Allow-Credentials: true".`,
          evidence: [`Request #${idx}: ${ep}`],
        }, idx);
      }
    }
    if (isPreflight) {
      const wantMethod = (getHeader(x.requestHeaders, "access-control-request-method") ?? "").toUpperCase();
      const allowMethods = splitList(getHeader(x.responseHeaders, "access-control-allow-methods")).map((m) => m.toUpperCase());
      const simple = ["GET", "HEAD", "POST"];
      if (wantMethod && !simple.includes(wantMethod) && allowMethods.length && !allowMethods.includes(wantMethod) && !allowMethods.includes("*")) {
        fs.add(`cors-method:${ep}`, {
          id: "cors-method-not-allowed",
          severity: "high",
          label: "DETECTED",
          title: `CORS preflight doesn't allow method ${wantMethod}`,
          why: "The browser asked whether it may send this method; the server's Access-Control-Allow-Methods doesn't include it.",
          action: `Add ${wantMethod} to Access-Control-Allow-Methods for this route.`,
          evidence: [`Request #${idx}: requested ${wantMethod}; allowed: ${allowMethods.join(", ")}`],
          ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMethodNotFound",
        }, idx);
      }
      const wantHeaders = splitList(getHeader(x.requestHeaders, "access-control-request-headers"));
      const allowHeaders = splitList(getHeader(x.responseHeaders, "access-control-allow-headers"));
      const star = allowHeaders.includes("*") && (acac ?? "").toLowerCase() !== "true";
      const missing = wantHeaders.filter((h) => !allowHeaders.includes(h) && !(star && h !== "authorization"));
      if (missing.length) {
        fs.add(`cors-headers:${ep}`, {
          id: "cors-header-not-allowed",
          severity: "high",
          label: "DETECTED",
          title: `CORS preflight doesn't allow request header(s): ${missing.join(", ")}`,
          why: "The browser will not send the real request because the server didn't list these headers in Access-Control-Allow-Headers. (Authorization is never covered by the * wildcard.)",
          action: `Add ${missing.join(", ")} to Access-Control-Allow-Headers for this route.`,
          evidence: [`Request #${idx}: requested headers: ${wantHeaders.join(", ")}`, `Allowed: ${allowHeaders.join(", ") || "(none)"}`],
          ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMissingAllowHeaderFromPreflight",
        }, idx);
      }
    }
  }

  // ---- Status-code diagnosis ----
  if (x.source === "har" && (x.status === 0 || x.status === undefined)) {
    fs.add(`status0:${ep}`, {
      id: "no-response",
      severity: "medium",
      label: "DETECTED",
      title: "No response was received (status 0)",
      why: "The browser never got a readable answer. Usual causes: the request was blocked by CORS, a network/DNS/TLS failure, an ad-blocker or extension, or the page navigated away and cancelled it.",
      action: "Check the browser console for the exact error message next to this request; if it mentions CORS, see the CORS findings.",
      evidence: [`Request #${idx}: ${ep}`],
    }, idx);
    return;
  }
  if (x.status === undefined) return;
  const s = x.status;
  const body = excerpt(x.responseBody, r);
  const bodyLine = body ? [`Response body starts: ${body}`] : [];

  if (s === 401) {
    const www = getHeader(x.responseHeaders, "www-authenticate");
    const ch = www ? parseAuthChallenge(www) : {};
    const noCreds = !auth && !cookie && !secretHeader;
    fs.add(`401:${ep}`, {
      id: "http-401",
      severity: "high",
      label: "DETECTED",
      title: noCreds ? "401 Unauthorized — and no credentials were sent" : "401 Unauthorized — the server did not accept the credentials",
      why: noCreds
        ? "The request carried no Authorization header, cookie or API-key header, so the server had nothing to authenticate."
        : "The server received credentials but rejected them: typically an expired/invalid token, wrong audience/issuer, wrong environment (staging token on production), or a revoked key.",
      action: noCreds
        ? "Attach the credential the API expects (e.g. Authorization: Bearer <token>). If you use fetch with cookies, set credentials: \"include\"."
        : "Check the JWT findings above (expiry, clock skew), confirm the token was issued for THIS API/environment, then retry with a fresh token.",
      evidence: [
        `Request #${idx}: ${ep} → 401`,
        ...(www ? [`WWW-Authenticate: ${r.redactText(www)}`] : []),
        ...(ch.error ? [`Server error code: ${ch.error}${ch.error_description ? ` — "${r.redactText(ch.error_description)}"` : ""}`] : []),
        ...bodyLine,
      ],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401",
    }, idx);
  } else if (s === 403) {
    const csrfHint = cookie && !["GET", "HEAD", "OPTIONS"].includes(x.method) && !x.requestHeaders.some((h) => /csrf|xsrf/i.test(h.name));
    fs.add(`403:${ep}`, {
      id: "http-403",
      severity: "medium",
      label: "DETECTED",
      title: "403 Forbidden — you are identified, but not allowed to do this",
      why: csrfHint
        ? "This cookie-authenticated, state-changing request has no CSRF token header — many frameworks answer 403 for that."
        : "Authentication worked, but the account/token lacks the permission, role or scope this endpoint requires (or an IP/WAF rule blocked it).",
      action: csrfHint
        ? "Send the CSRF token your framework expects (e.g. X-CSRF-Token / X-XSRF-TOKEN header), or check the permission for this action."
        : "Compare the token's scopes/roles (see JWT claims) with what this endpoint requires; check WAF/IP allow-lists if the body looks like a firewall page.",
      evidence: [`Request #${idx}: ${ep} → 403`, ...bodyLine],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403",
    }, idx);
  } else if (s === 405) {
    const allow = getHeader(x.responseHeaders, "allow");
    fs.add(`405:${ep}`, {
      id: "http-405",
      severity: "medium",
      label: "DETECTED",
      title: `405 Method Not Allowed — ${x.method || "this method"} isn't accepted here`,
      why: "The URL exists, but not for this HTTP method.",
      action: allow ? `Use one of the allowed methods: ${allow}.` : "Check the API docs for the correct method (GET/POST/PUT/PATCH/DELETE) for this path.",
      evidence: [`Request #${idx}: ${ep} → 405`, ...(allow ? [`Allow: ${allow}`] : [])],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405",
    }, idx);
  } else if (s === 415) {
    const ct = getHeader(x.requestHeaders, "content-type");
    fs.add(`415:${ep}`, {
      id: "http-415",
      severity: "medium",
      label: "DETECTED",
      title: "415 Unsupported Media Type — the server can't read this body format",
      why: "The Content-Type of the request doesn't match what the endpoint accepts.",
      action: ct ? `You sent Content-Type: ${ct}. Send the format the API expects (often application/json) and a body that matches it.` : "No Content-Type was sent. Add the one the API expects (often Content-Type: application/json).",
      evidence: [`Request #${idx}: ${ep} → 415`],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/415",
    }, idx);
  } else if (s === 429) {
    const ra = getHeader(x.responseHeaders, "retry-after");
    const rem = getHeader(x.responseHeaders, "x-ratelimit-remaining");
    fs.add(`429:${ep}`, {
      id: "http-429",
      severity: "medium",
      label: "DETECTED",
      title: "429 Too Many Requests — you hit a rate limit",
      why: "The API is throttling this client/key/IP.",
      action: ra ? `Wait before retrying — the server asked for Retry-After: ${ra}. Add exponential backoff.` : "Retry with exponential backoff and check the API's documented rate limits.",
      evidence: [`Request #${idx}: ${ep} → 429`, ...(ra ? [`Retry-After: ${ra}`] : []), ...(rem ? [`X-RateLimit-Remaining: ${rem}`] : [])],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429",
    }, idx);
  } else if (s === 400 || s === 422) {
    fs.add(`${s}:${ep}`, {
      id: `http-${s}`,
      severity: "medium",
      label: "DETECTED",
      title: `${s} ${s === 400 ? "Bad Request" : "Unprocessable Content"} — the server rejected the request data`,
      why: "The body, query or headers failed the server's validation. The response body usually names the field.",
      action: "Read the error message in the response body and fix the named field/format.",
      evidence: [`Request #${idx}: ${ep} → ${s}`, ...bodyLine],
      ref: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/${s}`,
    }, idx);
  } else if (s === 404) {
    fs.add(`404:${ep}`, {
      id: "http-404",
      severity: "low",
      label: "DETECTED",
      title: "404 Not Found",
      why: "No resource at this URL — often a typo, wrong base URL/environment, missing API version prefix, or an ID that doesn't exist.",
      action: "Compare the path with the API docs (version prefix, trailing slash, environment base URL).",
      evidence: [`Request #${idx}: ${ep} → 404`, ...bodyLine],
      ref: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404",
    }, idx);
  } else if (s === 408 || s === 504) {
    fs.add(`${s}:${ep}`, {
      id: `http-${s}`,
      severity: "medium",
      label: "DETECTED",
      title: `${s} — the request timed out`,
      why: s === 504 ? "A gateway/proxy gave up waiting for the upstream server." : "The server gave up waiting for the client to finish the request.",
      action: "Check upstream health and timeouts; retry idempotent requests with backoff.",
      evidence: [`Request #${idx}: ${ep} → ${s}`, ...(x.timeMs !== undefined ? [`Time: ${Math.round(x.timeMs)} ms`] : [])],
    }, idx);
  } else if (s >= 500) {
    fs.add(`5xx:${s}:${ep}`, {
      id: "http-5xx",
      severity: "high",
      label: "DETECTED",
      title: `${s} ${x.statusText || "Server Error"} — the failure happened on the server`,
      why: "5xx means the server (or a proxy in front of it) failed while handling the request. Your request may be valid.",
      action: "Look up the server logs around this time (use any request/correlation ID from the response headers).",
      evidence: [
        `Request #${idx}: ${ep} → ${s}`,
        ...["x-request-id", "x-correlation-id", "x-amzn-requestid", "cf-ray", "traceparent"]
          .map((h) => (getHeader(x.responseHeaders, h) ? `${h}: ${r.redactText(getHeader(x.responseHeaders, h)!)}` : ""))
          .filter(Boolean),
        ...bodyLine,
      ],
    }, idx);
  } else if ([301, 302, 303, 307, 308].includes(s) && (auth || cookie)) {
    const loc = getHeader(x.responseHeaders, "location");
    if (loc && /^https?:\/\//i.test(loc) && /^https?:\/\//i.test(x.url)) {
      try {
        const a = new URL(x.url);
        const b = new URL(loc);
        if (a.host !== b.host) {
          fs.add(`redirect-host:${ep}`, {
            id: "redirect-drops-auth",
            severity: "low",
            label: "DETECTED",
            title: `${s} redirect to a different host — the Authorization header will be dropped`,
            why: "Browsers, fetch and cURL (-L) strip Authorization when a redirect crosses to another host, so the next request arrives without credentials.",
            action: "Call the final URL directly (fix the base URL), rather than relying on the redirect.",
            evidence: [`Request #${idx}: ${ep} → ${s}`, `Location host: ${r.redactText(b.host)}`],
          }, idx);
        }
      } catch {
        /* unparsable URL: skip */
      }
    }
  }
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
