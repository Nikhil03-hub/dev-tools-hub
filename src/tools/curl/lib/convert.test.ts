import { describe, expect, it } from "vitest";
import { convertCurl, type CurlTarget } from "./convert";

const CMD = `curl -X POST https://api.example.com/v1/items -H 'Content-Type: application/json' -d '{"name":"x"}'`;

const FETCH_EXACT = `const response = await fetch("https://api.example.com/v1/items", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    "name": "x"
  })
});
const data = await response.text();`;

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

const code = (cmd: string, target: CurlTarget, redact = true) => {
  const r = convertCurl(cmd, target, { redact });
  if (!r.ok) throw new Error(`expected success, got: ${r.error.message}`);
  return r.value;
};
const errorOf = (cmd: string, redact = true) => {
  const r = convertCurl(cmd, "fetch", { redact });
  if (r.ok) throw new Error("expected an error");
  return r.error.message;
};

describe("convertCurl — the spec's exact example", () => {
  it("emits the fetch template byte for byte", () => {
    expect(code(CMD, "fetch").code).toBe(FETCH_EXACT);
  });

  it("adds no redaction note when nothing was a secret", () => {
    const r = code(CMD, "fetch");
    expect(r.redactions).toBe(0);
    expect(r.notes).toEqual([]);
  });

  it("emits the same request for every target", () => {
    for (const t of ["axios", "python", "go"] as CurlTarget[]) {
      const out = code(CMD, t).code;
      expect(out).toContain("api.example.com/v1/items");
      expect(out).toContain("application/json");
      expect(out).toContain("x");
    }
  });
});

describe("convertCurl — errors the spec names", () => {
  it("asks for a command when there is nothing", () => {
    expect(errorOf("")).toBe("Paste a cURL command.");
    expect(errorOf("   \n  \t ")).toBe("Paste a cURL command.");
  });

  it("refuses text that is not a cURL command", () => {
    expect(errorOf("GET /v1/me HTTP/1.1\nHost: api.example.com")).toBe("This doesn't look like a cURL command.");
    expect(errorOf('{"a":1}')).toBe("This doesn't look like a cURL command.");
    expect(errorOf("echo curl")).toBe("This doesn't look like a cURL command.");
  });

  it("accepts a prompt prefix and curl.exe", () => {
    expect(code("$ curl https://only.example.com/a", "fetch").code).toContain("only.example.com/a");
    expect(code("curl.exe https://only.example.com/a", "fetch").code).toContain("only.example.com/a");
  });
});

