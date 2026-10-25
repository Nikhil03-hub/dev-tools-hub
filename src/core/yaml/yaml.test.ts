import { describe, expect, it } from "vitest";
import { guessDirection, jsonToYaml, yamlToJson } from "./yaml";

// Exact examples come from docs/v3/tasks/P2_tools.md (T-201). Where a row is an
// error case, the assertion is on the message/line the spec requires.
const ALIAS_BOMB =
  "a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]";

describe("yamlToJson", () => {
  it("converts scalars and nested arrays with 2-space JSON", () => {
    const r = yamlToJson("a: 1\nb: [x, y]", 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.json).toBe('{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}');
  });

  it("indents 4 when asked", () => {
    const r = yamlToJson("a: 1", 4);
    expect(r.ok && r.value.json).toBe('{\n    "a": 1\n}');
  });

  it("combines multiple documents into one array and says so", () => {
    const r = yamlToJson("a: 1\n---\nb: 2\n", 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.json).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]');
      expect(r.value.documents).toBe(2);
      expect(r.value.notes).toEqual(["2 YAML documents were combined into one JSON array."]);
    }
  });

  it("reports the line and column of a malformed document", () => {
    const r = yamlToJson("a: [1, 2\nb: 3", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(2);
      expect(r.error.column).toBe(1);
      expect(r.error.message.length).toBeGreaterThan(0);
    }
  });

  it("rejects duplicate keys with a message mentioning uniqueness", () => {
    const r = yamlToJson("a: 1\na: 2", 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.toLowerCase()).toContain("unique");
  });

  it("keeps YAML 1.2 semantics: hex resolves, dates stay strings", () => {
    const r = yamlToJson("n: 0x1F\nd: 2026-10-22", 2);
    expect(r.ok && r.value.json).toBe('{\n  "n": 31,\n  "d": "2026-10-22"\n}');
  });

  it("keeps yes/no/on as strings and only true/false as booleans", () => {
    const r = yamlToJson("a: yes\nb: no\nc: on\nd: true", 2);
    expect(r.ok && r.value.json).toBe('{\n  "a": "yes",\n  "b": "no",\n  "c": "on",\n  "d": true\n}');
  });

  it("refuses an alias bomb instead of expanding it", () => {
    const r = yamlToJson(ALIAS_BOMB, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("Too many aliases — this looks like a YAML bomb, so it was not expanded.");
  });

  it("never constructs an object from a tag, and says the tag was kept as text", () => {
    const r = yamlToJson("a: !!js/function >\n  function(){return 1}", 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The core schema leaves an unknown tag as its scalar text: no function,
      // no object construction — but the user must still be told.
      expect(JSON.parse(r.value.json)).toEqual({ a: "function(){return 1}\n" });
      expect(r.value.notes.some((n) => /unsupported YAML tag/i.test(n))).toBe(true);
    }
    const custom = yamlToJson("a: !mytag hi", 2);
    expect(custom.ok && JSON.parse(custom.value.json)).toEqual({ a: "hi" });
    expect(custom.ok && custom.value.notes.length).toBeGreaterThan(0);
  });

  it("refuses keys that would corrupt an object prototype", () => {
    for (const src of ["__proto__:\n  polluted: true", "a:\n  __proto__:\n    polluted: true"]) {
      const r = yamlToJson(src, 2);
      expect(r.ok).toBe(false);
    }
  });

  it("asks for input rather than reporting a fake success on blank input", () => {
    for (const src of ["", "   ", "\n\t \n"]) {
      const r = yamlToJson(src, 2);
      expect(r.ok).toBe(false);
    }
  });

  it("preserves nulls, booleans, nesting and empty collections", () => {
    const r = yamlToJson("n: null\nt: true\nf: false\nobj:\n  deep:\n    - 1\n    - 2\nempty: {}\nlist: []", 2);
    expect(r.ok && JSON.parse(r.value.json)).toEqual({ n: null, t: true, f: false, obj: { deep: [1, 2] }, empty: {}, list: [] });
  });

  it("handles unicode keys and values", () => {
    const r = yamlToJson('emoji: "✅"\n"naïve café": 1', 2);
    expect(r.ok && JSON.parse(r.value.json)).toEqual({ emoji: "✅", "naïve café": 1 });
  });
});

describe("jsonToYaml", () => {
  it("produces the exact block-style document", () => {
    const r = jsonToYaml('{"a":1,"b":["x"],"c":{"d":null,"e":"yes"}}', 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("a: 1\nb:\n  - x\nc:\n  d: null\n  e: yes\n");
  });

  it("indents 4 when asked", () => {
    const r = jsonToYaml('{"a":{"b":1}}', 4);
    expect(r.ok && r.value).toBe("a:\n    b: 1\n");
  });

  it("accepts a top-level array and scalar", () => {
    expect(jsonToYaml("[1, 2]", 2).ok && (jsonToYaml("[1, 2]", 2) as { value: string }).value).toBe("- 1\n- 2\n");
    const s = jsonToYaml('"hello"', 2);
    expect(s.ok && s.value).toBe("hello\n");
  });

  it("reports a line number for malformed JSON", () => {
    const r = jsonToYaml('{"a":1,\n"b":,}', 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.line).toBe(2);
      expect(r.error.message).toContain("not valid JSON");
    }
  });

  it("refuses prototype-poisoning keys", () => {
    for (const src of ['{"__proto__":{"a":1}}', '{"a":{"constructor":{"b":1}}}']) {
      expect(jsonToYaml(src, 2).ok).toBe(false);
    }
  });

  it("asks for input on blank text", () => {
    expect(jsonToYaml("  \n", 2).ok).toBe(false);
  });

  it("round-trips with yamlToJson", () => {
    const j = yamlToJson("a: 1\nb: [x, y]", 2);
    expect(j.ok).toBe(true);
    if (j.ok) {
      const y = jsonToYaml(j.value.json, 2);
      expect(y.ok && y.value).toBe("a: 1\nb:\n  - x\n  - y\n");
    }
  });
});

describe("guessDirection", () => {
  it("sends parseable JSON objects and arrays to YAML", () => {
    expect(guessDirection('{"a":1}')).toBe("json-to-yaml");
    expect(guessDirection("  [1,2]  ")).toBe("json-to-yaml");
  });

  it("sends YAML, blank text and JSON look-alikes to JSON", () => {
    expect(guessDirection("a: 1")).toBe("yaml-to-json");
    expect(guessDirection("")).toBe("yaml-to-json");
    expect(guessDirection('{"a":1,}')).toBe("yaml-to-json");
  });
});

describe("input bounds", () => {
  it("refuses an oversized document rather than hanging the tab", () => {
    const huge = `a: "${"x".repeat(2_000_001)}"`;
    expect(yamlToJson(huge, 2).ok).toBe(false);
    expect(jsonToYaml(huge, 2).ok).toBe(false);
  });
});
