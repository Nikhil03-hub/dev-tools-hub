// Input understanding for the Debug Report: split one pasted blob into
// typed segments (HAR, JSON, cURL, raw HTTP request/response, JWT, env,
// log), and normalise every HTTP-shaped thing into an Exchange.
//
// Never throws on user input. Anything we cannot parse stays as a "log"
// segment, so it is still redacted and still shown.

import type { Exchange, HeaderPair, Segment, SegmentKind } from "./types";

const KNOWN_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language", "access-control-allow-origin",
  "access-control-allow-credentials", "access-control-allow-headers", "access-control-allow-methods",
  "access-control-expose-headers", "access-control-max-age", "access-control-request-headers",
  "access-control-request-method", "age", "allow", "authorization", "cache-control", "connection",
  "content-encoding", "content-length", "content-type", "content-security-policy", "content-disposition",
  "cookie", "date", "etag", "expires", "host", "if-none-match", "if-modified-since", "last-modified",
  "location", "origin", "pragma", "referer", "referrer-policy", "retry-after", "server", "set-cookie",
  "strict-transport-security", "user-agent", "vary", "via", "www-authenticate", "x-content-type-options",
  "x-frame-options", "x-powered-by", "x-request-id", "x-correlation-id", "x-forwarded-for", "sec-fetch-mode",
  "sec-fetch-site", "sec-fetch-dest", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "priority",
  ":authority", ":method", ":path", ":scheme", ":status", "x-api-key", "transfer-encoding", "keep-alive",
  "upgrade-insecure-requests", "dnt", "x-amzn-requestid", "cf-ray", "x-ratelimit-remaining", "x-ratelimit-limit",
]);
const RESPONSE_ONLY = /^(access-control-allow-|access-control-expose-|access-control-max-age|set-cookie|www-authenticate|server|x-powered-by|:status|retry-after|etag|last-modified|age|cf-ray|x-ratelimit-)/i;
const REQUEST_ONLY = /^(origin|cookie|authorization|user-agent|accept|host|:method|:path|:authority|sec-fetch-|referer|access-control-request-|if-none-match|upgrade-insecure-requests)/i;

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT";
const RE_REQUEST_LINE = new RegExp(`^(${METHODS})\\s+(\\S+)(?:\\s+HTTP\\/[\\d.]+)?\\s*$`);
const RE_STATUS_LINE = /^HTTP\/[\d.]+\s+(\d{3})(?:\s+(.*))?$/;
const RE_CURL_START = /^\s*(?:\$\s*)?curl(?:\.exe)?\s/i;
const RE_JWT_ONLY = /^\s*(?:(?:authorization:\s*)?bearer\s+)?eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\s*$/i;
const RE_HEADER_LINE = /^(:?[A-Za-z][A-Za-z0-9-]*):[ \t]?(.*)$/;
const RE_ENV_LINE = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=/;

export function isHarObject(v: unknown): v is { log: { entries: unknown[] } } {
  if (!v || typeof v !== "object") return false;
  const log = (v as Record<string, unknown>).log;
  return !!log && typeof log === "object" && Array.isArray((log as Record<string, unknown>).entries);
}

function headerName(line: string): string | null {
  const m = RE_HEADER_LINE.exec(line);
  return m ? m[1].toLowerCase() : null;
}

function isKnownHeaderLine(line: string): boolean {
  const n = headerName(line);
  return !!n && KNOWN_HEADERS.has(n);
}

