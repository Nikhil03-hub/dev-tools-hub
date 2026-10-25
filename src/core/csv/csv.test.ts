import { describe, expect, it } from "vitest";
import {
  csvToJson,
  jsonToCsv,
  type CsvToJsonOptions,
  type CsvToJsonValue,
  type JsonToCsvOptions,
} from "./csv";

// Exact examples and wording come from docs/v3/tasks/P2_tools.md (T-206).
// Where the spec is silent, the expectation is the documented contract of this
// module: never rename, trim, type-cast or drop a cell without saying so.

const IN = (over: Partial<CsvToJsonOptions> = {}): CsvToJsonOptions => ({
  header: true,
  delimiter: "auto",
  dynamicTyping: false,
  ...over,
});

const OUT = (over: Partial<JsonToCsvOptions> = {}): JsonToCsvOptions => ({
  delimiter: ",",
  protectFormulas: false,
  ...over,
});

/** The JSON string a successful csvToJson produced, parsed back for assertions
 *  that are easier to state as data than as text. */
function dataOf(r: ReturnType<typeof csvToJson>): unknown {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return JSON.parse(r.value.json);
}

function errorOf(r: ReturnType<typeof csvToJson> | ReturnType<typeof jsonToCsv>): string {
  if (r.ok) throw new Error(`expected an error, got: ${JSON.stringify(r.value)}`);
  return r.error.message;
}

function warningsOf(r: ReturnType<typeof csvToJson> | ReturnType<typeof jsonToCsv>): string[] {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.value.warnings;
}

/** The `value` of a successful conversion, or a thrown reason for a failed one. */
function valueOf(r: ReturnType<typeof csvToJson>): CsvToJsonValue {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.value;
}

function csvOf(r: ReturnType<typeof jsonToCsv>): string {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.value.csv;
}

