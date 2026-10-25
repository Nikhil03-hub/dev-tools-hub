// Pure CSV <-> JSON conversion. No DOM, no network, no timers: check:boundaries
// enforces that this file runs under plain Node.
// Rules and exact examples come from docs/v3/tasks/P2_tools.md (T-206).
//
// The contract, stated because CSV and JSON do not carry the same information:
//  - A CSV cell is text. Values stay strings unless `dynamicTyping` was asked
//    for, and every cell that option rewrites is then reported as a warning.
//  - A header row is a mapping from name to column, so a duplicated or
//    unusable column name is refused rather than renamed behind the user.
//  - JSON structure CSV has no place for: nested values become JSON text inside
//    one cell, and both `null` and an absent key become an empty cell. Each of
//    those is warned about, never done quietly.
//  - Quoting, escaping and CRLF line endings follow RFC 4180 (papaparse's
//    defaults), and formula protection is opt-in because it edits the text.
import { parse, unparse } from "papaparse";
import type { Result } from "../result";
import { err, ok } from "../result";
// Pure, and the shared P2 rule for JSON input (same call as src/core/yaml).
import { parseJsonWithDiagnostics } from "../../tools/json/lib/jsonParse";

/** Guards against a runaway paste before parsing costs anything (T-201 precedent). */
const MAX_INPUT_CHARS = 2_000_000;
/** The spec caps the reported parse errors at the first 20. */
const MAX_WARNINGS = 20;
/** Row prefix the `dynamicTyping` audit is allowed to compare, so the second
 *  pass stays cheap no matter how large the file is. */
const TYPING_SCAN_ROWS = 200;

/** Cells a spreadsheet can execute. Same set papaparse uses for its own
 *  `escapeFormulae`, applied here by hand because the spec fixes the exact
 *  output (a bare `'=SUM(A1)`, not a quoted one). */
const FORMULA_START = /^[=+\-@\t\r]/;

export type InputDelimiter = "auto" | "," | ";" | "\t" | "|";
export type OutDelimiter = "," | ";" | "\t" | "|";

export interface CsvToJsonOptions {
  header: boolean;
  delimiter: InputDelimiter;
  dynamicTyping: boolean;
}

export interface CsvToJsonValue {
  json: string;
  rows: number;
  columns: string[];
  delimiter: string;
  warnings: string[];
}

export interface JsonToCsvOptions {
  delimiter: OutDelimiter;
  protectFormulas: boolean;
}

export interface JsonToCsvValue {
  csv: string;
  warnings: string[];
}

type Cell = string | number | boolean | null;
type Row = Record<string, unknown> | unknown[];

function emptyInput(): Result<never> {
  return err("Nothing to convert — paste some CSV or a JSON array first.");
}

function tooLarge(): Result<never> {
  return err(
    `This converter handles up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Split the file, or convert one section at a time.`
  );
}

/** `a, b and …` — warning lists name what they found, but never without end. */
function nameList(names: string[], limit = 5): string {
  const unique = [...new Set(names)];
  if (unique.length === 0) return "";
  const shown = unique.slice(0, limit).map((n) => (n === "" ? '""' : n));
  return shown.length < unique.length ? `${shown.join(", ")}, …` : shown.join(", ");
}

// ---------------------------------------------------------------- csvToJson

/**
 * Reads the header row the way the real parse will, so ambiguous column names
 * can be refused *before* papaparse sees them. papaparse renames a duplicate
 * to `a_1` and logs a console warning; both are silent from the user's point
 * of view, which is the one thing a converter is not allowed to do here.
 * The delimiter the library picks for `auto` is returned so the caller can
 * report the same one the data was read with.
 */
function readHeaderRow(text: string, requested: string): { delimiter: string; names: string[] | null } {
  const probe = parse<unknown[]>(text, { delimiter: requested, header: false, preview: 1, skipEmptyLines: true });
  const delimiter = probe.meta?.delimiter ?? requested ?? ",";
  const first = probe.data[0];
  if (!Array.isArray(first)) return { delimiter, names: null };
  return { delimiter, names: first.map((cell) => (cell === null || cell === undefined ? "" : String(cell))) };
}

