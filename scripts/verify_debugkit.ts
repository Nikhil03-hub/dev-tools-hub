// Verification suite for src/lib/debugkit (the Debug Report engine).
// Run: npx tsx scripts/verify_debugkit.ts
// Pure Node — no browser. Mirrors scripts/verify_lib.ts style.
//
// The most important test is "no_raw_secret_leaks_anywhere": every raw
// secret planted in the fixtures must be absent from the report object,
// the sanitized text and all three rendered share formats.

import { analyze, renderReport } from "../src/lib/debugkit/report";
import { Redactor, isSecretKey } from "../src/lib/debugkit/redact";
import { splitSegments, parseCurl, segmentsToExchanges, tokenizeShell } from "../src/lib/debugkit/parse";
import { summarizeLogs, toTemplate } from "../src/lib/debugkit/logs";
import { DEBUG_SAMPLES } from "../src/lib/debugkit/samples";
import { pixelUrl } from "../src/lib/metrics";

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passes++;
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

const NOW = Date.parse("2026-09-30T10:00:00Z");
const S = (ms: number) => Math.floor(ms / 1000);
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", typ: "JWT", kid: "k1" }) =>
  `${b64u(header)}.${b64u(payload)}.c2lnbmF0dXJlLXBsYWNlaG9sZGVyLWZvci10ZXN0cw`;

const JWT_EXPIRED = jwt({ sub: "user_42", email: "asha@example.com", iss: "https://auth.example.com/", aud: "api://orders", iat: S(NOW) - 4200, exp: S(NOW) - 600, scope: "orders:read" });
const JWT_OK = jwt({ sub: "user_7", iss: "https://auth.example.com/", aud: "api://orders", iat: S(NOW) - 60, exp: S(NOW) + 3600 });
const JWT_NBF_SKEW = jwt({ sub: "u", iat: S(NOW) + 120, nbf: S(NOW) + 120, exp: S(NOW) + 3720 });
const JWT_NONE = jwt({ sub: "u", exp: S(NOW) + 3600 }, { alg: "none", typ: "JWT" });
const JWT_NO_EXP = jwt({ sub: "u", iat: S(NOW) - 10 });

const SECRETS = {
  aws: "AKIA" + "IOSFODNN7EXAMPLE",
  awsSecret: "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY",
  gh: "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
  stripe: "sk_live_" + "51HxYzABCdefGHIjklMNOpqr",
  openai: "sk-proj-" + "abcdefghijklmnopqrstuvwxyz012345",
  anthropic: "sk-ant-api03-" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123",
  slackHook: "https://hooks.slack" + ".com/services/T0001/B0002/" + "XXXXXXXXXXXXXXXXXXXXXXXX",
  dbPass: "S3cretPass!9",
  envPass: "hunter2hunter",
  apiKey: "abc123def456ghi",
  clientSecret: "s3cr3t-value-777",
  jsonPass: "p@ssw0rd!2026",
  cookieSess: "sessABC123xyz",
  setCookie: "sidXYZ789abc",
  curlPass: "curlPass2026",
  qsToken: "xyz123tokenQS",
  email: "asha.verma@example.com",
  ip: "203.0.113.9",
  card: "4111 1111 1111 1111",
  pkBody: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
  logToken: "abcd1234efgh5678",
};

// ---------------- isSecretKey ----------------
for (const k of ["password", "db_password", "apiKey", "x-api-key", "clientSecret", "AWS_SECRET_ACCESS_KEY", "session_id", "sessionId", "auth", "refresh_token", "stripe_key", "private_key", "DB_PASS", "passphrase", "X-Custom-Token", "connectionString"]) {
  check(`isSecretKey_true_${k}`, isSecretKey(k));
}
for (const k of ["author", "token_type", "password_policy", "expires_in", "client_id", "public_key", "primary_key", "keyboard", "monkey", "authorization", "passport", "sort_key", "cache_key", "Content-Type", "user", "status", "TOKEN_TTL", "tokenizer"]) {
  check(`isSecretKey_false_${k}`, !isSecretKey(k));
}

