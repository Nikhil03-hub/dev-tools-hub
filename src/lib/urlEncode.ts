// URL encode/decode — pure logic, no UI. `encodeURIComponent`/
// `decodeURIComponent` and `encodeURI`/`decodeURI` are genuinely different
// tools (they leave different character sets untouched), which is exactly
// the kind of distinction this hub prefers to make explicit on-screen
// rather than pick one silently — see the "Component" vs "Full URI" mode
// in UrlEncodePanel.tsx.

export type UrlEncodeMode = "component" | "full";

export type UrlEncodeResult = { ok: true; data: string } | { ok: false; error: string };

export function encodeUrl(text: string, mode: UrlEncodeMode): string {
  return mode === "component" ? encodeURIComponent(text) : encodeURI(text);
}

export function decodeUrl(text: string, mode: UrlEncodeMode): UrlEncodeResult {
  try {
    const data = mode === "component" ? decodeURIComponent(text) : decodeURI(text);
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: 'This doesn\'t look like validly percent-encoded text — it has a "%" not followed by two valid hex digits, or an incomplete escape sequence.',
    };
  }
}

export function buildUrlSample(mode: UrlEncodeMode): string {
  return mode === "component" ? "https://example.com/search?q=hello world & more" : "https://example.com/search?q=hello world#résumé";
}
