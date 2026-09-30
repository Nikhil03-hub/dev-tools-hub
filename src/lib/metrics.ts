// Anonymous, allow-listed usage counters (validation experiment only).
//
// Privacy design:
//  - Only these fixed event names can ever be sent. The function takes NO
//    free-form argument, so user input cannot reach the network through it.
//  - Transport is a 1×1 image request to GoatCounter's documented /count
//    pixel endpoint. The page CSP keeps connect-src 'none' (no fetch/XHR/
//    beacon/WebSocket) and allows ONLY that one image host.
//  - No cookies, no IDs. "debug-return" uses a local first-seen DATE flag
//    that never leaves the browser; only the event name is sent.
//  - Build without VITE_GC_CODE (the default) => every call is a no-op and
//    the page makes zero requests after load.

export type MetricEvent =
  | "view-debug"
  | "debug-analyze"
  | "debug-return"
  | "debug-copy-ai"
  | "debug-copy-issue"
  | "debug-copy-plain"
  | "debug-download-sanitized"
  | "debug-sample-expired-token"
  | "debug-sample-cors-har"
  | "debug-sample-java-log"
  | "fakedoor-cli"
  | "fakedoor-team";

const ALLOWED: ReadonlySet<string> = new Set<MetricEvent>([
  "view-debug", "debug-analyze", "debug-return", "debug-copy-ai", "debug-copy-issue", "debug-copy-plain",
  "debug-download-sanitized", "debug-sample-expired-token", "debug-sample-cors-har", "debug-sample-java-log",
  "fakedoor-cli", "fakedoor-team",
]);

function siteCode(): string {
  try {
    // Direct access so Vite can statically replace it at build time.
    const code = import.meta.env.VITE_GC_CODE ?? "";
    return /^[a-z0-9-]{2,40}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

const sentThisSession = new Set<string>();

/** Build the pixel URL for an event (exported for tests). Returns "" when disabled or not allowed. */
export function pixelUrl(event: MetricEvent, code = siteCode()): string {
  if (!code || !ALLOWED.has(event)) return "";
  return `https://${code}.goatcounter.com/count?p=${encodeURIComponent(`/e/${event}`)}&e=true&rnd=${Math.random().toString(36).slice(2, 8)}`;
}

/** Count an event. `once` = at most once per page session. */
export function track(event: MetricEvent, once = false): void {
  if (once && sentThisSession.has(event)) return;
  const url = pixelUrl(event);
  if (!url) return;
  sentThisSession.add(event);
  try {
    const img = new Image(1, 1);
    img.referrerPolicy = "no-referrer";
    img.src = url;
  } catch {
    /* counting must never break the tool */
  }
}

/** Fire "debug-return" once if this browser first used Debug Report on an earlier day. */
export function markDebugUseAndMaybeReturn(): void {
  try {
    const key = "dth.debug.firstSeen";
    const today = new Date().toISOString().slice(0, 10);
    const first = localStorage.getItem(key);
    if (!first) localStorage.setItem(key, today);
    else if (first < today) track("debug-return", true);
  } catch {
    /* storage blocked: skip silently */
  }
}
