import { describe, expect, it } from "vitest";
import { countLikelySecrets, detectInput } from "./detect";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("detectInput", () => {
  it("detects a JWT", () => {
    expect(detectInput(JWT)[0]).toMatchObject({ toolId: "jwt-decoder", confidence: 0.95 });
  });

  it("detects a JWT with a Bearer prefix", () => {
    expect(detectInput(`Bearer ${JWT}`)[0].toolId).toBe("jwt-decoder");
  });

  it("detects a cURL command and prefers Debug Report", () => {
    const out = detectInput("curl 'https://api.example.com/v1/items' -H 'accept: application/json'");
    expect(out[0]).toMatchObject({ toolId: "debug-report", confidence: 0.9 });
  });

  it("drops curl-converter when the registry does not contain it", () => {
    const ids = new Set(["debug-report", "json-workbench"]);
    const out = detectInput("curl https://api.example.com", ids);
    expect(out.map((d) => d.toolId)).not.toContain("curl-converter");
  });

  it("suggests curl-converter once that tool exists", () => {
    const ids = new Set(["debug-report", "curl-converter"]);
    const out = detectInput("curl https://api.example.com", ids);
    expect(out.map((d) => d.toolId)).toEqual(["debug-report", "curl-converter"]);
  });

  it("detects a HAR file as Debug Report, not as plain JSON", () => {
    const har = JSON.stringify({ log: { entries: [{ request: { url: "https://api.example.com/v1/orders" } }] } });
    expect(detectInput(har)[0]).toMatchObject({ toolId: "debug-report", confidence: 0.95 });
  });

  it("detects plain JSON", () => {
    expect(detectInput('{"a": 1, "b": [2, 3]}')[0]).toMatchObject({ toolId: "json-workbench", confidence: 0.9 });
  });

  it("does not call a bare number JSON", () => {
    const out = detectInput("1234567890123");
    expect(out.map((d) => d.toolId)).toEqual(["timestamp-converter"]);
  });

  it("detects an HTTP message", () => {
    expect(detectInput("GET /v1/orders HTTP/1.1\nHost: api.example.com").map((d) => d.toolId)).toContain("debug-report");
  });

  it("detects a response status line", () => {
    expect(detectInput("HTTP/1.1 401 Unauthorized\ncontent-type: application/json").map((d) => d.toolId)).toContain("debug-report");
  });

  it("detects a log", () => {
    const log = "2026-10-24T07:01:47.000Z ERROR failed\n2026-10-24T07:01:48.000Z ERROR retry\n2026-10-24T07:01:49.000Z WARN giving up";
    expect(detectInput(log).map((d) => d.toolId)).toContain("debug-report");
  });

  it("detects Unix timestamps in seconds and milliseconds", () => {
    expect(detectInput("1792825007")[0]).toMatchObject({ toolId: "timestamp-converter", confidence: 0.9 });
    expect(detectInput("1792825007000")[0]).toMatchObject({ toolId: "timestamp-converter", confidence: 0.9 });
  });

  it("detects URL-encoded text with an explicit hint", () => {
    const out = detectInput("hello%20world%21%20from%20a%20test");
    expect(out[0]).toMatchObject({ toolId: "encode-generate", hint: "url" });
  });

  it("detects Base64 with an explicit hint", () => {
    const out = detectInput("aGVsbG8gd29ybGQhISE=");
    expect(out[0]).toMatchObject({ toolId: "encode-generate", hint: "base64" });
  });

  it("detects a regex literal", () => {
    expect(detectInput("/^abc+$/")[0]).toMatchObject({ toolId: "regex-tester", confidence: 0.5 });
  });

  it("detects a regex literal with flags", () => {
    expect(detectInput("/foo/gi")[0]).toMatchObject({ toolId: "regex-tester", confidence: 0.5 });
  });

  it("does not treat a plain path as a regex", () => {
    expect(detectInput("/usr/bin").map((d) => d.toolId)).not.toContain("regex-tester");
  });

  it("returns nothing for ordinary prose", () => {
    expect(detectInput("Please fix the login page, it is slow today.")).toEqual([]);
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(detectInput("")).toEqual([]);
    expect(detectInput("   \n\t ")).toEqual([]);
  });

  it("returns at most three suggestions, highest confidence first", () => {
    const mixed = `curl http://x\nHTTP/1.1 500 Error\n${JWT}`;
    const out = detectInput(mixed);
    expect(out.length).toBeLessThanOrEqual(3);
    const confidences = out.map((d) => d.confidence);
    expect([...confidences].sort((a, b) => b - a)).toEqual(confidences);
  });

  it("only returns tools that are available", () => {
    const out = detectInput('{"a":1}', new Set(["jwt-decoder"]));
    expect(out).toEqual([]);
  });

  it("never throws on random input", () => {
    const alphabet = "{}[]()<>/\\\"'`%$#@!*_-+=|\n\r\t 0123456789aAzZ\u00e9\u4e2d\u{1f600}";
    for (let i = 0; i < 1000; i++) {
      let s = "";
      const len = Math.floor(Math.random() * 120);
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(() => detectInput(s)).not.toThrow();
      expect(() => countLikelySecrets(s)).not.toThrow();
    }
  });

  it("handles a 2 MB paste in under 300 ms", () => {
    const big = `{"items": [${"{" + '"id": 1, "name": "item", "ok": true},'.repeat(60_000)}{}]}`;
    expect(big.length).toBeGreaterThan(2_000_000);
    const start = performance.now();
    detectInput(big);
    expect(performance.now() - start).toBeLessThan(300);
  });

  describe("URL (T-204)", () => {
    it("detects a bare http(s) URL as the top suggestion", () => {
      const out = detectInput("https://example.com/v1/items?page=2");
      expect(out[0]).toMatchObject({ toolId: "url-parser", confidence: 0.8 });
    });

    it("stays below the cURL rules when the URL is part of a command", () => {
      const out = detectInput("curl https://api.example.com/v1/me -H 'accept: application/json'");
      expect(out[0].toolId).toBe("debug-report");
      expect(out.some((d) => d.toolId === "url-parser")).toBe(false);
    });

    it("does not fire on a log line that merely mentions a URL", () => {
      const out = detectInput("2026-10-25T10:00:00 GET https://api.example.com/v1/items 500 in 42ms");
      expect(out.some((d) => d.toolId === "url-parser")).toBe(false);
    });

    it("does not fire on a multi-line paste", () => {
      const out = detectInput("https://a.example.com/one\nhttps://b.example.com/two");
      expect(out.some((d) => d.toolId === "url-parser")).toBe(false);
    });

    it("still offers the URL for a URL that also looks percent-encoded", () => {
      const out = detectInput("https://example.com/s?q=a%20b%20c%20d");
      expect(out[0].toolId).toBe("url-parser");
      expect(out.some((d) => d.toolId === "encode-generate")).toBe(true);
    });

    it("ignores schemeless text", () => {
      expect(detectInput("localhost:3000").some((d) => d.toolId === "url-parser")).toBe(false);
    });
  });

  describe("YAML (T-201)", () => {
    const hasYaml = (text: string) => detectInput(text).some((d) => d.toolId === "yaml-json" && d.confidence === 0.65);

    it("detects a flat mapping", () => {
      expect(hasYaml("a: 1\nb: 2")).toBe(true);
    });

    it("detects a Kubernetes manifest, which starts with a comment and has bare parent keys", () => {
      const manifest = `# kubernetes-style manifest\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\n  labels:\n    app: demo\nspec:\n  ports:\n    - 80\n    - 443\n  enabled: yes\n`;
      expect(detectInput(manifest).some((d) => d.toolId === "yaml-json")).toBe(true);
      expect(detectInput(manifest)[0].toolId).toBe("yaml-json");
    });

    it("detects a document that opens with ---", () => {
      expect(hasYaml("---\nserver:\n  host: localhost\n  port: 8080\n")).toBe(true);
    });

    it("does not fire on JSON, which is a superset of YAML", () => {
      expect(detectInput('{\n  "a": 1,\n  "b": 2\n}').some((d) => d.toolId === "yaml-json")).toBe(false);
    });

    it("needs at least two structural lines", () => {
      expect(hasYaml("a: 1")).toBe(false);
      expect(hasYaml("a: 1\n\n  \n")).toBe(false);
    });

    it("does not fire on prose", () => {
      expect(hasYaml("Please fix the login page\nit is slow today\nand the logo is crooked")).toBe(false);
    });

    it("does fire on a bare bulleted list, because that is a valid YAML sequence", () => {
      // Spec'd behaviour, recorded here rather than suppressed: `- x` is the YAML
      // sequence form, and yamlToJson really does turn it into ["x", …].
      expect(hasYaml("- buy milk\n- call the dentist\n- ship the release")).toBe(true);
    });

    it("does not fire on an HTTP message, which Debug Report already claims", () => {
      const http = "GET /v1/items HTTP/1.1\nHost: api.example.com\nAccept: application/json";
      const out = detectInput(http);
      expect(out.some((d) => d.toolId === "yaml-json")).toBe(false);
      expect(out[0].toolId).toBe("debug-report");
    });

    it("does not fire on a timestamped log line", () => {
      expect(hasYaml("2026-10-22T10:00:00 ERROR boom\n2026-10-22T10:00:01 WARN retry\n2026-10-22T10:00:02 ERROR boom again")).toBe(
        false
      );
    });

    it("stays under the tools that have a stronger signature", () => {
      const out = detectInput("a: 1\nb: 2\n");
      expect(out.some((d) => d.toolId === "json-workbench")).toBe(false);
    });
  });
});

describe("countLikelySecrets", () => {
  it("counts a JWT and names its category", () => {
    const out = countLikelySecrets(`Authorization: Bearer ${JWT}`);
    expect(out.total).toBeGreaterThan(0);
    expect(out.categories.join(" ")).toMatch(/JWT/i);
  });

  it("counts an email and an IP", () => {
    const out = countLikelySecrets("From: someone@example.com via 203.0.113.9");
    expect(out.total).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty result for no secrets", () => {
    expect(countLikelySecrets("just some ordinary words")).toEqual({ total: 0, categories: [] });
  });

  it("returns an empty result for empty input", () => {
    expect(countLikelySecrets("")).toEqual({ total: 0, categories: [] });
  });
});
