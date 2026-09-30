// Built-in samples for the Debug Report "Load sample" menu.
//
// Rules for samples (important once the repo is public):
//  - Every "secret" is obviously fake and uses NO real provider format
//    (no ghp_/sk_live_/AKIA…), so GitHub secret scanning / push protection
//    never flags the repo and nobody mistakes them for leaked keys.
//  - Times are generated relative to "now" so the expired-token story is
//    always true whenever someone clicks the sample.
//  - Emails use example.com; IPs use the 203.0.113.0/24 documentation range.

function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "RS256", typ: "JWT", kid: "demo-key-1" })}.${b64url(payload)}.ZmFrZS1zaWduYXR1cmUtZm9yLWRlbW8tb25seQ`;
}

export interface DebugSample {
  id: "expired-token" | "cors-har" | "java-log";
  label: string;
  description: string;
  build: (nowMs?: number) => string;
}

export const DEBUG_SAMPLES: DebugSample[] = [
  {
    id: "expired-token",
    label: "401 with an expired token (cURL + response)",
    description: "A request copied from DevTools and the 401 the API sent back.",
    build: (nowMs = Date.now()) => {
      const now = Math.floor(nowMs / 1000);
      const token = fakeJwt({
        sub: "user_8f21c",
        email: "asha.verma@example.com",
        iss: "https://auth.example.com/",
        aud: "https://api.example.com",
        scope: "orders:read",
        iat: now - 3900,
        exp: now - 300,
      });
      return [
        "curl 'https://api.example.com/v2/orders?page=2' \\",
        "  -H 'accept: application/json' \\",
        `  -H 'authorization: Bearer ${token}' \\`,
        "  -H 'x-api-key: demo_key_not_real_1234567890'",
        "HTTP/2 401",
        `date: ${new Date(nowMs).toUTCString()}`,
        "content-type: application/json",
        'www-authenticate: Bearer realm="api", error="invalid_token", error_description="jwt expired"',
        "x-request-id: 7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "",
        '{"message":"Unauthorized","hint":"token rejected for asha.verma@example.com"}',
      ].join("\n");
    },
  },
  {
    id: "cors-har",
    label: "CORS failure in a browser session (HAR)",
    description: "A trimmed HAR export: a failing preflight, a blocked GET and a cookie the browser drops.",
    build: (nowMs = Date.now()) => {
      const started = new Date(nowMs - 60_000).toISOString();
      const origin = "https://app.example.com";
      const h = (name: string, value: string) => ({ name, value });
      const entry = (req: Record<string, unknown>, res: Record<string, unknown>) => ({
        startedDateTime: started,
        time: 84,
        request: { httpVersion: "HTTP/2", headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0, ...req },
        response: { httpVersion: "HTTP/2", headers: [], cookies: [], content: { size: 0, mimeType: "application/json", text: "" }, redirectURL: "", headersSize: -1, bodySize: 0, ...res },
        cache: {},
        timings: { send: 0, wait: 80, receive: 4 },
      });
      const har = {
        log: {
          version: "1.2",
          creator: { name: "WebInspector", version: "537.36" },
          pages: [],
          entries: [
            entry(
              { method: "POST", url: "https://api.example.com/v2/session", headers: [h("Origin", origin), h("Content-Type", "application/json")], postData: { mimeType: "application/json", text: '{"email":"dev.user@example.com","password":"correct-horse-battery-demo"}' } },
              { status: 200, statusText: "OK", headers: [h("Access-Control-Allow-Origin", origin), h("Access-Control-Allow-Credentials", "true"), h("Set-Cookie", "session_id=demo_s3ss10n_value_123; Path=/; SameSite=None")], content: { size: 17, mimeType: "application/json", text: '{"ok":true}' } },
            ),
            entry(
              { method: "OPTIONS", url: "https://api.example.com/v2/orders/42", headers: [h("Origin", origin), h("Access-Control-Request-Method", "PATCH"), h("Access-Control-Request-Headers", "authorization, content-type")] },
              { status: 204, statusText: "No Content", headers: [h("Access-Control-Allow-Origin", origin), h("Access-Control-Allow-Methods", "GET, POST"), h("Access-Control-Allow-Headers", "content-type")] },
            ),
            entry(
              { method: "GET", url: "https://api.example.com/v2/orders?status=open", headers: [h("Origin", origin), h("Cookie", "session_id=demo_s3ss10n_value_123; theme=dark")] },
              { status: 500, statusText: "Internal Server Error", headers: [h("Content-Type", "application/json"), h("x-request-id", "req-4d2f9a")], content: { size: 60, mimeType: "application/json", text: '{"error":"db timeout","host":"203.0.113.24"}' } },
            ),
          ],
        },
      };
      return JSON.stringify(har, null, 2);
    },
  },
  {
    id: "java-log",
    label: "Service log with a stack trace",
    description: "A Spring-style service log: repeated timeouts, then a crash with a Caused-by chain.",
    build: (nowMs = Date.now()) => {
      const t = (offsetSec: number) => new Date(nowMs - 120_000 + offsetSec * 1000).toISOString();
      const lines = [
        `${t(0)} INFO  [main] o.s.b.StartupInfoLogger : Started OrdersApplication in 4.2 seconds`,
        `${t(1)} INFO  [main] c.e.config.Db : Connecting to jdbc:postgresql://orders:demo-db-pass-2026@203.0.113.40:5432/orders`,
      ];
      for (let i = 0; i < 12; i++) {
        lines.push(`${t(5 + i * 3)} WARN  [http-nio-8080-exec-${(i % 4) + 1}] c.e.orders.Repo : Query took ${2900 + i * 17} ms (user=u${100 + i}, order=${5000 + i})`);
      }
      for (let i = 0; i < 6; i++) {
        lines.push(`${t(45 + i * 2)} ERROR [http-nio-8080-exec-${(i % 4) + 1}] c.e.orders.Api : Request failed after ${3000 + i * 11} ms for dev.user@example.com`);
      }
      lines.push(
        'Exception in thread "http-nio-8080-exec-3" org.springframework.dao.DataAccessResourceFailureException: Unable to acquire JDBC Connection',
        "    at org.springframework.orm.jpa.vendor.HibernateJpaDialect.convertHibernateAccessException(HibernateJpaDialect.java:275)",
        "    at com.example.orders.Repo.findOpen(Repo.java:88)",
        "Caused by: com.zaxxer.hikari.pool.HikariPool$PoolInitializationException: Connection is not available, request timed out after 30000ms",
        "    at com.zaxxer.hikari.pool.HikariPool.createTimeoutException(HikariPool.java:696)",
        "Caused by: org.postgresql.util.PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections",
        "    ... 42 more",
        `${t(70)} INFO  [main] c.e.health : Health check DOWN (db)`,
      );
      return lines.join("\n");
    },
  },
];