// ---------------- Redaction ----------------
{
  const r = new Redactor();
  const out = r.redactText(`Authorization: Bearer ${JWT_OK}\nretry with ${JWT_OK}`);
  check("jwt_in_auth_header_redacted", out.includes("Authorization: Bearer <JWT_1>") && !out.includes(JWT_OK), out);
  check("jwt_same_value_same_placeholder", (out.match(/<JWT_1>/g) ?? []).length === 2 && !out.includes("<JWT_2>"), out);
  const sum = r.summary().find((x) => x.category === "JWT");
  check("jwt_summary_counts", !!sum && sum.distinct === 1 && sum.occurrences === 2, JSON.stringify(sum));
}
{
  const r = new Redactor();
  const txt = [
    `aws_access_key_id = ${SECRETS.aws}`,
    `aws_secret_access_key = ${SECRETS.awsSecret}`,
    `GITHUB_TOKEN=${SECRETS.gh}`,
    `stripe ${SECRETS.stripe} and publishable ${"pk_live_" + "51HxYzABCdefGHIjklMNOpqr"}`,
    `openai ${SECRETS.openai}`,
    `anthropic ${SECRETS.anthropic}`,
    `hook ${SECRETS.slackHook}`,
  ].join("\n");
  const out = r.redactText(txt);
  check("aws_key_id", out.includes("<AWS_ACCESS_KEY_ID_1>") && !out.includes(SECRETS.aws), out);
  check("aws_secret", !out.includes(SECRETS.awsSecret), out);
  check("github_token", out.includes("<GITHUB_TOKEN_1>") || out.includes("<SECRET_1>"), out);
  check("github_token_gone", !out.includes(SECRETS.gh), out);
  check("stripe_secret", out.includes("<STRIPE_KEY_1>") && !out.includes(SECRETS.stripe), out);
  check("stripe_publishable_kept", out.includes("pk_live_51HxYzABCdefGHIjklMNOpqr"), out);
  check("openai_key", out.includes("<OPENAI_KEY_1>") && !out.includes(SECRETS.openai), out);
  check("anthropic_key_not_misfiled_as_openai", out.includes("<ANTHROPIC_KEY_1>") && !out.includes(SECRETS.anthropic), out);
  check("slack_webhook", out.includes("<SLACK_WEBHOOK_1>") && !out.includes("XXXXXXXXXXXXXXXXXXXXXXXX"), out);
}
{
  const r = new Redactor();
  const pk = `-----BEGIN RSA PRIVATE KEY-----\n${SECRETS.pkBody}\n${SECRETS.pkBody}\n-----END RSA PRIVATE KEY-----`;
  const out = r.redactText(`key:\n${pk}\nafter`);
  check("private_key_block", out.includes("-----BEGIN RSA PRIVATE KEY-----") && out.includes("-----END RSA PRIVATE KEY-----") && out.includes("<PRIVATE_KEY_1>") && !out.includes(SECRETS.pkBody), out);
  check("private_key_keeps_following_text", out.trim().endsWith("after"), out);
  const trunc = r.redactText(`-----BEGIN PRIVATE KEY-----\n${SECRETS.pkBody}\n${SECRETS.pkBody}\n(truncated)`);
  check("private_key_truncated_paste", !trunc.includes(SECRETS.pkBody) && trunc.includes("(truncated)"), trunc);
  const jsonText = JSON.stringify({ private_key: `-----BEGIN PRIVATE KEY-----\n${SECRETS.pkBody}\n-----END PRIVATE KEY-----\n` });
  const jOut = r.redactText(jsonText);
  let valid = true;
  try {
    JSON.parse(jOut);
  } catch {
    valid = false;
  }
  check("private_key_in_json_string_keeps_json_valid", valid && !jOut.includes(SECRETS.pkBody), jOut);
}
{
  const r = new Redactor();
  const out = r.redactText(`DATABASE_URL=postgres://admin:${SECRETS.dbPass}@db.internal:5432/app`);
  check("url_credentials", out.includes("postgres://admin:<PASSWORD_1>@db.internal:5432/app") && !out.includes(SECRETS.dbPass), out);
}
{
  const r = new Redactor();
  const env = [
    `DB_PASSWORD=${SECRETS.envPass}`,
    `API_KEY="${SECRETS.apiKey}"`,
    "NODE_ENV=production",
    "TOKEN_TTL=3600",
    "SECRET_REF=${VAULT_SECRET}",
    "export CLIENT_SECRET='" + SECRETS.clientSecret + "' # comment",
  ].join("\n");
  const out = r.redactText(env);
  check("env_password", out.includes("DB_PASSWORD=<PASSWORD_1>") && !out.includes(SECRETS.envPass), out);
  check("env_quoted_value_keeps_quotes", out.includes('API_KEY="<SECRET_1>"'), out);
  check("env_non_secret_kept", out.includes("NODE_ENV=production") && out.includes("TOKEN_TTL=3600"), out);
  check("env_variable_reference_kept", out.includes("SECRET_REF=${VAULT_SECRET}"), out);
  check("env_export_single_quotes_and_comment", out.includes("export CLIENT_SECRET='<SECRET_2>' # comment"), out);
}
{
  const r = new Redactor();
  const obj = { password: SECRETS.jsonPass, token_type: "Bearer", expires_in: 3600, client_id: "abc-client", client_secret: SECRETS.clientSecret, nested: { refreshToken: "rt-0123456789abcdef" } };
  const outText = r.redactText(JSON.stringify(obj));
  check("json_text_password", !outText.includes(SECRETS.jsonPass) && outText.includes('"token_type":"Bearer"') && outText.includes('"client_id":"abc-client"'), outText);
  const struct = JSON.stringify(r.redactJson(obj));
  check("json_structural", !struct.includes(SECRETS.jsonPass) && !struct.includes(SECRETS.clientSecret) && !struct.includes("rt-0123456789abcdef") && struct.includes('"expires_in":3600'), struct);
  check("json_consistent_between_text_and_structure", outText.includes("<PASSWORD_1>") && struct.includes("<PASSWORD_1>"), `${outText} | ${struct}`);
}
{
  const r = new Redactor();
  const out = r.redactText(`GET https://api.x.com/cb?code=abc&access_token=${SECRETS.qsToken}&state=ok`);
  check("query_token", out.includes("access_token=<SECRET_1>") && out.includes("state=ok") && !out.includes(SECRETS.qsToken), out);
}
{
  const r = new Redactor();
  const out = r.redactText(`Cookie: session=${SECRETS.cookieSess}; theme=dark\nSet-Cookie: sid=${SECRETS.setCookie}; Path=/; HttpOnly; SameSite=Lax`);
  check("cookie_values", /Cookie: session=<COOKIE_\d>; theme=<COOKIE_\d>/.test(out) && !out.includes(SECRETS.cookieSess), out);
  check("set_cookie_value_attrs_kept", /Set-Cookie: sid=<COOKIE_\d>; Path=\/; HttpOnly; SameSite=Lax/.test(out) && !out.includes(SECRETS.setCookie), out);
}
{
  const r = new Redactor();
  const out = r.redactText(`curl -u admin:${SECRETS.curlPass} -b 'sid=${SECRETS.cookieSess}; lang=en' https://api.example.com/me`);
  check("curl_user_password", out.includes("-u admin:<PASSWORD_1>") && !out.includes(SECRETS.curlPass), out);
  check("curl_cookie_flag", out.includes("sid=<COOKIE_1>") && !out.includes(SECRETS.cookieSess), out);
}
{
  const r = new Redactor();
  const out = r.redactText(`contact ${SECRETS.email}; remote git@github.com:org/repo.git from ${SECRETS.ip} and 127.0.0.1 ua Chrome/120.0.6099.109 v1.2.3.4.5`);
  check("email_redacted", out.includes("<EMAIL_1>") && !out.includes(SECRETS.email), out);
  check("git_ssh_kept", out.includes("git@github.com:org/repo.git"), out);
  check("public_ip_redacted", out.includes("<IP_1>") && !out.includes(SECRETS.ip), out);
  check("loopback_kept", out.includes("127.0.0.1"), out);
  check("version_strings_untouched", out.includes("Chrome/120.0.6099.109") && out.includes("v1.2.3.4.5"), out);
  const r2 = new Redactor({ emails: false, ips: false });
  const out2 = r2.redactText(`contact ${SECRETS.email} from ${SECRETS.ip}`);
  check("options_disable_email_ip", out2.includes(SECRETS.email) && out2.includes(SECRETS.ip), out2);
}
{
  const r = new Redactor();
  const out = r.redactText(`card ${SECRETS.card} ts 1790000000000 id 1234567890123`);
  check("card_redacted", out.includes("<CARD_1>") && !out.includes(SECRETS.card), out);
  check("epoch_ms_not_card", out.includes("1790000000000"), out);
  check("non_luhn_number_kept", out.includes("1234567890123"), out);
}
{
  const r = new Redactor();
  const out = r.redactText("password: ${DB_PASS}\nremember_password: true\ntoken_type: bearer\nuser=alice status=500 token=" + SECRETS.logToken);
  check("yaml_var_ref_kept", out.includes("password: ${DB_PASS}"), out);
  check("yaml_boolean_kept", out.includes("remember_password: true"), out);
  check("descriptive_key_kept", out.includes("token_type: bearer"), out);
  check("inline_kv_token", out.includes("token=<SECRET_1>") && out.includes("user=alice status=500") && !out.includes(SECRETS.logToken), out);
}
{
  const r = new Redactor();
  const sample = `Authorization: Bearer ${JWT_OK}\nCookie: a=bcdef123\npassword=${SECRETS.envPass}\n${SECRETS.email}`;
  const once = r.redactText(sample);
  const twice = r.redactText(once);
  check("idempotent_second_pass", once === twice, `${once}\n---\n${twice}`);
}