function headerRowProblem(names: string[]): string | null {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const name of names) {
    if (seen.has(name)) dupes.push(name === "" ? "(blank)" : name);
    seen.add(name);
  }
  if (dupes.length > 0) {
    return (
      `Duplicate column name${dupes.length > 1 ? "s" : ""} in the header row (${nameList(dupes)}). ` +
      "Two columns cannot share one JSON key, so nothing was converted — turn Header row off to keep every column by position."
    );
  }

  if (names.includes("__proto__")) {
    return (
      'A column is named "__proto__", which a JavaScript object cannot hold — that column would be dropped. ' +
      "Rename it, or turn Header row off to keep every column by position."
    );
  }
  return null;
}

/** Names the cells `dynamicTyping` had to rewrite, by re-reading the same
 *  prefix as text. Without this the option would quietly turn `00123` into `123`
 *  and an empty cell into `null`. */
function typingWarnings(typed: Row[], raw: Row[]): string[] {
  const leadingZero: string[] = [];
  const nullish: string[] = [];
  const rewritten: string[] = [];

  // nameList renders an unnamed header as "", which is the key the JSON gets.
  const note = (bucket: string[], name: string): void => {
    if (!bucket.includes(name)) bucket.push(name);
  };

  const compare = (rawValue: unknown, typedValue: unknown, name: string): void => {
    if (typeof rawValue !== "string") return;
    if (typeof typedValue === "number") {
      if (/^-?0\d/.test(rawValue.trim())) note(leadingZero, name);
      else if (rawValue !== String(typedValue)) note(rewritten, name);
    } else if (rawValue === "" && typedValue === null) {
      note(nullish, name);
    }
  };

  for (let r = 0; r < typed.length && r < raw.length; r++) {
    const rawRow = raw[r];
    const typedRow = typed[r];
    if (Array.isArray(rawRow) && Array.isArray(typedRow)) {
      for (let c = 0; c < typedRow.length; c++) compare(rawRow[c], typedRow[c], `Column ${c + 1}`);
      continue;
    }
    if (rawRow && typedRow && typeof rawRow === "object" && typeof typedRow === "object") {
      const rawObj = rawRow as Record<string, unknown>;
      const typedObj = typedRow as Record<string, unknown>;
      for (const key of Object.keys(rawObj)) compare(rawObj[key], typedObj[key], key);
    }
  }

  const out: string[] = [];
  if (leadingZero.length > 0) {
    out.push(`Detect numbers dropped leading zeroes in ${nameList(leadingZero)} — a value like 00123 became the number 123.`);
  }
  if (nullish.length > 0) {
    out.push(`Detect numbers turned empty cells into null in ${nameList(nullish)}.`);
  }
  if (rewritten.length > 0) {
    out.push(`Detect numbers rewrote the text in ${nameList(rewritten)} — the JSON holds the parsed number, not what was typed.`);
  }
  return out;
}

