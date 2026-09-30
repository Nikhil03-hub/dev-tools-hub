// Regex evaluation — same diagnostic philosophy as lib/jwt.ts: never throw
// to the console, always explain specifically what's wrong. Pure logic, no
// UI, no DOM — fully unit-testable in isolation.
//
// A few deliberate technical decisions, called out because they aren't
// obvious from the types alone:
//
// - The engine's own `d` (hasIndices) flag is always included internally,
//   never exposed as a user-facing toggle. Without it, a match only gives
//   you *values* for capture groups, not their start/end positions — `d`
//   is what makes per-group indices possible. Supported in every evergreen
//   browser since ~2022, so it's safe to rely on unconditionally here.
// - "All matches" vs "First match" in the UI maps directly to whether the
//   engine's `g` flag is included when the RegExp is built. A fresh RegExp
//   is constructed on every call (never reused across evaluations), so the
//   usual `lastIndex` statefulness footgun around `g` never applies here.
// - A capture group that did not participate in a match (e.g. group 1 in
//   `(a)?b` matched against `"b"`) has value `undefined`, not `""` — JS
//   itself distinguishes "didn't match" from "matched an empty string",
//   and this module preserves that distinction (`value: null` /
//   `start: null` / `end: null`) rather than collapsing it to an empty
//   string, which would be misleading.
// - Capture-group spans are always either nested inside, or disjoint
//   from, the overall match and from each other — they come from paired
//   parentheses in the pattern, which by construction can never partially
//   cross one another. That's what makes it safe for the highlight
//   renderer (tools/regex/components/MatchHighlight.tsx) to build a
//   simple nested-interval tree without ever hitting a crossing case.

export interface UiFlags {
  allMatches: boolean; // maps to the engine's `g` flag
  caseInsensitive: boolean; // `i`
  multiline: boolean; // `m`
  dotAll: boolean; // `s`
}

export const DEFAULT_FLAGS: UiFlags = {
  allMatches: true,
  caseInsensitive: false,
  multiline: false,
  dotAll: false,
};

export interface CaptureGroup {
  number: number; // 1-based, matches $1/$2/... numbering
  name: string | null; // null for a numbered-only group
  value: string | null; // null = did not participate in this match
  start: number | null; // JS (UTF-16 code unit) index; null if unmatched
  end: number | null;
}

export interface RegexMatch {
  text: string;
  start: number;
  end: number;
  groups: CaptureGroup[];
}

export interface RegexRunResult {
  matches: RegexMatch[];
  matchCount: number;
}

export type RegexResult = { ok: true; data: RegexRunResult } | { ok: false; error: string };

export interface ReplacementResult {
  ok: boolean;
  output: string;
  error?: string;
  changed: boolean; // false when the replacement was a no-op (zero matches)
}

const MAX_MATCHES = 5000; // sanity guard against runaway match counts on adversarial input

function buildFlagString(uiFlags: UiFlags): string {
  let flags = "d"; // always on — see module notes above
  if (uiFlags.allMatches) flags += "g";
  if (uiFlags.caseInsensitive) flags += "i";
  if (uiFlags.multiline) flags += "m";
  if (uiFlags.dotAll) flags += "s";
  return flags;
}

export function buildRegExp(pattern: string, uiFlags: UiFlags): RegExp {
  return new RegExp(pattern, buildFlagString(uiFlags));
}