{
  const r = new Redactor();
  const code = [
    "  signature: string;",
    "  signature: rawSignature,",
    'jwtStatusText = await page.getByTestId("jwt-status").innerText();',
    "const token = getToken();",
    'console.log(`${v ? "PASS" : "FAIL"}  ${k}`);',
    "TOKEN=$(cat /run/secrets/token)",
  ].join("\n");
  const out = r.redactText(code);
  check("no_false_positives_on_code", out === code, out);
}

// ---------------- Parsing ----------------
{
  const har = { log: { version: "1.2", entries: [{ request: { method: "GET", url: "https://a.b/c", headers: [] }, response: { status: 200, headers: [], content: { text: "ok" } } }] } };
  const segs = splitSegments(JSON.stringify(har));
  check("har_detected", segs.length === 1 && segs[0].kind === "har", JSON.stringify(segs));
  const js = splitSegments('{"a":1}');
  check("json_detected", js.length === 1 && js[0].kind === "json");
}
{
  const chromeBash = [
    "curl 'https://api.example.com/v1/orders?limit=10' \\",
    "  -H 'accept: application/json' \\",
    `  -H 'authorization: Bearer ${JWT_EXPIRED}' \\`,
    "  -H 'origin: https://app.example.com' \\",
    "  --data-raw $'{\"note\":\"it\\'s\\n ok\"}' \\",
    "  --compressed",
  ].join("\n");
  const segs = splitSegments(chromeBash);
  check("curl_segment_multiline", segs.length === 1 && segs[0].kind === "curl", JSON.stringify(segs.map((s) => s.kind)));
  const p = parseCurl(chromeBash, 1).exchange;
  check("curl_url", p.url === "https://api.example.com/v1/orders?limit=10", String(p.url));
  check("curl_method_post_from_data", p.method === "POST", String(p.method));
  check("curl_headers", (p.requestHeaders ?? []).length === 3, JSON.stringify(p.requestHeaders));
  check("curl_ansi_c_body", p.requestBody === '{"note":"it\'s\n ok"}', JSON.stringify(p.requestBody));
}
{
  const cmd = 'curl ^"https://api.example.com/v1/me^" ^\n  -H ^"accept: */*^" ^\n  -H ^"x-api-key: abcDEF123456^"';
  const argv = tokenizeShell(cmd);
  check("curl_cmd_style_tokens", argv[1] === "https://api.example.com/v1/me" && argv.includes("x-api-key: abcDEF123456"), JSON.stringify(argv));
}
{
  const raw = [
    "GET /v1/me HTTP/1.1",
    "Host: api.example.com",
    `Authorization: Bearer ${JWT_EXPIRED}`,
    "",
    "HTTP/1.1 401 Unauthorized",
    "Date: Wed, 30 Sep 2026 10:00:00 GMT",
    'WWW-Authenticate: Bearer error="invalid_token", error_description="The token expired"',
    "Content-Type: application/json",
    "",
    '{"error":"invalid_token"}',
  ].join("\n");
  const segs = splitSegments(raw);
  check("raw_http_two_segments", segs.map((s) => s.kind).join(",") === "http-request,http-response", segs.map((s) => s.kind).join(","));
  const { exchanges } = segmentsToExchanges(segs);
  check("raw_http_paired", exchanges.length === 1 && exchanges[0].status === 401 && exchanges[0].url === "api.example.com/v1/me", JSON.stringify(exchanges[0]));
}
{
  const headersOnly = "access-control-allow-origin: https://app.example.com\ncontent-type: application/json\ndate: Wed, 30 Sep 2026 10:00:00 GMT\nserver: nginx";
  const segs = splitSegments(headersOnly);
  check("headers_only_response_block", segs.length === 1 && segs[0].kind === "http-response", JSON.stringify(segs));
  const envSegs = splitSegments("# app\nNODE_ENV=production\nPORT=3000\nDB_PASSWORD=x");
  check("env_classified", envSegs.length === 1 && envSegs[0].kind === "env", JSON.stringify(envSegs));
  const logSegs = splitSegments("2026-09-30T10:00:00Z INFO started\nERROR: something failed\nWARN: slow");
  check("log_lines_not_mistaken_for_headers", logSegs.length === 1 && logSegs[0].kind === "log", JSON.stringify(logSegs));
  const jwtSegs = splitSegments(JWT_OK);
  check("jwt_only_segment", jwtSegs.length === 1 && jwtSegs[0].kind === "jwt");
}