export function csvToJson(text: string, opts: CsvToJsonOptions): Result<CsvToJsonValue> {
  if (text.trim() === "") return emptyInput();
  if (text.length > MAX_INPUT_CHARS) return tooLarge();

  const requested = opts.delimiter === "auto" ? "" : opts.delimiter;
  let delimiter = requested;

  if (opts.header) {
    const head = readHeaderRow(text, requested);
    delimiter = head.delimiter;
    if (head.names) {
      const problem = headerRowProblem(head.names);
      if (problem) return err(problem);
    }
  }

  const parsed = parse<Row>(text, {
    header: opts.header,
    // In header mode the delimiter the header row was validated against is the
    // one the data is read with, so a name cannot be judged unique here and
    // split differently there.
    delimiter: opts.header ? delimiter : requested,
    skipEmptyLines: true,
    dynamicTyping: opts.dynamicTyping,
  });

  // Unreachable while the pre-check agrees with papaparse, but a renamed header
  // must never leave this function as a JSON key the user did not write.
  if (parsed.meta?.renamedHeaders) {
    const renamed = Object.entries(parsed.meta.renamedHeaders)
      .map(([held, original]) => `${original} (written as ${held})`)
      .join(", ");
    return err(`Duplicate column names in the header row (${renamed}). Turn Header row off to keep every column by position.`);
  }

  const warnings: string[] = parsed.errors.slice(0, MAX_WARNINGS).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  if (parsed.errors.length > MAX_WARNINGS) {
    warnings.push(`…and ${parsed.errors.length - MAX_WARNINGS} more problems in the same input.`);
  }

  const data = parsed.data;
  const columns = parsed.meta?.fields ?? [];

  if (opts.header) {
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] === "") {
        warnings.push(`Column ${i + 1} has no header name, so its JSON key is an empty string.`);
        break;
      }
    }
    if (data.some((row) => row && !Array.isArray(row) && "__parsed_extra" in (row as Record<string, unknown>))) {
      warnings.push("Cells that go past the header row are collected under the extra key __parsed_extra, so nothing is dropped.");
    }
    if (data.length === 0) {
      warnings.push("Header row only — 0 data rows, so the JSON is an empty array.");
    }
  }

  if (opts.dynamicTyping && data.length > 0) {
    const raw = parse<Row>(text, {
      header: opts.header,
      delimiter: opts.header ? delimiter : requested,
      skipEmptyLines: true,
      dynamicTyping: false,
      preview: TYPING_SCAN_ROWS,
    });
    warnings.push(...typingWarnings(data.slice(0, TYPING_SCAN_ROWS), raw.data));
  }

  let json: string;
  try {
    json = JSON.stringify(data, null, 2);
  } catch {
    return err("The CSV parsed, but it contains a value JSON cannot represent.");
  }

  return ok({
    json,
    rows: data.length,
    columns: opts.header ? columns : [],
    delimiter: parsed.meta?.delimiter || delimiter || ",",
    warnings,
  });
}

// ---------------------------------------------------------------- jsonToCsv

function itemName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  const text = JSON.stringify(value) ?? String(value);
  return `the ${typeof value} ${text.length > 30 ? `${text.slice(0, 30)}…` : text}`;
}

interface CellAudit {
  nested: string[];
  empty: string[];
  formula: number;
  formulaGuarded: number;
  headerFormulas: string[];
  protoHeader: boolean;
}

/** One JSON value -> one CSV cell. Anything CSV cannot hold is named in the
 *  audit instead of being mangled into a shape that looks fine. */