// Walks the pattern source to find each capturing group's name (or null
// for a numbered-only group), in left-to-right order matching how the
// regex engine itself numbers groups. This only tracks paren / escape /
// character-class structure — it doesn't interpret quantifiers,
// alternation, or any other regex semantics, so it stays a narrow
// mechanical scan rather than a general regex parser (the kind of scope
// creep deliberately avoided for the "explain this pattern" feature,
// which stays out of V1 entirely). Known limitation: a `]` as the very
// first character of a character class (e.g. `[]abc]`, where that `]` is
// literal) isn't special-cased — rare enough in realistic developer
// patterns not to be worth the extra complexity here.
export function extractGroupNames(source: string): (string | null)[] {
  const names: (string | null)[] = [];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++; // skip the escaped character
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch !== "(") continue;
    if (source[i + 1] === "?") {
      if (source[i + 2] === "<" && source[i + 3] !== "=" && source[i + 3] !== "!") {
        const close = source.indexOf(">", i + 3);
        if (close === -1) continue; // malformed; let RegExp construction surface the real error
        names.push(source.slice(i + 3, close));
        i = close;
      }
      // else: non-capturing (?:...) or a lookaround (?=/?!/?<=/?<!) — not a capturing group
      continue;
    }
    names.push(null); // plain capturing group
  }
  return names;
}

// Typed as RegExpMatchArray (optional index/input) rather than
// RegExpExecArray (required index/input) specifically so this accepts
// results from *both* re.exec() and text.matchAll(re) without a cast —
// the two built-in lib types are structurally identical except for that
// optionality, and a real match's index is always present at runtime.
function toRegexMatch(m: RegExpMatchArray, groupNames: (string | null)[]): RegexMatch {
  const start = m.index ?? 0;
  const indices = (m as unknown as { indices?: Array<[number, number] | undefined> }).indices;
  const groups: CaptureGroup[] = [];
  for (let n = 1; n < m.length; n++) {
    const participated = m[n] !== undefined;
    const span = indices?.[n];
    groups.push({
      number: n,
      name: groupNames[n - 1] ?? null,
      value: participated ? m[n] : null,
      start: participated && span ? span[0] : null,
      end: participated && span ? span[1] : null,
    });
  }
  return { text: m[0], start, end: start + m[0].length, groups };
}

export function runRegex(pattern: string, uiFlags: UiFlags, text: string): RegexResult {
  if (pattern === "") return { ok: true, data: { matches: [], matchCount: 0 } };
  let re: RegExp;
  try {
    re = buildRegExp(pattern, uiFlags);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid regular expression." };
  }
  const groupNames = extractGroupNames(pattern);
  try {
    const matches: RegexMatch[] = [];
    if (uiFlags.allMatches) {
      for (const m of text.matchAll(re)) {
        matches.push(toRegexMatch(m, groupNames));
        if (matches.length >= MAX_MATCHES) break;
      }
    } else {
      const m = re.exec(text);
      if (m) matches.push(toRegexMatch(m, groupNames));
    }
    return { ok: true, data: { matches, matchCount: matches.length } };
  } catch (e) {
    // A syntactically valid pattern can still throw at match time in rare
    // cases (e.g. certain invalid backreferences); never let that reach
    // the console as an uncaught exception.
    return { ok: false, error: e instanceof Error ? e.message : "Regex evaluation failed." };
  }
}

export function applyReplacement(pattern: string, uiFlags: UiFlags, text: string, replacement: string): ReplacementResult {
  if (pattern === "") return { ok: true, output: text, changed: false };
  let re: RegExp;
  try {
    re = buildRegExp(pattern, uiFlags);
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Invalid regular expression.", changed: false };
  }
  try {
    // Native String.replace already implements $1 / $<name> / $& / $$ / $`
    // / $' replacement-pattern semantics correctly — nothing custom here.
    const output = text.replace(re, replacement);
    return { ok: true, output, changed: output !== text };
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Replacement failed.", changed: false };
  }
}

// A short, illustrative pattern/flags/text trio for the "Load sample"
// button — mirrors JSON's and JWT's own sample idiom. Deliberately
// exercises named groups, multiple matches, and a real-looking replace,
// so a first-time visitor immediately sees the tool doing something
// useful rather than a bare pretty-printed match.
export function buildSample(): { pattern: string; flags: UiFlags; text: string; replacement: string } {
  return {
    pattern: String.raw`(?<user>\w+)@(?<domain>[\w.-]+\.\w+)`,
    flags: { ...DEFAULT_FLAGS },
    text: "Contact us at support@example.com or sales@example.co.in for help.",
    replacement: "$<user> [at] $<domain>",
  };
}