// ---------------- Findings ----------------
const ids = (rep: ReturnType<typeof analyze>) => rep.findings.map((f) => f.id);
{
  const raw = [
    "GET /v1/me HTTP/1.1",
    "Host: api.example.com",
    `Authorization: Bearer ${JWT_EXPIRED}`,
    "",
    "HTTP/1.1 401 Unauthorized",
    "Date: Wed, 30 Sep 2026 10:05:00 GMT",
    'WWW-Authenticate: Bearer error="invalid_token", error_description="The token expired"',
  ].join("\n");
  const rep = analyze(raw, { now: NOW });
  check("f_401_and_expired", ids(rep).includes("http-401") && ids(rep).includes("jwt-expired"), ids(rep).join(","));
  const exp = rep.findings.find((f) => f.id === "jwt-expired")!;
  check("f_expired_uses_server_date", exp.evidence.some((e) => e.includes('server "Date" header')) && exp.title.includes("15 min"), JSON.stringify(exp));
  const f401 = rep.findings.find((f) => f.id === "http-401")!;
  check("f_401_not_no_creds", !f401.title.includes("no credentials"), f401.title);
  check("f_401_www_authenticate_parsed", f401.evidence.some((e) => e.includes("invalid_token") && e.includes("The token expired")), JSON.stringify(f401.evidence));
  check("f_signature_not_verified_info", ids(rep).includes("jwt-signature-not-verified"));
  check("f_sorted_by_severity", rep.findings[0].severity === "high" && rep.findings[rep.findings.length - 1].severity === "info");
  check("f_jwt_safe_claims_only", rep.jwts.length === 1 && rep.jwts[0].safeClaims.aud === "api://orders" && !("email" in rep.jwts[0].safeClaims) && rep.jwts[0].withheldClaimNames.includes("email"), JSON.stringify(rep.jwts));
}
{
  const rep = analyze("GET /v1/me HTTP/1.1\nHost: api.example.com\n\nHTTP/1.1 401 Unauthorized\nContent-Type: application/json", { now: NOW });
  check("f_401_no_credentials", rep.findings.some((f) => f.id === "http-401" && f.title.includes("no credentials")), JSON.stringify(rep.findings.map((f) => f.title)));
}
{
  const rep = analyze(`GET /v1/me HTTP/1.1\nHost: api.example.com\nAuthorization: ${JWT_OK}\n\nHTTP/1.1 401 Unauthorized`, { now: NOW });
  check("f_auth_missing_scheme", ids(rep).includes("auth-missing-scheme"), ids(rep).join(","));
}
function harEntry(req: Record<string, unknown>, res: Record<string, unknown>, started = "2026-09-30T10:00:00.000Z") {
  return { startedDateTime: started, time: 120, request: { headers: [], ...req }, response: { headers: [], content: { text: "" }, ...res } };
}
const H = (name: string, value: string) => ({ name, value });
{
  const har = {
    log: {
      entries: [
        harEntry(
          { method: "OPTIONS", url: "https://api.example.com/v1/orders/9", headers: [H("Origin", "https://app.example.com"), H("Access-Control-Request-Method", "PUT"), H("Access-Control-Request-Headers", "authorization, content-type")] },
          { status: 204, headers: [H("Access-Control-Allow-Origin", "https://app.example.com"), H("Access-Control-Allow-Methods", "GET, POST"), H("Access-Control-Allow-Headers", "content-type")] },
        ),
        harEntry({ method: "GET", url: "https://api.example.com/v1/orders", headers: [H("Origin", "https://app.example.com")] }, { status: 200, headers: [H("Content-Type", "application/json")] }),
        harEntry({ method: "GET", url: "https://api.example.com/v1/orders", headers: [H("Origin", "https://app.example.com")] }, { status: 200, headers: [] }),
        harEntry({ method: "GET", url: "https://api.example.com/v1/orders", headers: [H("Origin", "https://app.example.com")] }, { status: 200, headers: [] }),
        harEntry({ method: "GET", url: "https://api2.example.com/x", headers: [H("Origin", "https://app.example.com")] }, { status: 200, headers: [H("Access-Control-Allow-Origin", "http://app.example.com")] }),
        harEntry({ method: "GET", url: "https://api3.example.com/y", headers: [H("Origin", "https://app.example.com"), H("Cookie", `sid=${SECRETS.cookieSess}`)] }, { status: 200, headers: [H("Access-Control-Allow-Origin", "*"), H("Access-Control-Allow-Credentials", "true")] }),
        harEntry({ method: "GET", url: "https://api4.example.com/z" }, { status: 0 }),
        harEntry({ method: "GET", url: "https://api5.example.com/r" }, { status: 429, headers: [H("Retry-After", "30")] }),
        harEntry({ method: "POST", url: "https://api6.example.com/s" }, { status: 502, statusText: "Bad Gateway", headers: [H("x-request-id", "req-8f2a")] }),
        harEntry({ method: "POST", url: "https://api7.example.com/login" }, { status: 200, headers: [H("Set-Cookie", `session=${SECRETS.setCookie}; Path=/; SameSite=None`)] }),
        harEntry({ method: "GET", url: `https://api8.example.com/cb?access_token=${SECRETS.qsToken}` }, { status: 200 }),
        harEntry({ method: "GET", url: "http://api9.example.com/me", headers: [H("Authorization", `Bearer ${JWT_OK}`)] }, { status: 200 }),
        harEntry({ method: "GET", url: "https://img.example.com/a.png" }, { status: 200, content: { mimeType: "image/png", encoding: "base64", text: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } }),
      ],
    },
  };
  const rep = analyze(JSON.stringify(har), { now: NOW });
  const I = ids(rep);
  check("f_cors_method_not_allowed", I.includes("cors-method-not-allowed"), I.join(","));
  check("f_cors_header_not_allowed_authorization", rep.findings.some((f) => f.id === "cors-header-not-allowed" && f.title.includes("authorization")), I.join(","));
  const missing = rep.findings.find((f) => f.id === "cors-missing-allow-origin");
  check("f_cors_missing_aggregated", !!missing && missing.evidence[0].startsWith("Seen in 3 requests"), JSON.stringify(missing));
  check("f_cors_origin_mismatch", I.includes("cors-origin-mismatch"), I.join(","));
  check("f_cors_wildcard_credentials", I.includes("cors-wildcard-with-credentials"), I.join(","));
  check("f_status0", I.includes("no-response"), I.join(","));
  check("f_429_retry_after", rep.findings.some((f) => f.id === "http-429" && f.evidence.includes("Retry-After: 30")), I.join(","));
  check("f_5xx_request_id", rep.findings.some((f) => f.id === "http-5xx" && f.evidence.some((e) => e.includes("req-8f2a"))), I.join(","));
  check("f_samesite_none_insecure", I.includes("cookie-samesite-none-insecure"), I.join(","));
  check("f_session_cookie_not_httponly", I.includes("cookie-session-not-httponly"), I.join(","));
  check("f_credential_in_url", I.includes("credential-in-url"), I.join(","));
  check("f_plain_http_credentials", I.includes("plain-http-credentials"), I.join(","));
  check("f_har_binary_omitted", rep.sanitized.includes("[binary content omitted") && rep.notes.some((n) => n.includes("binary")), rep.notes.join("|"));
  let harValid = true;
  try {
    JSON.parse(rep.sanitized);
  } catch {
    harValid = false;
  }
  check("f_sanitized_har_is_valid_json", harValid);
  check("f_har_no_raw_cookie_or_token", !rep.sanitized.includes(SECRETS.cookieSess) && !rep.sanitized.includes(SECRETS.setCookie) && !rep.sanitized.includes(SECRETS.qsToken) && !rep.sanitized.includes(JWT_OK));
}
{
  const rep = analyze(`${JWT_NBF_SKEW}\n${JWT_NONE}\n${JWT_NO_EXP}`, { now: NOW });
  const I = ids(rep);
  check("f_nbf_future_skew", rep.findings.some((f) => f.id === "jwt-not-yet-valid" && f.why.includes("clock skew")), I.join(","));
  check("f_iat_future", I.includes("jwt-iat-future"), I.join(","));
  check("f_alg_none", I.includes("jwt-alg-none"), I.join(","));
  check("f_no_exp", I.includes("jwt-no-exp"), I.join(","));
}

