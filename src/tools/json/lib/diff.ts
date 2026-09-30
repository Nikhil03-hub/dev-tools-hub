import { typeOf, isPlainObject, type JsonType } from "./types";
import { formatJsonPath as formatPath } from "./path";

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  path: string;
  key: string | number | null;
  kind: DiffKind;
  leftType?: JsonType;
  rightType?: JsonType;
  oldValue?: unknown;
  newValue?: unknown;
  depth: number;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Structural diff between two parsed JSON values.
 *
 * Objects are compared by key (order-independent). Arrays are compared
 * index-by-index — a straightforward, predictable rule that covers the
 * common case (comparing two API responses or two config files) well, but
 * is a known simplification: inserting an item at the start of an array
 * will show every later index as "changed" rather than recognising the
 * shift, the way a minimal-edit sequence diff would. Flagged as a
 * candidate improvement if real usage shows it matters.
 */
export function diffJson(left: unknown, right: unknown): { entries: DiffEntry[]; summary: DiffSummary } {
  const entries: DiffEntry[] = [];
  const summary: DiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  function record(e: DiffEntry) {
    entries.push(e);
    summary[e.kind]++;
  }

  function walk(path: string, key: string | number | null, l: unknown, r: unknown, depth: number, lPresent: boolean, rPresent: boolean) {
    if (!lPresent && rPresent) {
      record({ path, key, kind: "added", rightType: typeOf(r), newValue: r, depth });
      return;
    }
    if (lPresent && !rPresent) {
      record({ path, key, kind: "removed", leftType: typeOf(l), oldValue: l, depth });
      return;
    }

    const lt = typeOf(l);
    const rt = typeOf(r);

    if (lt !== rt) {
      record({ path, key, kind: "changed", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
      return;
    }

    // Equal subtrees (of any size) collapse to a single row instead of
    // walking every leaf — keeps large-document diffs readable and fast.
    if ((lt === "object" || lt === "array") && deepEqual(l, r)) {
      record({ path, key, kind: "unchanged", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
      return;
    }

    if (lt === "object") {
      const lo = l as Record<string, unknown>;
      const ro = r as Record<string, unknown>;
      const keys = Array.from(new Set([...Object.keys(lo), ...Object.keys(ro)]));
      if (keys.length === 0) {
        record({ path, key, kind: "unchanged", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
        return;
      }
      for (const k of keys) {
        walk(
          formatPath(path, k),
          k,
          lo[k],
          ro[k],
          depth + 1,
          Object.prototype.hasOwnProperty.call(lo, k),
          Object.prototype.hasOwnProperty.call(ro, k)
        );
      }
      return;
    }

    if (lt === "array") {
      const la = l as unknown[];
      const ra = r as unknown[];
      const len = Math.max(la.length, ra.length);
      if (len === 0) {
        record({ path, key, kind: "unchanged", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
        return;
      }
      for (let i = 0; i < len; i++) {
        walk(formatPath(path, i), i, la[i], ra[i], depth + 1, i < la.length, i < ra.length);
      }
      return;
    }

    // Primitive leaf
    if (deepEqual(l, r)) {
      record({ path, key, kind: "unchanged", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
    } else {
      record({ path, key, kind: "changed", leftType: lt, rightType: rt, oldValue: l, newValue: r, depth });
    }
  }

  if (deepEqual(left, right)) {
    record({ path: "$", key: null, kind: "unchanged", leftType: typeOf(left), rightType: typeOf(right), oldValue: left, newValue: right, depth: 0 });
  } else {
    walk("$", null, left, right, 0, true, true);
  }

  return { entries, summary };
}