/** Split a pasted blob into typed segments. */
export function splitSegments(input: string): Segment[] {
  const trimmed = input.trim();
  if (trimmed === "") return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return [{ kind: isHarObject(parsed) ? "har" : "json", text: trimmed, startLine: 1 }];
    } catch {
      // not whole-JSON; fall through to line-based splitting
    }
  }

  const lines = input.split(/\r?\n/);
  const segs: Segment[] = [];
  let textStart = -1;
  let textLines: string[] = [];

  const flushText = () => {
    if (textLines.some((l) => l.trim() !== "")) {
      segs.push({ kind: classifyText(textLines), text: textLines.join("\n"), startLine: textStart + 1 });
    }
    textLines = [];
    textStart = -1;
  };
  const isMarker = (l: string) =>
    RE_CURL_START.test(l) || RE_REQUEST_LINE.test(l.trim()) || RE_STATUS_LINE.test(l.trim()) || RE_JWT_ONLY.test(l);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (RE_CURL_START.test(line)) {
      flushText();
      let j = i + 1;
      while (j < lines.length && (/[\\^`]\s*$/.test(lines[j - 1]) || /^\s+-{1,2}[A-Za-z]/.test(lines[j]))) j++;
      segs.push({ kind: "curl", text: lines.slice(i, j).join("\n"), startLine: i + 1 });
      i = j;
      continue;
    }

    if (RE_REQUEST_LINE.test(t) || RE_STATUS_LINE.test(t)) {
      flushText();
      const kind: SegmentKind = RE_STATUS_LINE.test(t) ? "http-response" : "http-request";
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "" && RE_HEADER_LINE.test(lines[j])) j++;
      // optional body: after one blank line, until the next marker
      if (j < lines.length && lines[j].trim() === "") {
        let k = j + 1;
        while (k < lines.length && !isMarker(lines[k])) k++;
        if (lines.slice(j + 1, k).some((l) => l.trim() !== "")) j = k;
      }
      segs.push({ kind, text: lines.slice(i, j).join("\n"), startLine: i + 1 });
      i = j;
      continue;
    }

    if (RE_JWT_ONLY.test(line)) {
      flushText();
      segs.push({ kind: "jwt", text: line.trim(), startLine: i + 1 });
      i++;
      continue;
    }

    // A header-only block (e.g. DevTools "Copy response headers"): at least
    // two consecutive header lines, at least two of them well-known names.
    if (RE_HEADER_LINE.test(line)) {
      let j = i;
      let known = 0;
      while (j < lines.length && RE_HEADER_LINE.test(lines[j]) && lines[j].trim() !== "") {
        if (isKnownHeaderLine(lines[j])) known++;
        j++;
      }
      if (j - i >= 2 && known >= 2) {
        flushText();
        const block = lines.slice(i, j);
        segs.push({ kind: guessHeaderDirection(block), text: block.join("\n"), startLine: i + 1 });
        i = j;
        continue;
      }
    }

    if (textStart < 0) textStart = i;
    textLines.push(line);
    i++;
  }
  flushText();
  return segs;
}

function classifyText(lines: string[]): SegmentKind {
  const meaningful = lines.filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  if (meaningful.length === 0) return "log";
  const envLike = meaningful.filter((l) => RE_ENV_LINE.test(l)).length;
  return envLike / meaningful.length >= 0.6 ? "env" : "log";
}

function guessHeaderDirection(block: string[]): SegmentKind {
  let resp = 0;
  let req = 0;
  for (const l of block) {
    const n = headerName(l);
    if (!n) continue;
    if (RESPONSE_ONLY.test(n)) resp++;
    else if (REQUEST_ONLY.test(n)) req++;
  }
  return req > resp ? "http-request" : "http-response";
}

function parseHeaderLines(lines: string[]): HeaderPair[] {
  const out: HeaderPair[] = [];
  for (const l of lines) {
    const m = RE_HEADER_LINE.exec(l);
    if (m) out.push({ name: m[1], value: m[2].trim() });
  }
  return out;
}

export function getHeader(headers: HeaderPair[], name: string): string | undefined {
  const n = name.toLowerCase();
  const h = headers.find((x) => x.name.toLowerCase() === n);
  return h ? h.value : undefined;
}

export function getHeaders(headers: HeaderPair[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((x) => x.name.toLowerCase() === n).map((x) => x.value);
}

/** Parse a raw HTTP request or response segment (start line optional). */
export function parseHttpSegment(seg: Segment, index: number): Partial<Exchange> {
  const lines = seg.text.split(/\r?\n/);
  const first = lines[0].trim();
  let headerStart = 0;
  let method: string | undefined;
  let target: string | undefined;
  let status: number | undefined;
  let statusText: string | undefined;
  const req = RE_REQUEST_LINE.exec(first);
  const st = RE_STATUS_LINE.exec(first);
  if (req) {
    method = req[1];
    target = req[2];
    headerStart = 1;
  } else if (st) {
    status = Number(st[1]);
    statusText = st[2]?.trim() || undefined;
    headerStart = 1;
  }
  let end = headerStart;
  while (end < lines.length && lines[end].trim() !== "") end++;
  const headers = parseHeaderLines(lines.slice(headerStart, end));
  const body = lines.slice(end + 1).join("\n").trim() || undefined;

  // HTTP/2 pseudo-headers from DevTools copies
  const pStatus = getHeader(headers, ":status");
  if (status === undefined && pStatus && /^\d{3}$/.test(pStatus)) status = Number(pStatus);
  method = method ?? getHeader(headers, ":method");
  target = target ?? getHeader(headers, ":path");
  const clean = headers.filter((h) => !h.name.startsWith(":"));

  if (seg.kind === "http-response") {
    return { source: "http", status, statusText, responseHeaders: clean, responseBody: body, index };
  }
  const host = getHeader(headers, "host") ?? getHeader(headers, ":authority");
  const scheme = getHeader(headers, ":scheme");
  let url = target ?? "";
  if (url.startsWith("/") && host) url = `${scheme ? `${scheme}://` : ""}${host}${url}`;
  return { source: "http", method: method ?? "GET", url, requestHeaders: clean, requestBody: body, index };
}

// ---------------- cURL ----------------

/** Tokenise a bash- or cmd-style cURL command line into argv. */
export function tokenizeShell(input: string): string[] {
  let s = input;
  const cmdStyle = /\^"/.test(s);
  s = s.replace(/\\\r?\n/g, " ").replace(/`\r?\n/g, " ");
  if (cmdStyle) {
    s = s.replace(/\^\r?\n/g, " ");
    s = s.replace(/\^(.)/g, "$1");
  }
  s = s.replace(/^\s*\$\s*/, "");
  const out: string[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (has) {
        out.push(cur);
        cur = "";
        has = false;
      }
      i++;
      continue;
    }
    has = true;
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      cur += j < 0 ? s.slice(i + 1) : s.slice(i + 1, j);
      i = j < 0 ? s.length : j + 1;
      continue;
    }
    if (c === "$" && s[i + 1] === "'") {
      i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === "\\" && i + 1 < s.length) {
          const n = s[i + 1];
          const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', "0": "\0" };
          if (n === "x" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
            cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16));
            i += 4;
            continue;
          }
          if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
            cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
            i += 6;
            continue;
          }
          cur += map[n] ?? n;
          i += 2;
          continue;
        }
        cur += s[i];
        i++;
      }
      i++;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && /["\\$`]/.test(s[i + 1])) {
          cur += s[i + 1];
          i += 2;
          continue;
        }
        cur += s[i];
        i++;
      }
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
      continue;
    }
    cur += c;
    i++;
  }
  if (has) out.push(cur);
  return out;
}