// ---------------- Logs ----------------
{
  const log = [
    "2026-09-30T10:00:01Z INFO server started on port 8080",
    "2026-09-30T10:00:05Z ERROR Connection timeout after 3000 ms to 10.0.0.5:5432",
    "2026-09-30T10:00:06Z ERROR Connection timeout after 3012 ms to 10.0.0.6:5432",
    "2026-09-30T10:00:07Z ERROR Connection timeout after 2999 ms to 10.0.0.5:5432",
    "Exception in thread \"main\" java.lang.IllegalStateException: pool exhausted",
    "    at com.example.Pool.get(Pool.java:42)",
    "Caused by: java.net.SocketTimeoutException: connect timed out",
    "    at java.net.Socket.connect(Socket.java:1)",
    "Caused by: java.net.ConnectException: Connection refused",
    "    ... 12 more",
    "2026-09-30T10:00:09Z WARN retrying",
  ].join("\n");
  const s = summarizeLogs(new Redactor().redactText(log));
  const timeout = s.templates.find((t) => t.template.includes("Connection timeout"));
  check("log_template_grouping", !!timeout && timeout.count === 3, JSON.stringify(s.templates));
  check("log_root_cause_last_caused_by", s.exceptions.some((e) => e === "Root cause: java.net.ConnectException: Connection refused"), JSON.stringify(s.exceptions));
  check("log_time_range", s.firstTimestamp === "2026-09-30T10:00:01Z" && s.lastTimestamp === "2026-09-30T10:00:09Z", `${s.firstTimestamp} ${s.lastTimestamp}`);
  check("log_errors_first", s.templates[0].level === "error");
  const py = summarizeLogs("Traceback (most recent call last):\n  File \"app.py\", line 3, in <module>\n    main()\nKeyError: 'user_id'\n");
  check("log_python_traceback", py.exceptions.includes("KeyError: 'user_id'"), JSON.stringify(py.exceptions));
  check("template_masks_placeholder_index", toTemplate("token <JWT_1> rejected") === toTemplate("token <JWT_2> rejected"));
  const rep = analyze(log, { now: NOW });
  check("log_finding_emitted", rep.findings.some((f) => f.id === "log-errors" && f.evidence.some((e) => e.includes("ConnectException"))), JSON.stringify(rep.findings));
}

