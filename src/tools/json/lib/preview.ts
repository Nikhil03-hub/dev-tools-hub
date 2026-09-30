import { typeOf } from "./types";

export function previewValue(value: unknown, maxLen = 80): string {
  const t = typeOf(value);
  let s: string;
  if (t === "string") s = JSON.stringify(value);
  else if (t === "number" || t === "boolean") s = String(value);
  else if (t === "null") s = "null";
  else if (t === "array") s = `Array(${(value as unknown[]).length})`;
  else s = `Object(${Object.keys(value as object).length})`;
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}
