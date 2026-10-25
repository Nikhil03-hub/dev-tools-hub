import { describe, expect, it } from "vitest";
import { buildUrl, parseUrlText, type UrlParts } from "./url";

const FULL = "https://u:p@example.com:8080/a/b?x=1&y=%20z#frag";

function parts(text: string): UrlParts {
  const r = parseUrlText(text);
  if (!r.ok) throw new Error(`expected success, got: ${r.error.message}`);
  return r.value;
}
function errorOf(text: string): string {
  const r = parseUrlText(text);
  if (r.ok) throw new Error("expected an error");
  return r.error.message;
}

describe("parseUrlText — the spec's examples", () => {
  it("splits the full URL exactly as specified", () => {
    const p = parts(FULL);
    expect(p.hostname).toBe("example.com");
    expect(p.port).toBe("8080");
    expect(p.segments).toEqual(["a", "b"]);
    expect(p.query).toEqual([
      { key: "x", value: "1" },
      { key: "y", value: " z" },
    ]);
    expect(p.hash).toBe("#frag");
    expect(p.protocol).toBe("https:");
    expect(p.username).toBe("u");
    expect(p.password).toBe("p");
    expect(p.origin).toBe("https://example.com:8080");
  });

  it("emits exactly one warning for that URL — the credentials", () => {
    const p = parts(FULL);
    expect(p.warnings).toEqual(["Contains a username/password — avoid sharing this URL."]);
  });

  it("adds the scheme to a bare host", () => {
    expect(parts("example.com/path").href).toBe("https://example.com/path");
  });

  it("refuses text that is not a URL", () => {
    expect(errorOf("not a url")).toBe("This isn't a valid URL.");
    expect(errorOf("http://")).toBe("This isn't a valid URL.");
  });

  it("asks for input when there is none", () => {
    expect(errorOf("   ")).toBe("Paste a URL to break it down.");
  });

  it("round-trips the first example byte for byte", () => {
    expect(buildUrl(parts(FULL))).toBe(FULL);
  });
});

describe("parseUrlText — warnings", () => {
  it("flags a query key that names a secret", () => {
    const p = parts("https://api.example.com/cb?token=abc123&state=ok");
    expect(p.warnings).toContain("Query parameter 'token' looks like a secret.");
    expect(p.warnings).not.toContain("Query parameter 'state' looks like a secret.");
  });

  it("does not flag an ordinary key", () => {
    expect(parts("https://example.com/s?q=shoes&page=2").warnings).toEqual([]);
  });

  it("reports a repeated parameter once", () => {
    const p = parts("https://example.com/f?a=1&a=2&a=3");
    expect(p.query).toHaveLength(3);
    expect(p.warnings.filter((w) => w === "Duplicate parameter 'a'.")).toHaveLength(1);
  });

  it("keeps duplicate values in order rather than merging them", () => {
    expect(parts("https://example.com/f?tag=x&tag=y").query).toEqual([
      { key: "tag", value: "x" },
      { key: "tag", value: "y" },
    ]);
  });

  it("warns about credentials even without a port", () => {
    expect(parts("https://admin:s3cret@mail.example.com/inbox").warnings[0]).toMatch(/username\/password/);
  });
});

describe("parseUrlText — shapes that differ from the common case", () => {
  it("handles an IPv6 host", () => {
    const p = parts("http://[::1]:3000/health");
    expect(p.hostname).toBe("[::1]");
    expect(p.port).toBe("3000");
    expect(p.segments).toEqual(["health"]);
  });

  it("handles a scheme with no host", () => {
    const p = parts("mailto:someone@example.com");
    expect(p.protocol).toBe("mailto:");
    expect(p.hostname).toBe("");
    expect(p.pathname).toBe("someone@example.com");
  });

  it("lowercases and punycodes hosts the way the URL standard does", () => {
    const p = parts("https://Bücher.example/lookups");
    expect(p.hostname).toBe("xn--bcher-kva.example");
  });

  it("adds a trailing slash to a bare origin", () => {
    expect(parts("https://example.com").pathname).toBe("/");
    expect(parts("https://example.com").segments).toEqual([]);
  });

  it("preserves an encoded path segment", () => {
    expect(parts("https://example.com/a%20b/c").segments).toEqual(["a%20b", "c"]);
  });

  it("decodes a plus in a query value as a space", () => {
    // Documented behaviour of application/x-www-form-urlencoded semantics, which
    // the URL standard applies to query strings.
    expect(parts("https://example.com/s?q=a+b").query).toEqual([{ key: "q", value: "a b" }]);
  });

  it("reads localhost:3000 as a host and port, not as a scheme", () => {
    // The URL standard alone would call this protocol "localhost:"; nobody
    // pasting it means that.
    const p = parts("localhost:3000");
    expect(p.hostname).toBe("localhost");
    expect(p.port).toBe("3000");
    expect(p.href).toBe("https://localhost:3000/");
    expect(parts("LOCALHOST:3000/api").hostname).toBe("localhost");
  });

  it("still treats an unusual scheme as a scheme", () => {
    expect(parts("chrome-extension://abcdef/popup.html").protocol).toBe("chrome-extension:");
    expect(parts("data:text/plain,hi").protocol).toBe("data:");
  });

  it("accepts a protocol-relative URL", () => {
    expect(parts("//example.com/x").href).toBe("https://example.com/x");
  });
});