// ---------------- The critical safety test ----------------
{
  const everything = [
    `curl 'https://api.example.com/v1/me?access_token=${SECRETS.qsToken}' -H 'Authorization: Bearer ${JWT_EXPIRED}' -H 'x-api-key: ${SECRETS.apiKey}' -u admin:${SECRETS.curlPass} -b 'sid=${SECRETS.cookieSess}'`,
    "HTTP/1.1 401 Unauthorized",
    "Date: Wed, 30 Sep 2026 10:00:00 GMT",
    `Set-Cookie: sid=${SECRETS.setCookie}; Path=/; SameSite=None`,
    "",
    `{"error":"bad token for ${SECRETS.email}","client_secret":"${SECRETS.clientSecret}"}`,
    "",
    `DB_PASSWORD=${SECRETS.envPass}`,
    `DATABASE_URL=postgres://admin:${SECRETS.dbPass}@db.internal:5432/app`,
    `aws ${SECRETS.aws} ${SECRETS.gh} ${SECRETS.stripe} ${SECRETS.openai} ${SECRETS.anthropic}`,
    `2026-09-30T10:00:05Z ERROR login failed for ${SECRETS.email} from ${SECRETS.ip} card ${SECRETS.card} token=${SECRETS.logToken}`,
    `-----BEGIN PRIVATE KEY-----\n${SECRETS.pkBody}\n-----END PRIVATE KEY-----`,
    `json {"password":"${SECRETS.jsonPass}"}`,
  ].join("\n");
  const rep = analyze(everything, { now: NOW });
  const blobs = [JSON.stringify(rep), renderReport(rep, "ai"), renderReport(rep, "issue"), renderReport(rep, "plain")];
  const raws = [...Object.values(SECRETS), JWT_EXPIRED, Buffer.from(`admin:${SECRETS.curlPass}`).toString("base64")];
  const leaks: string[] = [];
  for (const raw of raws) for (const b of blobs) if (b.includes(raw)) leaks.push(raw.slice(0, 24));
  check("no_raw_secret_leaks_anywhere", leaks.length === 0, `leaked: ${[...new Set(leaks)].join(" | ")}`);
  check("render_has_trust_footer", renderReport(rep, "ai").includes("review before sharing"));
  check("render_issue_has_details", renderReport(rep, "issue").includes("<details>"));
  const again = analyze(everything, { now: NOW });
  check("deterministic_output", JSON.stringify(again) === JSON.stringify(rep));
}

