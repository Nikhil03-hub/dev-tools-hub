import { describe, expect, it } from "vitest";
import { legacyRedirect, normalizePath, parseRoute, type RouteTables } from "./router";

const T: RouteTables = {
  slugToId: { "json-formatter": "json-workbench", "debug-report": "debug-report" },
  legacyHashToSlug: { json: "json-formatter", debug: "debug-report" },
  pages: ["privacy", "about"],
};

describe("normalizePath", () => {
  it("adds slashes, lower-cases and drops index.html", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/JSON-Formatter")).toBe("/json-formatter/");
    expect(normalizePath("/json-formatter/index.html")).toBe("/json-formatter/");
    expect(normalizePath("//a//b")).toBe("/a/b/");
    expect(normalizePath("/404.html")).toBe("/404.html");
  });
  it("survives malformed escapes", () => {
    expect(normalizePath("/%E0%A4%A")).toBe("/%e0%a4%a/");
  });
});

describe("parseRoute", () => {
  it("maps home, tools, pages and unknowns", () => {
    expect(parseRoute("/", T)).toEqual({ kind: "home" });
    expect(parseRoute("/index.html", T)).toEqual({ kind: "home" });
    expect(parseRoute("/json-formatter/", T)).toEqual({ kind: "tool", id: "json-workbench" });
    expect(parseRoute("/debug-report", T)).toEqual({ kind: "tool", id: "debug-report" });
    expect(parseRoute("/privacy/", T)).toEqual({ kind: "page", id: "privacy" });
    expect(parseRoute("/cli/", T)).toEqual({ kind: "notfound" });
    expect(parseRoute("/nope/", T)).toEqual({ kind: "notfound" });
    expect(parseRoute("/a/b/", T)).toEqual({ kind: "notfound" });
  });
  it("never throws on random input", () => {
    const chars = "/%aZ09-._~#?é\u0000";
    for (let i = 0; i < 2000; i++) {
      let s = "";
      const n = Math.floor(Math.random() * 20);
      for (let j = 0; j < n; j++) s += chars[Math.floor(Math.random() * chars.length)];
      expect(() => parseRoute(s, T)).not.toThrow();
    }
  });
});

describe("legacyRedirect", () => {
  it("redirects V1 hashes only from the root", () => {
    expect(legacyRedirect("/", "#debug", T)).toBe("/debug-report/");
    expect(legacyRedirect("/", "#/JSON", T)).toBe("/json-formatter/");
    expect(legacyRedirect("/", "#unknown", T)).toBeNull();
    expect(legacyRedirect("/", "", T)).toBeNull();
    expect(legacyRedirect("/jwt-decoder/", "#debug", T)).toBeNull();
  });
});
