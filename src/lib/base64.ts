// Base64 encode/decode — pure logic, no UI. Mirrors the never-throw,
// explain-what's-wrong result shape used by lib/jwt.ts, lib/regex.ts, and
// lib/timestamp.ts.
//
// Two deliberate design choices, worth stating rather than leaving
// implicit:
//
// 1. Encoding is Unicode-safe. A naive `btoa(text)` throws on any
//    character outside Latin-1 (accents, emoji, non-English text) — real
//    developer input is rarely pure ASCII, so this always goes through
//    `TextEncoder` to get UTF-8 bytes first, then encodes those bytes.
//    `String.fromCharCode` is called in chunks rather than once with the
//    whole byte array spread in, to stay well clear of any engine's
//    call-stack argument limit on large input.
//
// 2. Decoding auto-detects standard (`+ /`) vs URL-safe (`- _`) input,
//    rather than trusting a toggle. Unlike, say, interpreting a date/time
//    in an unstated timezone, this isn't a genuine ambiguity: whichever of
//    the two alphabets is actually present in the pasted text is the only
//    one that could have produced it, so detecting it is strictly correct,
//    not a guess — closer to this codebase's epoch-unit auto-detection
//    (lib/timestamp.ts) than to a real interpret/display judgment call.
//    The URL-safe toggle in the UI therefore only controls *encode*
//    output; decode accepts either.

export type Base64Result = { ok: true; data: string; warning?: string } | { ok: false; error: string };

const CHUNK_SIZE = 0x8000;

export function encodeBase64(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  const standard = btoa(binary);
  return urlSafe ? standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : standard;
}

function normalizeToStandardAlphabet(raw: string): string | null {
  const stripped = raw.replace(/\s+/g, "");
  const hasUrlSafe = /[-_]/.test(stripped);
  const hasStandard = /[+/]/.test(stripped);
  if (hasUrlSafe && hasStandard) return null; // genuinely mixed — not a valid single alphabet
  const standardBody = (hasUrlSafe ? stripped.replace(/-/g, "+").replace(/_/g, "/") : stripped).replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(standardBody)) return null;
  const padNeeded = (4 - (standardBody.length % 4)) % 4;
  return standardBody + "=".repeat(padNeeded);
}

export function decodeBase64(input: string): Base64Result {
  if (input.trim() === "") return { ok: false, error: "Enter some Base64 text to decode." };

  const normalized = normalizeToStandardAlphabet(input);
  if (normalized === null) {
    return {
      ok: false,
      error:
        "This doesn't look like valid Base64 — it mixes standard (+ /) and URL-safe (- _) characters, or contains characters outside the Base64 alphabet.",
    };
  }

  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    return { ok: false, error: "This doesn't look like valid Base64 — it has an invalid length or invalid characters for its alphabet." };
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  try {
    const data = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, data };
  } catch {
    const lenient = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return {
      ok: true,
      data: lenient,
      warning:
        "Decoded successfully as bytes, but the result isn't valid UTF-8 text — this may be binary data (an image, an encrypted blob, etc). Showing a best-effort decode; � marks bytes that couldn't be read as text.",
    };
  }
}

export function buildBase64Sample(): string {
  return "Dev Tools Hub — supports UTF-8 text like café, 日本語, and 🎉.";
}