{
  const rep = analyze(`login failed for ${SECRETS.email} from ${SECRETS.ip}`, { now: NOW });
  check("analyze_defaults_redact_email_and_ip", !rep.sanitized.includes(SECRETS.email) && !rep.sanitized.includes(SECRETS.ip), rep.sanitized);
  const rep2 = analyze(`login failed for ${SECRETS.email} from ${SECRETS.ip}`, { now: NOW, emails: false, ips: false });
  check("analyze_options_can_disable_pii", rep2.sanitized.includes(SECRETS.email) && rep2.sanitized.includes(SECRETS.ip), rep2.sanitized);
}

// ---------------- Built-in samples ----------------
{
  const byId = Object.fromEntries(DEBUG_SAMPLES.map((x) => [x.id, analyze(x.build(NOW), { now: NOW })]));
  const I = (id: string) => byId[id].findings.map((f) => f.id);
  check("sample_expired_token_findings", I("expired-token").includes("jwt-expired") && I("expired-token").includes("http-401"), I("expired-token").join(","));
  check("sample_expired_token_redacts", byId["expired-token"].redactions.some((r) => r.category === "JWT") && byId["expired-token"].redactions.some((r) => r.category === "SECRET") && byId["expired-token"].redactions.some((r) => r.category === "EMAIL"), JSON.stringify(byId["expired-token"].redactions));
  check("sample_cors_har_findings", ["cors-method-not-allowed", "cors-header-not-allowed", "cors-missing-allow-origin", "cookie-samesite-none-insecure", "http-5xx"].every((x) => I("cors-har").includes(x)), I("cors-har").join(","));
  check("sample_cors_har_password_redacted", !byId["cors-har"].sanitized.includes("correct-horse-battery-demo") && !byId["cors-har"].sanitized.includes("demo_s3ss10n_value_123"));
  const log = byId["java-log"];
  check("sample_java_log_root_cause", !!log.logs && log.logs.exceptions.some((e) => e.includes("PSQLException")), JSON.stringify(log.logs?.exceptions));
  check("sample_java_log_db_password_redacted", !log.sanitized.includes("demo-db-pass-2026") && log.sanitized.includes("orders:<PASSWORD_1>@"), log.sanitized.slice(0, 400));
  check("sample_java_log_grouped", !!log.logs && log.logs.distinctTemplates <= 8, String(log.logs?.distinctTemplates));
  check("samples_contain_no_provider_formats", DEBUG_SAMPLES.every((x) => !/ghp_|sk_live_|sk-proj-|AKIA|xox[bp]-|AIza/.test(x.build(NOW))));
}