const CURL_VALUE_OPTS = new Set([
  "-o", "--output", "-m", "--max-time", "--connect-timeout", "-x", "--proxy", "--cacert", "--cert", "--key",
  "-w", "--write-out", "--resolve", "--retry", "-T", "--upload-file", "-r", "--range", "-z", "-K", "--config",
  "--limit-rate", "-c", "--cookie-jar", "--proxy-user", "-U", "--interface", "--local-port", "--max-redirs",
  "--retry-delay", "--retry-max-time", "--capath", "--pinnedpubkey", "--ciphers", "--oauth2-bearer",
]);

export function parseCurl(text: string, index: number): { exchange: Partial<Exchange>; notes: string[] } {
  const argv = tokenizeShell(text);
  const notes: string[] = [];
  let method: string | undefined;
  let url: string | undefined;
  const headers: HeaderPair[] = [];
  const data: string[] = [];
  let getMode = false;
  let i = argv.length > 0 && /^curl(\.exe)?$/i.test(argv[0]) ? 1 : 0;
  const next = () => (i + 1 < argv.length ? argv[++i] : "");
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-X" || a === "--request") method = next().toUpperCase();
    else if (/^-X[A-Z]+$/.test(a)) method = a.slice(2).toUpperCase();
    else if (a === "-H" || a === "--header") {
      const h = next();
      const c = h.indexOf(":");
      if (c > 0) headers.push({ name: h.slice(0, c).trim(), value: h.slice(c + 1).trim() });
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"].includes(a)) {
      data.push(next());
    } else if (a === "--json") {
      data.push(next());
      if (!headers.some((h) => h.name.toLowerCase() === "content-type")) headers.push({ name: "Content-Type", value: "application/json" });
      if (!headers.some((h) => h.name.toLowerCase() === "accept")) headers.push({ name: "Accept", value: "application/json" });
    } else if (a === "-u" || a === "--user") {
      const up = next();
      headers.push({ name: "Authorization", value: `Basic ${toBase64(up)}` });
      notes.push("cURL -u/--user was converted to an Authorization: Basic header for analysis.");
    } else if (a === "--oauth2-bearer") {
      headers.push({ name: "Authorization", value: `Bearer ${next()}` });
    } else if (a === "-b" || a === "--cookie") {
      const c = next();
      if (c.includes("=")) headers.push({ name: "Cookie", value: c });
      else notes.push("cURL -b pointed at a cookie file; its contents are not available here.");
    } else if (a === "-A" || a === "--user-agent") headers.push({ name: "User-Agent", value: next() });
    else if (a === "-e" || a === "--referer") headers.push({ name: "Referer", value: next() });
    else if (a === "--url") url = next();
    else if (a === "-G" || a === "--get") getMode = true;
    else if (a === "-I" || a === "--head") method = "HEAD";
    else if (a === "-F" || a === "--form") {
      data.push(next());
      notes.push("Multipart form fields (-F) are shown as the request body; files are not read.");
    } else if (CURL_VALUE_OPTS.has(a)) next();
    else if (a.startsWith("-")) {
      /* boolean flag (e.g. --compressed, -k, -sSL) */
    } else if (!url) url = a;
  }
  let body: string | undefined = data.length ? data.join("&") : undefined;
  if (getMode && body && url) {
    url += (url.includes("?") ? "&" : "?") + body;
    body = undefined;
  }
  if (!method) method = body !== undefined ? "POST" : "GET";
  if (!url) notes.push("No URL found in the cURL command.");
  return { exchange: { source: "curl", method, url: url ?? "", requestHeaders: headers, requestBody: body, index }, notes };
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// ---------------- HAR ----------------

