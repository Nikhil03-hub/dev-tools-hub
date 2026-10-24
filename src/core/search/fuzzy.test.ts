import { describe, expect, it } from "vitest";
import { rankItems, scoreMatch, type SearchItem } from "./fuzzy";

const item = (id: string, text: string, group = "Tools", keywords?: string[]): SearchItem => ({ id, text, group, keywords });

describe("scoreMatch", () => {
  it("scores an exact prefix highest", () => {
    expect(scoreMatch("jwt", item("jwt", "JWT Decoder"))).toBe(100);
  });

  it("scores a word prefix below an exact prefix", () => {
    expect(scoreMatch("decoder", item("jwt", "JWT Decoder"))).toBe(80);
  });

  it("scores a keyword prefix", () => {
    expect(scoreMatch("har", item("debug", "Debug Report", "Tools", ["har", "curl"]))).toBe(70);
  });

  it("scores a substring", () => {
    expect(scoreMatch("ork", item("json", "JSON Workbench"))).toBe(50);
  });

  it("scores a subsequence", () => {
    expect(scoreMatch("jdc", item("jwt", "JWT Decoder"))).toBe(20);
  });

  it("returns zero when nothing matches", () => {
    expect(scoreMatch("zzz", item("jwt", "JWT Decoder"))).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(scoreMatch("JWT", item("jwt", "jwt decoder"))).toBe(100);
  });
});

describe("rankItems", () => {
  const items = [
    item("json", "JSON Workbench"),
    item("jwt", "JWT Decoder"),
    item("regex", "Regex Tester"),
  ];

  it("orders by score", () => {
    expect(rankItems("jwt", items).map((i) => i.id)).toEqual(["jwt"]);
  });

  it("puts the recent item first when scores tie", () => {
    const tied = [item("a", "Test One"), item("b", "Test Two")];
    expect(rankItems("test", tied, ["b"]).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("keeps input order when nothing is recent", () => {
    const tied = [item("a", "Test One"), item("b", "Test Two")];
    expect(rankItems("test", tied).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns the input order for an empty query", () => {
    expect(rankItems("", items).map((i) => i.id)).toEqual(["json", "jwt", "regex"]);
  });

  it("puts recent items first for an empty query", () => {
    expect(rankItems("", items, ["regex"]).map((i) => i.id)).toEqual(["regex", "json", "jwt"]);
  });

  it("drops non-matching items", () => {
    expect(rankItems("nope", items)).toEqual([]);
  });

  it("never throws on odd input", () => {
    for (const q of ["", " ", "\n", "///", "😀"]) expect(() => rankItems(q, items)).not.toThrow();
  });
});