describe("csvToJson", () => {
  it("converts the spec's worked example to 2-space JSON of strings", () => {
    const r = csvToJson('name,age\n"Smith, J",42\nAnn,7\n', IN());
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([
      { name: "Smith, J", age: "42" },
      { name: "Ann", age: "7" },
    ]);
    if (r.ok) {
      expect(r.value.json).toBe('[\n  {\n    "name": "Smith, J",\n    "age": "42"\n  },\n  {\n    "name": "Ann",\n    "age": "7"\n  }\n]');
      expect(r.value.rows).toBe(2);
      expect(r.value.columns).toEqual(["name", "age"]);
      expect(r.value.delimiter).toBe(",");
      expect(r.value.warnings).toEqual([]);
    }
  });

  it("keeps a doubled quote as one quote", () => {
    expect(dataOf(csvToJson('a,b\n"he said ""hi""",2', IN()))).toEqual([{ a: 'he said "hi"', b: "2" }]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(dataOf(csvToJson('a,b\n"line1\nline2",2', IN()))).toEqual([{ a: "line1\nline2", b: "2" }]);
  });

  it("reads CRLF and LF identically", () => {
    expect(dataOf(csvToJson("a,b\r\n1,2\r\n3,4\r\n", IN()))).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("does not require a final newline", () => {
    expect(dataOf(csvToJson("a,b\n1,2", IN()))).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps an empty cell as an empty string, including the last one", () => {
    expect(dataOf(csvToJson("a,b,c\n1,2,", IN()))).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("reads a quoted empty cell as an empty string", () => {
    expect(dataOf(csvToJson('a,b\n"",x', IN()))).toEqual([{ a: "", b: "x" }]);
  });

  it("strips a UTF-8 BOM from the first header name", () => {
    const r = csvToJson("\uFEFFa,b\n1,2", IN());
    expect(r.ok && r.value.columns).toEqual(["a", "b"]);
    expect(dataOf(r)).toEqual([{ a: "1", b: "2" }]);
  });

  it("keeps leading and trailing spaces inside a quoted cell", () => {
    expect(dataOf(csvToJson('a\n"  padded  "', IN()))).toEqual([{ a: "  padded  " }]);
  });

  it("does not trim a header name", () => {
    const r = csvToJson(" a , b \n1,2", IN());
    expect(r.ok && r.value.columns).toEqual([" a ", " b "]);
  });

  it("keeps unicode values intact", () => {
    expect(dataOf(csvToJson('n\n"é☃中文"', IN()))).toEqual([{ n: "é☃中文" }]);
  });

  it("reports an unterminated quote as a warning and keeps the row", () => {
    const r = csvToJson('a,b\n1,"oops', IN());
    expect(r.ok).toBe(true);
    expect(warningsOf(r)).toEqual(['Row 2: Quoted field unterminated']);
  });

  it("reports trailing text after a closing quote", () => {
    const warnings = warningsOf(csvToJson('a,b\n1,"x"junk', IN()));
    expect(warnings.some((w) => /Row 2:/.test(w))).toBe(true);
  });

  it("caps the reported problems at 20 and says how many are left", () => {
    const rows = "a,b\n" + "1,2,3\n".repeat(25);
    const warnings = warningsOf(csvToJson(rows, IN()));
    const problemLines = warnings.filter((w) => /^Row \d+: /.test(w));
    expect(problemLines.length).toBe(20);
    expect(warnings.some((w) => /5 more problems/.test(w))).toBe(true);
  });

  it("skips blank lines but keeps a line of only delimiters", () => {
    expect(dataOf(csvToJson("a,b\n1,2\n\n\n", IN()))).toEqual([{ a: "1", b: "2" }]);
    expect(dataOf(csvToJson("a,b\n1,2\n,,", IN()))).toHaveLength(2);
  });
});

describe("csvToJson header contract", () => {
  it("refuses duplicate column names instead of renaming one", () => {
    const message = errorOf(csvToJson("a,a\n1,2", IN()));
    expect(message).toContain("Duplicate column name");
    expect(message).toContain("a");
    expect(message).toContain("Header row off");
  });

  it("refuses a second blank header the same way", () => {
    expect(errorOf(csvToJson("a,,\n1,2,3", IN()))).toContain("Duplicate column name");
  });

  it("accepts one blank header and explains the empty JSON key", () => {
    const r = csvToJson("a,,c\n1,2,3", IN());
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([{ a: "1", "": "2", c: "3" }]);
    expect(warningsOf(r).some((w) => /Column 2 has no header name/.test(w))).toBe(true);
  });

  it("refuses a __proto__ column rather than losing that data", () => {
    const message = errorOf(csvToJson("__proto__,b\n1,2", IN()));
    expect(message).toContain("__proto__");
    expect(message).toContain("dropped");
  });

  it("keeps a constructor column, which JavaScript objects can hold", () => {
    const r = csvToJson("constructor,b\n1,2", IN());
    expect(r.ok).toBe(true);
    expect(valueOf(r).json).toContain('"constructor": "1"');
  });

  it("treats headers that differ only by case as different columns", () => {
    const r = csvToJson("A,a\n1,2", IN());
    expect(r.ok && r.value.columns).toEqual(["A", "a"]);
  });

  it("collects cells past the header row under __parsed_extra and warns", () => {
    const r = csvToJson("a,b\n1,2,3", IN());
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([{ a: "1", b: "2", __parsed_extra: ["3"] }]);
    expect(warningsOf(r)).toContain("Row 1: Too many fields: expected 2 fields but parsed 3");
    expect(warningsOf(r).some((w) => /__parsed_extra/.test(w))).toBe(true);
  });

  it("omits a key whose cell is missing and warns about the short row", () => {
    const r = csvToJson("a,b,c\n1,2", IN());
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([{ a: "1", b: "2" }]);
    expect(warningsOf(r)).toContain("Row 1: Too few fields: expected 3 fields but parsed 2");
  });

  it("converts a header-only file to an empty array and says so", () => {
    const r = csvToJson("a,b\n", IN());
    expect(r.ok).toBe(true);
    expect(valueOf(r).json).toBe("[]");
    expect(valueOf(r).rows).toBe(0);
    expect(valueOf(r).columns).toEqual(["a", "b"]);
    expect(warningsOf(r).some((w) => /Header row only/.test(w))).toBe(true);
  });

  it("maps a headerless file to arrays of arrays", () => {
    const r = csvToJson("1,2\n3,4", IN({ header: false }));
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(valueOf(r).columns).toEqual([]);
    expect(valueOf(r).rows).toBe(2);
  });

  it("allows duplicate names when there is no header row to collide", () => {
    const r = csvToJson("a,a\n1,2", IN({ header: false }));
    expect(r.ok).toBe(true);
    expect(dataOf(r)).toEqual([
      ["a", "a"],
      ["1", "2"],
    ]);
  });
});

describe("csvToJson delimiters", () => {
  it.each([
    ["a;b\n1;2", ";"],
    ["a\tb\n1\t2", "\t"],
    ["a|b\n1|2", "|"],
  ])("auto-detects %j and reports it", (text, expected) => {
    const r = csvToJson(text, IN());
    expect(r.ok && r.value.delimiter).toBe(expected);
  });

  it("honours an explicit delimiter even when a comma is present", () => {
    const r = csvToJson('a,b;c\n"x,y";2', IN({ delimiter: ";" }));
    expect(dataOf(r)).toEqual([{ "a,b": "x,y", c: "2" }]);
    expect(warningsOf(r)).toEqual([]);
  });

  it("does not split a quoted field on the detected delimiter", () => {
    const r = csvToJson('"a,b";c\n"x";"y"', IN());
    expect(r.ok && r.value.columns).toEqual(["a,b", "c"]);
  });
});

describe("csvToJson dynamicTyping (Detect numbers)", () => {
  it("keeps every value as text by default", () => {
    expect(dataOf(csvToJson("a,b,c,d\n1,true,,00123", IN()))).toEqual([{ a: "1", b: "true", c: "", d: "00123" }]);
  });

  it("turns numbers into numbers when asked", () => {
    expect(dataOf(csvToJson("a\n42", IN({ dynamicTyping: true })))).toEqual([{ a: 42 }]);
    expect(warningsOf(csvToJson("a\n42", IN({ dynamicTyping: true })))).toEqual([]);
  });

  it("warns when a leading zero is lost", () => {
    const warnings = warningsOf(csvToJson("id,seq\n00123,7", IN({ dynamicTyping: true })));
    expect(warnings.some((w) => /leading zeroes/.test(w) && /\bid\b/.test(w))).toBe(true);
    expect(warnings.some((w) => /\bseq\b/.test(w))).toBe(false);
    expect(dataOf(csvToJson("id\n00123", IN({ dynamicTyping: true })))).toEqual([{ id: 123 }]);
  });

  it("warns when an empty cell becomes null", () => {
    const warnings = warningsOf(csvToJson("a,b\n1,", IN({ dynamicTyping: true })));
    expect(warnings.some((w) => /empty cells into null/.test(w) && /\bb\b/.test(w))).toBe(true);
  });

  it("warns when numeric text is rewritten", () => {
    const warnings = warningsOf(csvToJson("a,b\n1e3,0.50", IN({ dynamicTyping: true })));
    expect(warnings.some((w) => /rewrote the text/.test(w))).toBe(true);
  });

  it("names positional columns when there is no header", () => {
    const warnings = warningsOf(csvToJson("00123,1", IN({ header: false, dynamicTyping: true })));
    expect(warnings.some((w) => /Column 1/.test(w))).toBe(true);
  });

  it("does not invent dates, and leaves NaN and null as text", () => {
    expect(dataOf(csvToJson("a,b,c\nNaN,null,2026-10-25", IN({ dynamicTyping: true })))).toEqual([
      { a: "NaN", b: "null", c: "2026-10-25" },
    ]);
  });
});

describe("csvToJson input limits", () => {
  it.each([[""], ["   "], ["\n\n"], ["\uFEFF"]])("rejects %j as empty input", (text) => {
    expect(errorOf(csvToJson(text, IN()))).toContain("Nothing to convert");
  });

  it("rejects input over the character limit", () => {
    const big = "a,b\n" + "1,2\n".repeat(500_001);
    expect(big.length).toBeGreaterThan(2_000_000);
    expect(errorOf(csvToJson(big, IN()))).toContain("2,000,000 characters");
  });

  it("is deterministic for the same input and options", () => {
    const text = 'a,b\n"1,2",x\n3,4';
    const one = csvToJson(text, IN());
    const two = csvToJson(text, IN());
    expect(one.ok && two.ok && one.value.json).toBe(two.ok && two.value.json);
  });
});

describe("jsonToCsv", () => {
  it("writes the spec's worked example with RFC 4180 escaping", () => {
    const r = jsonToCsv('[{"a":1,"b":"x,y"},{"a":2,"b":"q\\"z"}]', OUT());
    expect(r.ok).toBe(true);
    expect(csvOf(r)).toBe('a,b\r\n1,"x,y"\r\n2,"q""z"');
    expect(warningsOf(r)).toEqual([]);
  });

  it("prefixes a formula-like string when protection is on", () => {
    expect(csvOf(jsonToCsv('[{"f":"=SUM(A1)"}]', OUT({ protectFormulas: true })))).toBe("f\r\n'=SUM(A1)");
  });

  it("leaves the cell untouched and warns when protection is off", () => {
    const r = jsonToCsv('[{"f":"=SUM(A1)"}]', OUT());
    expect(csvOf(r)).toBe("f\r\n=SUM(A1)");
    expect(warningsOf(r).some((w) => /Formula protection/.test(w))).toBe(true);
  });

  it.each(["=1", "+1", "-1", "@1"])("protects a cell starting with %j", (value) => {
    const r = jsonToCsv(JSON.stringify([{ f: value }]), OUT({ protectFormulas: true }));
    expect(csvOf(r)).toBe(`f\r\n'` + value);
    expect(r.ok && r.value.warnings).toHaveLength(1);
  });

  it("protects a cell that starts with a tab or a carriage return", () => {
    const tabbed = csvOf(jsonToCsv(JSON.stringify([{ f: "\t1" }]), OUT({ protectFormulas: true })));
    expect(tabbed).toBe(`f\r\n'\t1`);
    const returned = csvOf(jsonToCsv(JSON.stringify([{ f: "\r1" }]), OUT({ protectFormulas: true })));
    expect(returned).toBe(`f\r\n"'\r1"`);
  });

  it("protects strings but never real numbers", () => {
    expect(csvOf(jsonToCsv('[{"n":-5}]', OUT({ protectFormulas: true })))).toBe("n\r\n-5");
    expect(csvOf(jsonToCsv('[{"n":"-5"}]', OUT({ protectFormulas: true })))).toBe("n\r\n'-5");
  });

  it("counts every protected cell once in the note", () => {
    const warnings = warningsOf(jsonToCsv('[{"a":"=1","b":"+2"}]', OUT({ protectFormulas: true })));
    expect(warnings.some((w) => /2 cells/.test(w))).toBe(true);
  });

  it("quotes a cell that contains a newline and keeps CRLF endings", () => {
    expect(csvOf(jsonToCsv('[{"a":"l1\\nl2"}]', OUT()))).toBe('a\r\n"l1\nl2"');
  });

  it("unions the keys of every row in first-seen order", () => {
    const r = jsonToCsv('[{"b":1},{"a":2,"c":3}]', OUT());
    expect(csvOf(r)).toBe("b,a,c\r\n1,,\r\n,2,3");
    expect(warningsOf(r).some((w) => /null or from a key that row does not have/.test(w))).toBe(true);
  });

  it("treats a null and a missing key as the same empty cell, and says so", () => {
    const warnings = warningsOf(jsonToCsv('[{"a":null,"b":1}]', OUT()));
    expect(warnings.some((w) => /\ba\b/.test(w) && /CSV cannot keep those apart/.test(w))).toBe(true);
    expect(csvOf(jsonToCsv('[{"a":null,"b":1}]', OUT()))).toBe("a,b\r\n,1");
  });

  it("writes nested objects as JSON text with the spec's warning", () => {
    const r = jsonToCsv('[{"a":{"b":1}}]', OUT());
    expect(csvOf(r)).toBe('a\r\n"{""b"":1}"');
    expect(warningsOf(r)).toContain("Nested values in columns a were written as JSON text.");
  });

  it("writes nested arrays as JSON text, not as a joined row", () => {
    expect(csvOf(jsonToCsv('[{"a":[1,2]}]', OUT()))).toBe('a\r\n"[1,2]"');
  });

  it("names each column that held a nested value", () => {
    const warnings = warningsOf(jsonToCsv('[{"a":{"x":1},"b":[2],"c":3}]', OUT()));
    expect(warnings.some((w) => /columns a, b were written as JSON text/.test(w))).toBe(true);
  });

  it("accepts an array of arrays without inventing a header row", () => {
    const r = jsonToCsv('[[1,2],[3,"a,b"]]', OUT());
    expect(csvOf(r)).toBe('1,2\r\n3,"a,b"');
    expect(warningsOf(r)).toEqual([]);
  });

  it("warns when the inner arrays are ragged", () => {
    const warnings = warningsOf(jsonToCsv('[[1,2],[3]]', OUT()));
    expect(warnings.some((w) => /different lengths/.test(w))).toBe(true);
  });

  it("refuses a mix of object rows and array rows", () => {
    expect(errorOf(jsonToCsv('[{"a":1},[2]]', OUT()))).toContain("mixes objects and inner arrays");
  });

  it("refuses primitive items and names the position", () => {
    expect(errorOf(jsonToCsv('[{"a":1},5]', OUT()))).toMatch(/Item 2 .* the number 5/);
    expect(errorOf(jsonToCsv("[null]", OUT()))).toMatch(/Item 1 .* null/);
    expect(errorOf(jsonToCsv("[1,2,3]", OUT()))).toContain("CSV needs an array of objects");
  });

  it("refuses a non-array root with the fix spelled out", () => {
    const object = errorOf(jsonToCsv('{"a":1}', OUT()));
    expect(object).toContain("This JSON is an object");
    expect(object).toContain("[{…}]");
    expect(errorOf(jsonToCsv('"hello"', OUT()))).toContain("the string");
    expect(errorOf(jsonToCsv("null", OUT()))).toContain("null, not a list of rows");
  });

  it("reports an empty array instead of writing a silent empty file", () => {
    const r = jsonToCsv("[]", OUT());
    expect(r.ok).toBe(true);
    expect(csvOf(r)).toBe("");
    expect(warningsOf(r).some((w) => /array is empty/.test(w))).toBe(true);
  });

  it("reports objects that carry no keys", () => {
    const warnings = warningsOf(jsonToCsv("[{}]", OUT()));
    expect(warnings.some((w) => /no columns to write/.test(w))).toBe(true);
  });

  it("diagnoses invalid JSON with a line and column", () => {
    const r = jsonToCsv('[{"a":1}\n{"b":2}]', OUT());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("That is not valid JSON");
      expect(r.error.line).toBeGreaterThan(0);
    }
  });

  it.each([[""], ["  \n "]])("rejects %j as empty input", (text) => {
    expect(errorOf(jsonToCsv(text, OUT()))).toContain("Nothing to convert");
  });

  it("rejects input over the character limit", () => {
    const big = `[${Array.from({ length: 250_000 }, (_, i) => `{"a":"${i}"}`).join(",")}]`;
    expect(big.length).toBeGreaterThan(2_000_000);
    expect(errorOf(jsonToCsv(big, OUT()))).toContain("2,000,000 characters");
  });

  it.each([
    [",", 'a,b\r\n"x,y",2'],
    [';', 'a;b\r\n"x;y";2'],
    ["\t", 'a\tb\r\n"x\ty"\t2'],
    ['|', 'a|b\r\n"x|y"|2'],
  ])("writes %j as the separator and quotes a value that contains it", (delimiter, expected) => {
    const r = jsonToCsv(JSON.stringify([{ a: `x${delimiter}y`, b: 2 }]), OUT({ delimiter: delimiter as "," }));
    expect(csvOf(r)).toBe(expected);
  });

  it("keeps booleans, unicode and empty strings readable", () => {
    expect(csvOf(jsonToCsv('[{"a":true,"b":false,"c":"é☃","d":""}]', OUT()))).toBe("a,b,c,d\r\ntrue,false,é☃,");
  });

  it("preserves a __proto__ column and warns that CSV → JSON cannot read it back", () => {
    const r = jsonToCsv('[{"__proto__":1,"b":2}]', OUT());
    expect(r.ok).toBe(true);
    expect(csvOf(r)).toBe("__proto__,b\r\n1,2");
    expect(warningsOf(r).some((w) => /__proto__/.test(w))).toBe(true);
  });

  it("warns that a formula-like column name is not protected", () => {
    const warnings = warningsOf(jsonToCsv('[{"=a":1}]', OUT({ protectFormulas: true })));
    expect(warnings.some((w) => /header row is exported as written/.test(w))).toBe(true);
  });

  it("writes rows and columns in source order", () => {
    const r = jsonToCsv('[{"z":1,"y":2},{"z":3,"y":4}]', OUT());
    expect(csvOf(r)).toBe("z,y\r\n1,2\r\n3,4");
  });

  it("round-trips flat data as text", () => {
    const source = [{ id: "00123", note: "a,b", quote: 'say "hi"' }];
    const csv = csvOf(jsonToCsv(JSON.stringify(source), OUT()));
    const back = csvToJson(csv, IN());
    expect(back.ok && JSON.parse(back.value.json)).toEqual(source);
  });

  it("keeps a protected cell readable as text after a round trip", () => {
    const csv = csvOf(jsonToCsv('[{"f":"=SUM(A1)"}]', OUT({ protectFormulas: true })));
    const back = csvToJson(csv, IN());
    expect(back.ok && JSON.parse(back.value.json)).toEqual([{ f: "'=SUM(A1)" }]);
  });
});