function toCell(value: unknown, label: string, opts: JsonToCsvOptions, audit: CellAudit): Cell {
  if (value === null || value === undefined) {
    if (!audit.empty.includes(label)) audit.empty.push(label);
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && FORMULA_START.test(value)) {
      audit.formula++;
      if (!opts.protectFormulas) return value;
      audit.formulaGuarded++;
      return `'${value}`;
    }
    return value;
  }
  // object or array: JSON text inside one cell, per the spec.
  if (!audit.nested.includes(label)) audit.nested.push(label);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function collectKeys(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

export function jsonToCsv(text: string, opts: JsonToCsvOptions): Result<JsonToCsvValue> {
  if (text.trim() === "") return emptyInput();
  if (text.length > MAX_INPUT_CHARS) return tooLarge();

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const diagnosed = parseJsonWithDiagnostics(text);
    if (!diagnosed.ok) {
      return err(`That is not valid JSON. ${diagnosed.error.message}`, diagnosed.error.line, diagnosed.error.column);
    }
    return err("That is not valid JSON.");
  }

  if (!Array.isArray(value)) {
    return err(
      value !== null && typeof value === "object"
        ? "This JSON is an object. CSV needs an array of rows — put the objects inside an array, for example [{…}]."
        : `This JSON is ${itemName(value)}, not a list of rows. CSV needs an array of objects or an array of arrays.`
    );
  }

  const warnings: string[] = [];
  if (value.length === 0) {
    return ok({ csv: "", warnings: ["The JSON array is empty, so the CSV is empty too."] });
  }

  const objectRows = value.filter((v) => v !== null && typeof v === "object" && !Array.isArray(v)) as Record<string, unknown>[];
  const arrayRows = value.filter((v) => Array.isArray(v)) as unknown[][];
  const badIndex = value.findIndex((v) => v === null || typeof v !== "object");

  if (objectRows.length > 0 && arrayRows.length > 0) {
    return err("The array mixes objects and inner arrays. Keep one shape per file: rows as objects, or rows as arrays.");
  }
  if (badIndex >= 0) {
    const item = itemName(value[badIndex]);
    return err(
      (objectRows.length > 0 || arrayRows.length > 0
        ? `Item ${badIndex + 1} of the array is ${item}. Every row must be an object or an array.`
        : `Item ${badIndex + 1} of the array is ${item}. CSV needs an array of objects (one key per column) or an array of arrays (one row each).`)
    );
  }

  const audit: CellAudit = { nested: [], empty: [], formula: 0, formulaGuarded: 0, headerFormulas: [], protoHeader: false };

  let out: string;
  if (objectRows.length > 0) {
    const columns = collectKeys(objectRows);
    if (columns.length === 0) {
      return ok({ csv: "", warnings: ["None of the objects has a key, so there are no columns to write."] });
    }
    for (const name of columns) {
      if (name === "__proto__") audit.protoHeader = true;
      if (FORMULA_START.test(name)) audit.headerFormulas.push(name);
    }
    // A null prototype keeps a "__proto__" column as ordinary data instead of
    // letting the assignment redefine the object's prototype and lose the cell.
    const rows = objectRows.map((row) => {
      const target: Record<string, Cell> = Object.create(null) as Record<string, Cell>;
      for (const name of columns) {
        const owned = Object.prototype.hasOwnProperty.call(row, name);
        target[name] = toCell(owned ? row[name] : undefined, name, opts, audit);
      }
      return target;
    });
    out = unparse(rows, { delimiter: opts.delimiter, columns });
  } else {
    let widest = 0;
    let ragged = false;
    const rows = arrayRows.map((row) => {
      if (row.length > widest) widest = row.length;
      if (row.length !== arrayRows[0].length) ragged = true;
      return row.map((cell, i) => toCell(cell, `Column ${i + 1}`, opts, audit));
    });
    out = unparse(rows, { delimiter: opts.delimiter });
    if (ragged) {
      warnings.push(`The inner arrays have different lengths (up to ${widest} cells), so some rows end early — CSV has no marker for a missing cell.`);
    }
    if (out === "") {
      warnings.push("Every row was empty, so the CSV has no cells to write.");
    }
  }

  if (audit.nested.length > 0) {
    warnings.push(`Nested values in columns ${nameList(audit.nested)} were written as JSON text.`);
  }
  if (audit.empty.length > 0) {
    warnings.push(
      `Empty cells in ${nameList(audit.empty)} came from a null or from a key that row does not have. CSV cannot keep those apart, and reading the file back gives "".`
    );
  }
  if (audit.formula > 0) {
    if (opts.protectFormulas) {
      warnings.push(
        `Formula protection put a leading apostrophe on ${audit.formulaGuarded} cell${audit.formulaGuarded === 1 ? "" : "s"}. It makes a spreadsheet treat them as text; it is not a guarantee against every formula-injection trick.`
      );
    } else {
      warnings.push(
        `${audit.formula} cell${audit.formula === 1 ? "" : "s"} start with = + - @ and can run as a formula when the file is opened in a spreadsheet. Turn on Formula protection to prefix them with an apostrophe.`
      );
    }
  }
  if (audit.headerFormulas.length > 0) {
    warnings.push(`Column name${audit.headerFormulas.length > 1 ? "s" : ""} ${nameList(audit.headerFormulas)} in the header row is exported as written — header cells are not formula-protected.`);
  }
  if (audit.protoHeader) {
    warnings.push('The column named "__proto__" is written as text. CSV → JSON refuses that name, because a JavaScript object cannot hold it.');
  }

  return ok({ csv: out, warnings });
}
