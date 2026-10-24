import { describe, expect, it } from "vitest";
import { err, offsetToLineCol, ok } from "./result";

describe("result", () => {
  it("ok wraps a value", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });
  it("err omits missing positions", () => {
    expect(err("bad")).toEqual({ ok: false, error: { message: "bad" } });
    expect(err("bad", 2, 5)).toEqual({ ok: false, error: { message: "bad", line: 2, column: 5 } });
  });
  it("offsetToLineCol handles first line, later lines and clamping", () => {
    expect(offsetToLineCol("abc", 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol("ab\ncd", 3)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineCol("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
    expect(offsetToLineCol("ab", 99)).toEqual({ line: 1, column: 3 });
    expect(offsetToLineCol("", -5)).toEqual({ line: 1, column: 1 });
  });
});
