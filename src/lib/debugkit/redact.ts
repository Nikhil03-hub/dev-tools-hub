// Structure-preserving, deterministic secret/PII redaction.
//
// Principles (why it is built this way):
//  - Precision over recall. We replace known token formats and values of
//    fields whose NAME says they are secret. We do NOT guess at "random
//    looking" strings (entropy heuristics cause false positives that wreck
//    the debugging value of the output). The UI must say so honestly:
//    "Known formats and secret-named fields only — review before sharing."
//  - Keep the structure. `Authorization: Bearer <JWT_1>`, `password=<PASSWORD_1>`,
//    `session=<COOKIE_1>; theme=<COOKIE_2>` — the reader can still see WHAT
//    was sent, just not the secret itself.
//  - Consistent placeholders. The same value always maps to the same
//    placeholder inside one report, so "the token in request 3 is the same
//    one as in request 7" survives redaction.
//  - Deterministic. Same input + options => same output. No randomness.
//  - Raw values stay in memory only (needed for JWT claim summaries) and
//    are never rendered.

import type { RedactOptions, RedactionCategory, RedactionSummaryRow } from "./types";

export const DEFAULT_REDACT_OPTIONS: RedactOptions = { emails: true, ips: true };

const PLACEHOLDER_EXACT = /^<[A-Z][A-Z0-9_]*_\d+>$/;
const PLACEHOLDER_ANY = /<[A-Z][A-Z0-9_]*_\d+>/;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_EXACT.test(value.trim());
}

// Values that are obviously not secrets even when the field name is
// secret-ish: booleans, empties, masks, and variable references like
// ${DB_PASSWORD} or {{ secrets.TOKEN }} (keeping those helps debugging and
// they reveal nothing).
function isNonSecretValue(value: string): boolean {
  const v = value.trim();
  if (v.length < 4) return true;
  if (/^(true|false|null|undefined|none|nil|redacted|\[redacted\]|<redacted>|changeme|xxx+|\*+|•+)$/i.test(v)) return true;
  if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(v)) return true; // $VAR / ${VAR}
  if (/^\$\{\{.*\}\}$/.test(v) || /^\{\{.*\}\}$/.test(v)) return true; // ${{ secrets.X }} / {{ x }}
  if (/^%[A-Za-z_][A-Za-z0-9_]*%$/.test(v)) return true; // %VAR% (Windows)
  if (/^\$\(/.test(v)) return true; // $(command substitution)
  // TypeScript/JSON-schema type names, e.g. "signature: string;"
  if (/^(string|number|boolean|bigint|any|unknown|object|void|never|null|undefined)(\[\])?[;,]?$/i.test(v)) return true;
  if (PLACEHOLDER_ANY.test(v)) return true;
  return false;
}

const STRONG_TOKENS = new Set([
  "password", "passwd", "pwd", "pass", "passphrase", "secret", "secrets", "token", "tokens",
  "apikey", "credential", "credentials", "signature", "sig", "privatekey", "accesskey",
  "sessionid", "sid", "auth", "cookie", "jwt", "bearer", "otp", "totp", "mfa",
]);
const STRONG_JOINED = [
  "apikey", "accesskey", "secretkey", "privatekey", "clientsecret", "sessionid", "authtoken",
  "accesstoken", "refreshtoken", "idtoken", "password", "passphrase", "connectionstring",
];
// If the LAST word of the field name is one of these, the field describes a
// secret rather than containing one (token_type, password_policy, expires_in…).
const DESCRIPTIVE_LAST = new Set([
  "type", "types", "url", "uri", "endpoint", "length", "count", "format", "hint", "policy",
  "expires", "expiry", "expiration", "ttl", "enabled", "required", "name", "names", "id", "ids",
  "path", "file", "prefix", "header", "field", "mode", "version", "algorithm", "alg", "strength",
  "reset", "valid", "validation", "min", "max", "rules", "changed", "updated", "at", "in", "used",
  "location", "method", "methods", "provider", "scope", "scopes", "status", "kind", "label",
]);
const NON_SECRET_KEY_PREFIX = new Set([
  "primary", "foreign", "sort", "partition", "cache", "map", "hash", "idempotency", "public",
  "row", "dedupe", "dedup", "lookup", "object", "s3", "bucket", "composite", "unique", "index",
  "routing", "group", "message", "cursor", "react", "list", "dict", "table", "api",
]);

