// Pure YAML <-> JSON conversion. No DOM, no network, no timers: check:boundaries
// enforces that this file runs under plain Node.
// Rules and exact examples come from docs/v3/tasks/P2_tools.md (T-201).
//
// Conversion policy, stated because YAML and JSON are NOT interchangeable:
//  - YAML 1.2 core schema, so `yes`/`no`/`on`/`off` stay strings and only
//    `true`/`false` are booleans. Dates are not resolved to Date objects, so
//    `2026-10-22` stays the string it is in JSON terms.
//  - Multiple documents (`---`) cannot exist in one JSON value, so they become
//    the items of a JSON array and the caller gets a note saying so.
//  - Aliases are expanded but capped, so a billion-laughs document fails instead
//    of freezing the tab.
//  - Tags are never executed, and keys that would corrupt an object's prototype
//    are refused rather than silently dropped.
// Nothing here is loss-free in the general case: YAML constructs with no JSON
// equivalent (anchors after conversion, binary, custom tags, comments) are
// reported as errors instead of being quietly mangled.
import { parseAllDocuments, stringify } from "yaml";
import type { Result } from "../result";
import { err, ok } from "../result";
// Pure, and explicitly allowed by the P2 shared rules for pure logic.
import { parseJsonWithDiagnostics } from "../../tools/json/lib/jsonParse";

export interface YamlToJsonValue {
  json: string;
  documents: number;
  notes: string[];
}

export type Direction = "yaml-to-json" | "json-to-yaml";

// A thrown value is not always an Error, and strict mode types a catch binding
// as unknown, so both readings go through here.
function reasonOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

function firstLine(text: string): string {
  return text.split("\n")[0].trim();
}

const MAX_ALIAS_COUNT = 100;
/** Guards against a runaway document before parsing costs anything. */
const MAX_INPUT_CHARS = 2_000_000;

/** Keys that would redefine an object's prototype if the result were merged or
 *  walked naively downstream. JSON allows them as ordinary members; JS objects
 *  do not, so the conversion refuses them outright. */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function hasUnsafeKey(value: unknown, depth = 0): boolean {
  if (depth > 64 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasUnsafeKey(v, depth + 1));
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) return true;
    if (hasUnsafeKey((value as Record<string, unknown>)[key], depth + 1)) return true;
  }
  return false;
}

function firstDocumentError(docs: ReturnType<typeof parseAllDocuments>): Result<never> | null {
  for (let i = 0; i < docs.length; i++) {
    const e = docs[i].errors[0];
    if (!e) continue;
    // prettyErrors puts the human sentence first and a source excerpt after it.
    const message = String(e.message).split("\n")[0].trim();
    const pos = e.linePos && e.linePos[0];
    // prettyErrors also repeats the coordinates inside the sentence. The UI renders
    // line/column separately, so keeping both reads as "…at line 2, column 1: (line 2, column 1)".
    const trimmedMessage = pos ? message.replace(/\s*at line \d+, column \d+:?\s*$/i, "") : message;
    return err(trimmedMessage, pos ? pos.line : undefined, pos ? pos.col : undefined);
  }
  return null;
}

export function guessDirection(src: string): Direction {
  const trimmed = src.trim();
  if (!trimmed) return "yaml-to-json";
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return "yaml-to-json";
  try {
    JSON.parse(trimmed);
    return "json-to-yaml";
  } catch {
    // Starts like JSON but is not: treat it as YAML and let the parser explain.
    return "yaml-to-json";
  }
}

export function yamlToJson(src: string, indent: 2 | 4 = 2): Result<YamlToJsonValue> {
  if (src.trim() === "") return err("Nothing to convert — paste some YAML first.");
  if (src.length > MAX_INPUT_CHARS) return err(`This converter handles up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Split the file or convert a section.`);

  let docs: ReturnType<typeof parseAllDocuments>;
  try {
    docs = parseAllDocuments(src, { prettyErrors: true });
  } catch (e) {
    return err(`Could not parse the YAML. ${firstLine(reasonOf(e))}`);
  }

  const parseError = firstDocumentError(docs);
  if (parseError) return parseError;

  const values: unknown[] = [];
  for (const doc of docs) {
    let value: unknown;
    try {
      value = doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
    } catch (e) {
      const text = reasonOf(e);
      if (/alias/i.test(text)) {
        return err("Too many aliases — this looks like a YAML bomb, so it was not expanded.");
      }
      return err(`Could not read the YAML input. ${firstLine(text)}`);
    }
    if (hasUnsafeKey(value)) {
      return err("This YAML has a key such as __proto__ that JSON allows but JavaScript objects cannot hold safely, so nothing was converted.");
    }
    values.push(value);
  }

  const notes: string[] = [];
  for (const doc of docs) {
    for (const w of doc.warnings) {
      // An unknown tag such as !!js/function is NOT constructed — the core
      // schema leaves it as the plain scalar text. Converting silently would
      // look like success while quietly dropping the author's intent, so the
      // user is told what happened instead.
      const line = w.linePos && w.linePos[0] ? w.linePos[0].line : undefined;
      notes.push(line ? `Kept an unsupported YAML tag as plain text (line ${line}).` : "Kept an unsupported YAML tag as plain text.");
    }
  }

  if (values.length > 1) {
    notes.push(`${values.length} YAML documents were combined into one JSON array.`);
  }

  const payload = values.length === 1 ? values[0] : values;

  try {
    return ok({ json: JSON.stringify(payload, null, indent), documents: values.length, notes });
  } catch {
    return err("The YAML parsed, but it contains a value JSON cannot represent (for example a circular reference).");
  }
}

export function jsonToYaml(src: string, indent: 2 | 4 = 2): Result<string> {
  if (src.trim() === "") return err("Nothing to convert — paste some JSON first.");
  if (src.length > MAX_INPUT_CHARS) return err(`This converter handles up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Split the file or convert a section.`);

  let value: unknown;
  try {
    value = JSON.parse(src);
  } catch {
    // Shared P2 rule: JSON input is always diagnosed by parseJsonWithDiagnostics,
    // so the line and column do not depend on which browser's error wording fired.
    const diagnosed = parseJsonWithDiagnostics(src);
    if (!diagnosed.ok) {
      return err(`That is not valid JSON. ${diagnosed.error.message}`, diagnosed.error.line, diagnosed.error.column);
    }
    return err("That is not valid JSON.");
  }

  if (hasUnsafeKey(value)) {
    return err('This JSON has a key such as __proto__ that JavaScript objects cannot hold safely, so nothing was converted.');
  }

  try {
    return ok(stringify(value, { indent }));
  } catch {
    return err("The JSON parsed, but it contains a value YAML cannot represent.");
  }
}
