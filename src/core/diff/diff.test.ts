import { describe, expect, it } from "vitest";
import { computeDiff, hasChanges, unifiedPatch } from "./diff";

// Every row of the spec's examples table is asserted exactly, in the same order.
const kinds = (r: ReturnType<typeof computeDiff>) =>
  r.ok ? r.value.parts.map((p) => `${p.kind}:${JSON.stringify(p.value)}`).join(" ") : `ERR:${r.error.message}`;

describe("computeDiff — line mode", () => {
  it("produces the spec's example parts in order", () => {
    expect(kinds(computeDiff("a\nb\nc\n", "a\nB\nc\nd\n", { mode: "line" }))).toBe(
      'same:"a\\n" removed:"b\\n" added:"B\\n" same:"c\\n" added:"d\\n"'
    );
  });

  it("counts in lines", () => {
    const r = computeDiff("a\nb\nc\n", "a\nB\nc\nd\n", { mode: "line" });
    expect(r.ok && r.value).toMatchObject({ added: 2, removed: 1, unchanged: 2 });
  });

  it("treats an empty left side as all additions", () => {
    const r = computeDiff("", "x\ny\n", { mode: "line" });
    expect(r.ok && r.value.parts.map((p) => p.kind)).toEqual(["added"]);
    expect(r.ok && r.value.added).toBe(2);
  });

  it("treats an empty right side as all removals", () => {
    const r = computeDiff("x\ny\n", "", { mode: "line" });
    expect(r.ok && r.value.parts.map((p) => p.kind)).toEqual(["removed"]);
    expect(r.ok && r.value.removed).toBe(2);
  });

  it("refuses to compare two empty texts", () => {
    const r = computeDiff("", "", { mode: "line" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("Nothing to compare yet — paste text on the left, the right, or both.");
  });

  it("reports identical texts as one unchanged run and no changes", () => {
    const r = computeDiff("same\ntext\n", "same\ntext\n", { mode: "line" });
    expect(r.ok && r.value.parts.length).toBe(1);
    expect(r.ok && r.value.parts[0].kind).toBe("same");
    expect(r.ok && hasChanges(r.value)).toBe(false);
  });

  it("ignores leading and trailing whitespace per line only when asked", () => {
    const on = computeDiff("  a\n", "a\n", { mode: "line", ignoreWhitespace: true });
    expect(kinds(on)).toBe('same:"a\\n"');
    const off = computeDiff("  a\n", "a\n", { mode: "line" });
    expect(off.ok && hasChanges(off.value)).toBe(true);
  });

  it("still sees a difference inside the line when ignoring whitespace", () => {
    // jsdiff trims each line before comparing; it does not collapse runs of
    // whitespace, and the UI must not promise more than that.
    const r = computeDiff("a  b\n", "a b\n", { mode: "line", ignoreWhitespace: true });
    expect(r.ok && hasChanges(r.value)).toBe(true);
  });

  it("honours ignoreCase in line mode even though the published types omit it", () => {
    // Guard for the deliberate option pass-through in diff.ts: if a future
    // version drops this, the option would silently stop working instead.
    const r = computeDiff("A\n", "a\n", { mode: "line", ignoreCase: true });
    expect(kinds(r)).toBe('same:"a\\n"');
    const off = computeDiff("A\n", "a\n", { mode: "line" });
    expect(off.ok && hasChanges(off.value)).toBe(true);
  });

  it("gives up on unresolvably different texts within its time budget", () => {
    // 4000 unrelated lines is measured at ~2.0s and aborts; 2000 lines finishes
    // in under 0.8s, so this asserts the timeout rather than a slow machine.
    const rnd = (seed: number) => {
      let s = seed;
      return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    };
    const lines = (n: number, seed: number) => {
      const r = rnd(seed);
      return Array.from({ length: n }, () => "line-" + r().toFixed(12)).join("\n");
    };
    const start = Date.now();
    const r = computeDiff(lines(4000, 1), lines(4000, 2), { mode: "line" });
    const elapsed = Date.now() - start;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("These texts are too different to compare quickly. Try line mode or a smaller part.");
    expect(elapsed).toBeLessThan(6000);
  });
});

describe("computeDiff — word mode", () => {
  it("produces the spec's example parts in order", () => {
    expect(kinds(computeDiff("the quick fox", "the slow fox", { mode: "word" }))).toBe(
      'same:"the " removed:"quick" added:"slow" same:" fox"'
    );
  });

  it("keeps spacing as a visible difference by default", () => {
    const r = computeDiff("the  quick fox", "the quick fox", { mode: "word" });
    expect(r.ok && hasChanges(r.value)).toBe(true);
  });

  it("treats spacing as equal when whitespace is ignored", () => {
    const r = computeDiff("the  quick fox", "the quick fox", { mode: "word", ignoreWhitespace: true });
    expect(r.ok && hasChanges(r.value)).toBe(false);
    expect(r.ok && r.value.parts.length).toBe(1);
  });

  it("honours ignoreCase", () => {
    expect(kinds(computeDiff("The fox", "the fox", { mode: "word", ignoreCase: true }))).toBe('same:"the fox"');
  });
});

describe("computeDiff — char mode", () => {
  it("produces the spec's example for identical input", () => {
    const r = computeDiff("abc", "abc", { mode: "char" });
    expect(r.ok && r.value.parts).toEqual([{ kind: "same", value: "abc" }]);
    expect(r.ok && r.value).toMatchObject({ added: 0, removed: 0, unchanged: 3 });
  });

  it("counts in characters", () => {
    const r = computeDiff("abcd", "abXY", { mode: "char" });
    expect(r.ok && r.value).toMatchObject({ added: 2, removed: 2, unchanged: 2 });
  });

  it("refuses more than 50,000 characters per side", () => {
    const big = "x".repeat(50_001);
    const r = computeDiff(big, "y", { mode: "char" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("Character mode is limited to 50,000 characters per side.");
  });

  it("accepts exactly 50,000 characters per side", () => {
    const edge = "x".repeat(50_000);
    expect(computeDiff(edge, edge, { mode: "char" }).ok).toBe(true);
  });

  it("stays inside its time budget on two unrelated 40,000-character texts", () => {
    // Measured against the library directly: two unrelated 40k strings run for
    // over 2s and abort. Repetitive text is not used here because Myers resolves
    // long common runs too quickly to exercise the guard.
    const rnd = (seed: number) => {
      let s = seed;
      return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    };
    const chars = (n: number, seed: number) => {
      const r = rnd(seed);
      let out = "";
      for (let i = 0; i < n; i++) out += String.fromCharCode(97 + Math.floor(r() * 26));
      return out;
    };
    const start = Date.now();
    const r = computeDiff(chars(40_000, 3), chars(40_000, 97), { mode: "char" });
    expect(Date.now() - start).toBeLessThan(6000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/too different to compare quickly/);
  });
});

describe("computeDiff — input that should not be possible to crash", () => {
  it("handles unicode, emoji and mixed line endings as text", () => {
    const r = computeDiff("héllo 🌍\r\n中文\n", "héllo 🌏\r\n中文\n", { mode: "char" });
    expect(r.ok && r.value.parts.length).toBeGreaterThan(1);
  });

  it("handles a single character either side", () => {
    expect(kinds(computeDiff("a", "b", { mode: "line" }))).toBe('removed:"a" added:"b"');
  });

  it("handles whitespace-only texts", () => {
    const r = computeDiff("   ", " ", { mode: "word" });
    expect(r.ok).toBe(true);
  });
});

describe("unifiedPatch", () => {
  it("names both files and carries the changed lines", () => {
    const patch = unifiedPatch("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(patch).toContain("--- original.txt");
    expect(patch).toContain("+++ changed.txt");
    expect(patch).toContain("@@ -1,3 +1,4 @@");
    expect(patch).toContain("-b");
    expect(patch).toContain("+B");
    expect(patch).toContain("+d");
  });

  it("accepts custom file names", () => {
    const patch = unifiedPatch("x\n", "y\n", "left.conf", "right.conf");
    expect(patch).toContain("--- left.conf");
    expect(patch).toContain("+++ right.conf");
  });

  it("produces no hunk for identical texts", () => {
    const patch = unifiedPatch("same\n", "same\n");
    expect(patch).not.toContain("@@");
    expect(patch).toContain("--- original.txt");
  });
});

describe("hasChanges", () => {
  it("is false only when nothing was added or removed", () => {
    const same = computeDiff("a\n", "a\n", { mode: "line" });
    const moved = computeDiff("a\nb\n", "b\na\n", { mode: "line" });
    expect(same.ok && hasChanges(same.value)).toBe(false);
    expect(moved.ok && hasChanges(moved.value)).toBe(true);
  });
});