describe("convertCurl — redaction", () => {
  const bearer = `curl https://api.example.com/me -H 'authorization: Bearer ${TOKEN}'`;

  it("replaces a bearer token with a placeholder and never leaks it", () => {
    const r = code(bearer, "fetch");
    expect(r.code).not.toContain(TOKEN);
    expect(r.code).toMatch(/"authorization": "Bearer <[A-Z_]+_\d+>"/);
    expect(r.redactions).toBe(1);
    expect(r.notes).toContain("Redacted 1 value.");
  });

  it("keeps the real token when redaction is off", () => {
    expect(code(bearer, "fetch", false).code).toContain(TOKEN);
    expect(code(bearer, "fetch", false).redactions).toBe(0);
  });

  it("never lets -u credentials through, in any target", () => {
    for (const t of ["fetch", "axios", "python", "go"] as CurlTarget[]) {
      const out = code("curl -u user:pass https://api.example.com/v1/me", t);
      expect(out.code).not.toContain("pass");
      expect(out.code).not.toContain("dXNlcjpwYXNz"); // base64 of user:pass
      expect(out.redactions).toBeGreaterThanOrEqual(1);
    }
  });

  it("redacts a cookie jar value but keeps the cookie names", () => {
    const out = code(`curl 'https://api.example.com/me' -b 'sid=abc123; theme=dark'`, "fetch");
    expect(out.code).toContain("sid=<COOKIE_1>");
    expect(out.code).toContain("theme=<COOKIE_2>");
    expect(out.code).not.toContain("abc123");
  });

  it("redacts an API-key header copied from a browser", () => {
    const cmd = 'curl ^"https://api.example.com/v1/me^" ^\n  -H ^"accept: */*^" ^\n  -H ^"x-api-key: abcDEF123456^"';
    const out = code(cmd, "axios");
    expect(out.code).not.toContain("abcDEF123456");
    expect(out.code).toContain('"x-api-key": "<SECRET_1>"');
    // cmd-style continuation must not lose the ordinary header either.
    expect(out.code).toContain('"accept": "*/*"');
  });

  it("honours the emails and ips switches", () => {
    const cmd = `curl 'https://api.example.com/meg?reporter=a.b@example.com&host=10.1.2.3'`;
    expect(code(cmd, "fetch").code).toContain("<EMAIL_1>");
    expect(code(cmd, "fetch").code).toContain("<IP_1>");
    const loose = convertCurl(cmd, "fetch", { redact: true, emails: false, ips: false });
    if (!loose.ok) throw new Error("expected success");
    expect(loose.value.code).toContain("a.b@example.com");
    expect(loose.value.code).toContain("10.1.2.3");
  });

  it("does not redact a shell variable reference, because a name is not a secret", () => {
    const out = code('curl -H "authorization: Bearer $TOKEN" https://api.example.com/me', "fetch");
    expect(out.code).toContain("Bearer $TOKEN");
    expect(out.redactions).toBe(0);
    expect(out.notes.some((n) => /kept exactly as written/.test(n))).toBe(true);
  });

  it("still redacts a value that only partly looks like a reference", () => {
    const out = code('curl -H "authorization: Bearer abc$TOKEN" https://api.example.com/me', "fetch");
    expect(out.code).not.toContain("abc$TOKEN");
  });

  it("redacts inside a JSON body by structure, keeping the field names", () => {
    const cmd = `curl -X POST https://api.example.com/login -H 'Content-Type: application/json' -d '{"email":"me@corp.com","password":"hunter2","user":"bob"}'`;
    const out = code(cmd, "fetch");
    expect(out.code).toContain('"password": "<PASSWORD_1>"');
    expect(out.code).not.toContain("hunter2");
    expect(out.code).toContain('"user": "bob"');
  });

  it("counts each distinct secret once per occurrence", () => {
    // Values shorter than four characters are deliberately left alone by the
    // Redactor (precision over recall), so these are realistic lengths.
    const cmd = `curl https://api.example.com/me -H 'x-api-key: key-9f3a7b2c' -H 'cookie: sid=abcdef123456'`;
    expect(code(cmd, "fetch").redactions).toBe(2);
  });
});

describe("convertCurl — what is reported rather than dropped", () => {
  it("lists options it did not carry over", () => {
    const out = code(`curl https://api.example.com/me --compressed -k -m 30`, "fetch");
    expect(out.notes.join(" ")).toMatch(/Ignored cURL options.*--compressed.*-k.*-m/);
  });

  it("says so when the command sends multipart form data", () => {
    const out = code(`curl -F 'name=bob' https://api.example.com/upload`, "fetch");
    expect(out.notes.join(" ")).toContain("multipart form data");
  });

  it("joins a repeated header instead of silently keeping the last one", () => {
    const out = code(`curl https://api.example.com/me -H 'accept: a' -H 'accept: b'`, "fetch");
    expect(out.code).toContain('"accept": "a, b"');
    expect(out.notes.join(" ")).toContain("joined with a comma");
  });

  it("warns when a JSON-labelled body is not JSON", () => {
    const out = code(`curl -H 'Content-Type: application/json' -d 'plain text' https://api.example.com/x`, "fetch");
    expect(out.code).toContain('body: "plain text"');
    expect(out.notes.join(" ")).toContain("does not parse");
  });

  it("says when no URL was found", () => {
    const out = code(`curl -H 'accept: */*'`, "fetch");
    expect(out.notes.join(" ")).toContain("No URL found");
  });

  it("repeats a per-occurrence note only once", () => {
    const out = code(`curl -F 'a=1' -F 'b=2' https://api.example.com/upload`, "fetch");
    expect(out.notes.filter((n) => n.startsWith("Multipart form fields")).length).toBe(1);
  });

  it("never puts a secret value into a note", () => {
    const out = code(`curl -u user:secretphrase https://api.example.com/me -H 'x-api-key: TOPSECRET123'`, "fetch");
    for (const note of out.notes) {
      expect(note).not.toContain("secretphrase");
      expect(note).not.toContain("TOPSECRET123");
    }
  });
});