export function harToExchanges(har: { log: { entries: unknown[] } }): Exchange[] {
  const out: Exchange[] = [];
  har.log.entries.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object") return;
    const e = raw as Record<string, any>;
    const rq = (e.request ?? {}) as Record<string, any>;
    const rs = (e.response ?? {}) as Record<string, any>;
    const pairs = (v: unknown): HeaderPair[] =>
      Array.isArray(v)
        ? v.filter((h) => h && typeof h.name === "string").map((h) => ({ name: String(h.name), value: String(h.value ?? "") }))
        : [];
    const content = (rs.content ?? {}) as Record<string, any>;
    const bodyText = typeof content.text === "string" && content.encoding !== "base64" ? content.text : undefined;
    out.push({
      source: "har",
      method: typeof rq.method === "string" ? rq.method.toUpperCase() : "GET",
      url: typeof rq.url === "string" ? rq.url : "",
      requestHeaders: pairs(rq.headers),
      requestBody: typeof rq.postData?.text === "string" ? rq.postData.text : undefined,
      status: typeof rs.status === "number" ? rs.status : undefined,
      statusText: typeof rs.statusText === "string" ? rs.statusText : undefined,
      responseHeaders: pairs(rs.headers),
      responseBody: bodyText,
      startedAt: typeof e.startedDateTime === "string" ? e.startedDateTime : undefined,
      timeMs: typeof e.time === "number" ? e.time : undefined,
      index: idx + 1,
    });
  });
  return out;
}

/**
 * Turn segments into exchanges. A request-side segment (cURL or raw
 * request) immediately followed by a response segment becomes one exchange.
 */
export function segmentsToExchanges(segs: Segment[]): { exchanges: Exchange[]; notes: string[] } {
  const exchanges: Exchange[] = [];
  const notes: string[] = [];
  let n = 0;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    let reqPart: Partial<Exchange> | null = null;
    if (seg.kind === "curl") {
      const r = parseCurl(seg.text, ++n);
      notes.push(...r.notes);
      reqPart = r.exchange;
    } else if (seg.kind === "http-request") {
      reqPart = parseHttpSegment(seg, ++n);
    } else if (seg.kind === "http-response") {
      const resp = parseHttpSegment(seg, ++n);
      exchanges.push(normalise({ ...resp, source: "http" }));
      continue;
    } else continue;

    const nextSeg = segs[s + 1];
    if (nextSeg && nextSeg.kind === "http-response") {
      const resp = parseHttpSegment(nextSeg, reqPart.index ?? n);
      exchanges.push(normalise({ ...reqPart, status: resp.status, statusText: resp.statusText, responseHeaders: resp.responseHeaders ?? [], responseBody: resp.responseBody }));
      s++;
    } else {
      exchanges.push(normalise(reqPart));
    }
  }
  return { exchanges, notes };
}

function normalise(p: Partial<Exchange>): Exchange {
  return {
    source: p.source ?? "http",
    method: p.method ?? "",
    url: p.url ?? "",
    requestHeaders: p.requestHeaders ?? [],
    requestBody: p.requestBody,
    status: p.status,
    statusText: p.statusText,
    responseHeaders: p.responseHeaders ?? [],
    responseBody: p.responseBody,
    startedAt: p.startedAt,
    timeMs: p.timeMs,
    index: p.index ?? 0,
  };
}
