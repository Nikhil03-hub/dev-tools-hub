// T-202 pure diff engine. See docs/v3/tasks/P2_tools.md.
//
// Everything here is synchronous and bounded: the diff library is given a
// timeout in every mode, so a pathological pair returns `undefined` instead of
// freezing the tab, and this module turns that into a plain-language error.
import { createTwoFilesPatch, diffChars, diffLines, diffWords, diffWordsWithSpace } from "diff";
import type { ChangeObject } from "diff";
import type { Result } from "../result";
import { err, ok } from "../result";

export type DiffMode = "line" | "word" | "char";

export interface DiffPart {
  kind: "same" | "added" | "removed";
  value: string;
}

export interface DiffResult {
  parts: DiffPart[];
  /** Counts are in the unit of the mode: lines, words or characters. */
  added: number;
  removed: number;
  unchanged: number;
}

export interface DiffOptions {
  mode: DiffMode;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

/** Character mode is quadratic enough that size, not time, is the useful promise. */
const CHAR_MODE_LIMIT = 50_000;

/**
 * Passed in every mode, not just line mode as the spec's API note singles out:
 * measured, `diffChars` on two unrelated 40,000-character strings runs for over
 * 8 s, which is a frozen tab on the main thread. The library returns undefined
 * when it gives up, and that maps to the spec's timeout message.
 */
const TIMEOUT_MS = 2000;

// The library's change objects carry `count` in units of the mode already, and
// its types mark it required, so the stats are taken straight from it.
type Change = ChangeObject<string>;

function toParts(changes: Change[]): DiffPart[] {
  return changes.map((c) => ({ kind: c.added ? "added" : c.removed ? "removed" : "same", value: c.value }));
}

export function computeDiff(a: string, b: string, opts: DiffOptions): Result<DiffResult> {
  if (a === "" && b === "") return err("Nothing to compare yet — paste text on the left, the right, or both.");

  const ignoreWhitespace = opts.ignoreWhitespace === true;
  const ignoreCase = opts.ignoreCase === true;

  if (opts.mode === "char" && (a.length > CHAR_MODE_LIMIT || b.length > CHAR_MODE_LIMIT)) {
    return err(`Character mode is limited to ${CHAR_MODE_LIMIT.toLocaleString("en-US")} characters per side.`);
  }

  let changes: Change[] | undefined;
  if (opts.mode === "char") {
    changes = diffChars(a, b, { ignoreCase, timeout: TIMEOUT_MS });
  } else if (opts.mode === "word") {
    // diffWordsWithSpace keeps spacing as a visible difference; diffWords is the
    // whitespace-insensitive reading of the same pair. So the "ignore whitespace"
    // choice picks the function here, rather than a flag on it.
    changes = ignoreWhitespace
      ? diffWords(a, b, { ignoreCase, timeout: TIMEOUT_MS })
      : diffWordsWithSpace(a, b, { ignoreCase, timeout: TIMEOUT_MS });
  } else {
    // `ignoreCase` is not in diff@9.0.0's published line-options type, but it does
    // change the result at runtime: measured, a case-only difference collapses to a
    // single "same" part instead of remove+add. Built as a variable rather than a
    // literal so the undeclared key is passed through without a cast; the tests
    // assert the behaviour, so a version that stops honouring it fails loudly.
    const lineOptions = { ignoreWhitespace, ignoreCase, timeout: TIMEOUT_MS };
    changes = diffLines(a, b, lineOptions);
  }

  if (!changes) {
    return err("These texts are too different to compare quickly. Try line mode or a smaller part.");
  }

  const parts = toParts(changes);
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  changes.forEach((change, i) => {
    const kind = parts[i].kind;
    if (kind === "added") added += change.count;
    else if (kind === "removed") removed += change.count;
    else unchanged += change.count;
  });

  return ok({ parts, added, removed, unchanged });
}

export function unifiedPatch(a: string, b: string, nameA = "original.txt", nameB = "changed.txt"): string {
  return createTwoFilesPatch(nameA, nameB, a, b, "", "");
}

/** A patch of two identical texts is headers and nothing else, which is not worth a download. */
export function hasChanges(result: DiffResult): boolean {
  return result.added > 0 || result.removed > 0;
}