describe("convertCurl — each target's shape", () => {
  it("leaves the options object off a bare GET", () => {
    expect(code("curl https://only.example.com/a", "fetch").code).toBe(
      `const response = await fetch("https://only.example.com/a");\nconst data = await response.text();`
    );
  });

  it("uses axios's lowercase method convention", () => {
    const out = code(CMD, "axios").code;
    expect(out).toContain('method: "post"');
    expect(out).toContain("const response = await axios({");
    expect(out).toContain("const data = response.data;");
  });

  it("omits the method line for GET but keeps it for HEAD", () => {
    expect(code("curl https://only.example.com/a", "fetch").code).not.toContain("method:");
    expect(code("curl -I https://only.example.com/a", "fetch").code).toContain('method: "HEAD"');
  });

  it("emits Python literals, not JSON", () => {
    const cmd = `curl -X POST https://api.example.com/x -H 'Content-Type: application/json' -d '{"active":true,"n":null,"list":[1,2]}'`;
    const out = code(cmd, "python").code;
    expect(out).toContain("import requests");
    expect(out).toContain("response = requests.post(");
    expect(out).toContain('"active": True');
    expect(out).toContain('"n": None');
    expect(out).not.toContain(": true");
    expect(out).toContain("print(response.status_code, response.text)");
  });

  it("falls back to requests.request for a verb the module has no helper for", () => {
    const out = code("curl -X PROPFIND https://only.example.com/a", "python").code;
    expect(out).toContain("requests.request(");
    expect(out).toContain('"PROPFIND",');
  });

  it("imports strings in Go only when there is a body", () => {
    expect(code(CMD, "go").code).toContain('"strings"');
    expect(code("curl https://only.example.com/a", "go").code).not.toContain('"strings"');
    expect(code(CMD, "go").code).toContain("strings.NewReader(");
    expect(code("curl https://only.example.com/a", "go").code).toContain("http.NewRequest(\"GET\", \"https://only.example.com/a\", nil)");
  });

  it("keeps tabs and error checks in the Go output", () => {
    const out = code(CMD, "go").code;
    expect(out).toContain("package main");
    expect(out).toContain("\tif err != nil {");
    expect(out).toContain("defer resp.Body.Close()");
    expect(out).toContain("req.Header.Add(");
  });

  it("keeps a query string with ampersands intact", () => {
    expect(code(`curl 'https://api.example.com/v1/search?q=a%20b&limit=10'`, "fetch").code).toContain("q=a%20b&limit=10");
  });

  it("carries unicode through every target", () => {
    const cmd = `curl -X POST https://api.example.com/x -H 'Content-Type: application/json' -d '{"note":"héllo 🌍 中文"}'`;
    for (const t of ["fetch", "axios", "python", "go"] as CurlTarget[]) {
      expect(code(cmd, t).code).toContain("héllo 🌍 中文");
    }
  });

  it("understands a bash multi-line continuation", () => {
    const cmd = "curl -X POST https://api.example.com/v1/items \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"x\"}'";
    expect(code(cmd, "fetch").code).toBe(FETCH_EXACT);
  });
});