function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when a field/header/variable NAME indicates its value is a secret. */
export function isSecretKey(name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const joined = tokens.join("");
  const last = tokens[tokens.length - 1];
  const sessionLike = joined.endsWith("sessionid") || joined === "sid" || joined.endsWith("sessid");
  if (DESCRIPTIVE_LAST.has(last) && !sessionLike) return false;
  // "pass" alone is too ambiguous ("PASS"/"FAIL" in test output); db_pass is fine.
  if (tokens.some((t) => STRONG_TOKENS.has(t) && !(t === "pass" && tokens.length === 1))) return true;
  if (STRONG_JOINED.some((s) => joined.includes(s))) return true;
  if (last === "key" && tokens.length >= 2 && !NON_SECRET_KEY_PREFIX.has(tokens[tokens.length - 2])) return true;
  return false;
}

function passwordish(name: string): boolean {
  const t = nameTokens(name);
  return t.some((x) => x === "password" || x === "passwd" || x === "pwd" || x === "pass" || x === "passphrase");
}

// ---- Payment-card check (Luhn + real issuer prefixes) ----
function luhnOk(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
function looksLikeCard(raw: string): boolean {
  const digits = raw.replace(/[ -]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  // Visa 4 / Mastercard 51-55,2221-2720 / Amex 34,37 / Diners 30,36,38 /
  // Discover+RuPay 6 / JCB 35 / RuPay 81,82. Epoch-millisecond timestamps
  // (start with 1) never match.
  if (!/^(4|5[1-5]|2[2-7]|3[0-8]|6|8[12])/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return luhnOk(digits);
}

function isKeptIp(ip: string): boolean {
  return ip.startsWith("127.") || ip === "0.0.0.0" || ip === "255.255.255.255";
}

const SECRET_HEADER_NAMES =
  "x-api-key|api-key|apikey|x-apikey|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token|x-goog-api-key|private-token|x-functions-key|ocp-apim-subscription-key|x-session-token|x-refresh-token";

export class Redactor {
  readonly options: RedactOptions;
  private byValue = new Map<string, string>();
  private counters = new Map<RedactionCategory, number>();
  private occurrences = new Map<RedactionCategory, number>();
  private order: RedactionCategory[] = [];
  private jwtRaw = new Map<string, string>(); // placeholder -> raw token (memory only)

  constructor(options: Partial<RedactOptions> = {}) {
    // Ignore explicitly-undefined keys so they can't switch a default off.
    this.options = {
      emails: options.emails ?? DEFAULT_REDACT_OPTIONS.emails,
      ips: options.ips ?? DEFAULT_REDACT_OPTIONS.ips,
    };
  }

  /** Placeholder for a value; the same (category, value) always gets the same placeholder. */
  placeholder(category: RedactionCategory, value: string): string {
    const key = `${category}\u0000${value}`;
    let ph = this.byValue.get(key);
    if (!ph) {
      const n = (this.counters.get(category) ?? 0) + 1;
      this.counters.set(category, n);
      if (n === 1) this.order.push(category);
      ph = `<${category}_${n}>`;
      this.byValue.set(key, ph);
      if (category === "JWT") this.jwtRaw.set(ph, value);
    }
    this.occurrences.set(category, (this.occurrences.get(category) ?? 0) + 1);
    return ph;
  }

  /**
   * Placeholder for a value WITHOUT counting an extra occurrence (used when
   * findings refer back to a value that was already redacted in the text).
   */
  lookup(category: RedactionCategory, value: string): string {
    const existing = this.byValue.get(`${category}\u0000${value}`);
    return existing ?? this.placeholder(category, value);
  }

  /** Raw JWTs seen, in first-seen order. Memory only — for claim summaries. */
  jwts(): { placeholder: string; raw: string }[] {
    return [...this.jwtRaw.entries()].map(([placeholder, raw]) => ({ placeholder, raw }));
  }

  summary(): RedactionSummaryRow[] {
    return this.order.map((category) => ({
      category,
      distinct: this.counters.get(category) ?? 0,
      occurrences: this.occurrences.get(category) ?? 0,
    }));
  }

  total(): number {
    let t = 0;
    this.occurrences.forEach((v) => (t += v));
    return t;
  }

  private rep(category: RedactionCategory, value: string): string {
    return isPlaceholder(value) ? value : this.placeholder(category, value);
  }

  private redactCookieList(list: string): string {
    return list
      .split(";")
      .map((part) => {
        const eq = part.indexOf("=");
        if (eq < 0) return part;
        const name = part.slice(0, eq);
        const value = part.slice(eq + 1).trim();
        if (value === "" || isPlaceholder(value)) return part;
        return `${name}=${this.placeholder("COOKIE", value)}`;
      })
      .join(";");
  }

  /** Redact one header / field given its name and value (used for HAR/JSON structure). */
  redactPair(name: string, value: string): string {
    const n = name.trim().toLowerCase();
    if (value.trim() === "" || isPlaceholder(value)) return value;
    if (n === "authorization" || n === "proxy-authorization") {
      const m = /^\s*(bearer|basic|token|bot|digest|negotiate|apikey)\s+(.+)$/i.exec(value);
      if (m) {
        const inner = this.redactText(m[2]); // a JWT inside becomes <JWT_n>
        if (inner !== m[2]) return `${m[1]} ${inner}`;
        return `${m[1]} ${this.rep(m[1].toLowerCase() === "basic" ? "BASIC_AUTH" : "AUTH_TOKEN", m[2].trim())}`;
      }
      const inner = this.redactText(value);
      return inner !== value ? inner : this.rep("AUTH_TOKEN", value.trim());
    }
    if (n === "cookie") return this.redactCookieList(value);
    if (n === "set-cookie") {
      return value.replace(/^(\s*[^=;\s]+=)([^;]*)/, (_m, a: string, v: string) =>
        v.trim() === "" || isPlaceholder(v) ? `${a}${v}` : `${a}${this.placeholder("COOKIE", v.trim())}`,
      );
    }
    if (new RegExp(`^(?:${SECRET_HEADER_NAMES})$`, "i").test(n) || isSecretKey(name)) {
      const inner = this.redactText(value);
      if (inner !== value) return inner;
      if (isNonSecretValue(value)) return value;
      return this.placeholder(passwordish(name) ? "PASSWORD" : "SECRET", value);
    }
    return this.redactText(value);
  }

  /** Redact free text (logs, headers pasted as text, cURL commands, env files…). */
  redactText(input: string): string {
    let t = input;
    const O = this.options;

    // 1. Private key blocks (complete, then truncated pastes).
    t = t.replace(
      /(-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----)([\s\S]*?)(-----END \2PRIVATE KEY-----)/g,
      (_m, b: string, _k: string, body: string, e: string) => {
        if (isPlaceholder(body.replace(/\\n|\s/g, ""))) return _m;
        const nl = nlStyle(body);
        return `${b}${nl}${this.placeholder("PRIVATE_KEY", body)}${nl}${e}`;
      },
    );
    t = t.replace(/(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)((?:(?:\r?\n|\\n)[A-Za-z0-9+/=]{16,})+)/g, (_m, b: string, body: string) =>
      `${b}${nlStyle(body)}${this.placeholder("PRIVATE_KEY", body)}`,
    );

    // 2. Credentials inside URLs: scheme://user:PASSWORD@host
    t = t.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/'"<>]+):([^\s@/'"<>]+)@/gi, (_m, s: string, u: string, p: string) =>
      `${s}${u}:${this.rep("PASSWORD", p)}@`,
    );

    // 3. JWTs anywhere (header.payload.signature, both base64url JSON objects).
    t = t.replace(/\beyJ[A-Za-z0-9_-]{2,}\.eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g, (m) => this.placeholder("JWT", m));

    // 4. Well-known vendor token formats.
    const vendor: [RegExp, RedactionCategory][] = [
      [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, "ANTHROPIC_KEY"],
      [/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, "OPENAI_KEY"],
      [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g, "STRIPE_KEY"],
      [/\bwhsec_[A-Za-z0-9]{20,}/g, "STRIPE_KEY"],
      [/\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g, "AWS_ACCESS_KEY_ID"],
      [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, "GITHUB_TOKEN"],
      [/\bgithub_pat_[A-Za-z0-9_]{50,}/g, "GITHUB_TOKEN"],
      [/\bglpat-[A-Za-z0-9_-]{20,}/g, "GITLAB_TOKEN"],
      [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, "SLACK_WEBHOOK"],
      [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, "SLACK_TOKEN"],
      [/\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g, "GOOGLE_API_KEY"],
      [/\bnpm_[A-Za-z0-9]{36}\b/g, "NPM_TOKEN"],
      [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, "SENDGRID_KEY"],
    ];
    for (const [re, cat] of vendor) t = t.replace(re, (m) => this.placeholder(cat, m));
    t = t.replace(
      /((?:aws_?secret_?access_?key|aws_?secret_?key|secret_?access_?key)["']?\s*[:=]\s*["']?)([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
      (_m, k: string, v: string) => `${k}${this.rep("AWS_SECRET_KEY", v)}`,
    );

    // 5. Cookies. Set-Cookie first (only the cookie's own value; keep
    //    Path/Secure/HttpOnly/SameSite — those matter for debugging).
    t = t.replace(/\b(set-cookie)(["']?\s*:\s*["']?)([^=;\s'"]+)=([^;\r\n'"]*)/gi, (_m, h: string, sep: string, n: string, v: string) =>
      v.trim() === "" || isPlaceholder(v) ? _m : `${h}${sep}${n}=${this.placeholder("COOKIE", v.trim())}`,
    );
    t = t.replace(/(?<![-\w])(cookie)(["']?\s*:\s*)([^\r\n'"]+)/gi, (_m, h: string, sep: string, list: string) =>
      `${h}${sep}${this.redactCookieList(list)}`,
    );
    // cURL: -b 'a=b; c=d' / --cookie "..."  and  -u user:pass / --user user:pass
    t = t.replace(/(\s(?:-b|--cookie)\s+)(['"])([^'"]+)\2/g, (_m, f: string, q: string, list: string) =>
      list.includes("=") ? `${f}${q}${this.redactCookieList(list)}${q}` : _m,
    );
    t = t.replace(/(\s(?:-u|--user)\s+)(['"]?)([^:'"\s]+):([^'"\s]+)\2/g, (_m, f: string, q: string, u: string, p: string) =>
      `${f}${q}${u}:${this.rep("PASSWORD", p)}${q}`,
    );

    // 6. Authorization headers in text (raw HTTP, cURL -H, JSON-ish).
    t = t.replace(
      /\b((?:proxy-)?authorization)(["']?\s*[:=]\s*["']?)(?:(bearer|basic|token|bot|digest|negotiate|apikey)\s+)?([^\s'",;\\]+)/gi,
      (_m, h: string, sep: string, scheme: string | undefined, v: string) => {
        if (isPlaceholder(v)) return _m;
        const cat: RedactionCategory = scheme && scheme.toLowerCase() === "basic" ? "BASIC_AUTH" : "AUTH_TOKEN";
        return `${h}${sep}${scheme ? `${scheme} ` : ""}${this.placeholder(cat, v)}`;
      },
    );

    // 7. Headers whose name marks them as secret.
    t = t.replace(new RegExp(`\\b(${SECRET_HEADER_NAMES})(["']?\\s*:\\s*["']?)([^\\s'",;]+)`, "gi"), (_m, h: string, sep: string, v: string) =>
      isNonSecretValue(v) ? _m : `${h}${sep}${this.placeholder("SECRET", v)}`,
    );

    // 8a. env-style lines: [export] NAME=value
    t = t.replace(/^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_.-]*)([ \t]*=[ \t]*)(.*)$/gm, (m, lead: string, name: string, eq: string, rest: string) => {
      if (!isSecretKey(name)) return m;
      // Spaces around "=" are code ("const token = getToken()"), unless the
      // name is UPPER_SNAKE like a real env var.
      if (eq !== "=" && !/^[A-Z_][A-Z0-9_]*$/.test(name)) return m;
      const q = /^(["'])(.*?)\1(.*)$/.exec(rest);
      const value = q ? q[2] : rest.split(/\s/)[0];
      const tail = q ? q[3] : rest.slice(value.length);
      if (isNonSecretValue(value)) return m;
      const ph = this.placeholder(passwordish(name) ? "PASSWORD" : "SECRET", value);
      return q ? `${lead}${name}${eq}${q[1]}${ph}${q[1]}${tail}` : `${lead}${name}${eq}${ph}${tail}`;
    });
    // 8b. JSON-ish "name": "value"
    t = t.replace(/"([^"\\\n]{1,80})"(\s*:\s*)"((?:[^"\\\n]|\\.)*)"/g, (m, name: string, sep: string, value: string) => {
      if (!isSecretKey(name) || isNonSecretValue(value)) return m;
      return `"${name}"${sep}"${this.placeholder(passwordish(name) ? "PASSWORD" : "SECRET", value)}"`;
    });
    // 8c. YAML / "Name: value" lines
    t = t.replace(/^([ \t-]*)([A-Za-z_][A-Za-z0-9_.-]{0,63})([ \t]*:[ \t]+)(["']?)([^\r\n"'#]+?)\4([ \t]*)$/gm, (m, lead: string, name: string, sep: string, q: string, value: string, trail: string) => {
      if (!isSecretKey(name) || isNonSecretValue(value)) return m;
      if (!q && (/[;,]$/.test(value.trim()) || /\w\(/.test(value))) return m; // code, not YAML
      return `${lead}${name}${sep}${q}${this.placeholder(passwordish(name) ? "PASSWORD" : "SECRET", value)}${q}${trail}`;
    });
    // 8d. Inline name=value (query strings, form bodies, key=value logs)
    t = t.replace(/(^|[?&;,\s{(])([A-Za-z_][A-Za-z0-9_.-]{0,63})=([^&\s'",;#)}]+)/g, (m, pre: string, name: string, value: string) => {
      if (!isSecretKey(name) || isNonSecretValue(decodeSafe(value))) return m;
      return `${pre}${name}=${this.placeholder(passwordish(name) ? "PASSWORD" : "SECRET", value)}`;
    });

    // 9. PII.
    if (O.emails) {
      t = t.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, (m) =>
        /^git@/i.test(m) ? m : this.placeholder("EMAIL", m),
      );
    }
    t = t.replace(/\b(?:\d{4}[ -]){3}\d{1,7}\b|\b\d{13,19}\b/g, (m) => (looksLikeCard(m) ? this.placeholder("CARD", m) : m));
    if (O.ips) {
      t = t.replace(/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)/g, (m) =>
        isKeptIp(m) ? m : this.placeholder("IP", m),
      );
    }
    return t;
  }

  /**
   * Redact a parsed JSON value structurally: secret-named keys get their
   * whole value replaced; every other string is run through redactText;
   * HAR-style {name, value} pairs use redactPair (header/cookie aware).
   */
  redactJson(value: unknown, keyHint = ""): unknown {
    if (typeof value === "string") {
      if (keyHint && isSecretKey(keyHint) && !isNonSecretValue(value)) {
        const inner = this.redactText(value);
        return inner !== value ? inner : this.placeholder(passwordish(keyHint) ? "PASSWORD" : "SECRET", value);
      }
      return this.redactText(value);
    }
    if (Array.isArray(value)) return value.map((v) => this.redactJson(v, keyHint));
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // HAR header / cookie / query / param entry: { name, value, ... }
      if (typeof obj.name === "string" && typeof obj.value === "string") {
        const out: Record<string, unknown> = { ...obj };
        out.value = keyHint === "cookies" ? (obj.value === "" ? "" : this.rep("COOKIE", obj.value)) : this.redactPair(obj.name, obj.value);
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = this.redactJson(v, k);
      return out;
    }
    return value;
  }
}

// Keep the newline style of the original: real newlines in a file, but a
// literal "\\n" when the key sits inside a JSON string (so JSON stays valid).
function nlStyle(body: string): string {
  if (body.includes("\n")) return "\n";
  if (body.includes("\\n")) return "\\n";
  return " ";
}

function decodeSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