describe("buildUrl", () => {
  const base = {
    protocol: "https:",
    username: "",
    password: "",
    hostname: "example.com",
    port: "",
    pathname: "/a",
    query: [] as { key: string; value: string }[],
    hash: "",
  };

  it("omits the query marker when there are no parameters", () => {
    expect(buildUrl(base)).toBe("https://example.com/a");
  });

  it("encodes keys and values, keeping spaces as %20", () => {
    expect(buildUrl({ ...base, query: [{ key: "q", value: "a b" }] })).toBe("https://example.com/a?q=a%20b");
  });

  it("keeps a repeated key as repeated entries", () => {
    expect(buildUrl({ ...base, query: [{ key: "t", value: "1" }, { key: "t", value: "2" }] })).toBe(
      "https://example.com/a?t=1&t=2"
    );
  });

  it("normalises a hash and a path that lack their leading characters", () => {
    expect(buildUrl({ ...base, hash: "top" })).toBe("https://example.com/a#top");
    expect(buildUrl({ ...base, pathname: "a/b" })).toBe("https://example.com/a/b");
  });

  it("restores credentials and port", () => {
    expect(buildUrl({ ...base, username: "u", password: "p", port: "8080" })).toBe(
      "https://u:p@example.com:8080/a"
    );
  });

  it("escapes characters that would otherwise change the structure", () => {
    const p = { ...base, query: [{ key: "a&b", value: "c=d" }] };
    expect(buildUrl(p)).toBe("https://example.com/a?a%26b=c%3Dd");
    // Re-parsing must therefore recover exactly the same pair.
    const back = parseUrlText(buildUrl(p));
    if (!back.ok) throw new Error("expected success");
    expect(back.value.query).toEqual([{ key: "a&b", value: "c=d" }]);
  });

  it("round-trips semantically for every parsed example", () => {
    for (const text of [
      FULL,
      "https://example.com/a?x=1&y=2",
      "http://[::1]:3000/health",
      "https://example.com/path",
      "example.com/path",
    ]) {
      const p = parts(text);
      const rebuilt = parts(buildUrl(p));
      expect(rebuilt.query).toEqual(p.query);
      expect(rebuilt.hostname).toBe(p.hostname);
      expect(rebuilt.port).toBe(p.port);
      expect(rebuilt.pathname).toBe(p.pathname);
      expect(rebuilt.hash).toBe(p.hash);
      expect(rebuilt.warnings).toEqual(p.warnings);
    }
  });
});

describe("parseUrlText — input it must never choke on", () => {
  it("handles a long URL without throwing", () => {
    const long = `https://example.com/p?${"a=1&".repeat(5_000)}z=9`;
    const p = parts(long);
    expect(p.query.length).toBeGreaterThan(5_000);
  });

  it("handles unicode, emoji and control-ish whitespace", () => {
    expect(() => parseUrlText("  https://example.com/🚀?q=café\u00a0 ")).not.toThrow();
    expect(errorOf("\n\t")).toBe("Paste a URL to break it down.");
  });

  it("never throws on arbitrary text", () => {
    const alphabet = "{}[]()<>/\\\"'`%$#@!*_-+=|\n\r\t 0123456789aAzZé中🚀:;.,?#&=";
    for (let i = 0; i < 500; i++) {
      let s = "";
      const len = Math.floor(Math.random() * 80);
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(() => parseUrlText(s)).not.toThrow();
    }
  });
});