// ---------------- Metrics (privacy) ----------------
{
  check("metrics_disabled_without_code", pixelUrl("debug-analyze", "") === "");
  const u = pixelUrl("debug-copy-ai", "devtoolshub");
  check("metrics_pixel_shape", /^https:\/\/devtoolshub\.goatcounter\.com\/count\?p=%2Fe%2Fdebug-copy-ai&e=true&rnd=[a-z0-9]+$/.test(u), u);
  check("metrics_rejects_unknown_event", pixelUrl("not-an-event" as never, "devtoolshub") === "");
}

// ---------------- Performance ----------------
{
  const lines: string[] = [];
  for (let i = 0; i < 20000; i++) lines.push(`2026-09-30T10:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z ${i % 50 === 0 ? "ERROR" : "INFO"} request ${i} took ${i % 900} ms user=u${i % 37} ip=10.1.${i % 250}.${i % 200}`);
  const t0 = Date.now();
  const rep = analyze(lines.join("\n"), { now: NOW });
  const ms = Date.now() - t0;
  check("perf_20k_lines_under_2500ms", ms < 2500, `${ms} ms`);
  check("perf_20k_lines_grouped", !!rep.logs && rep.logs.distinctTemplates < 10, String(rep.logs?.distinctTemplates));
  console.log(`      (20k-line log analysed in ${ms} ms)`);
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
