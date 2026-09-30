import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";

/**
 * The report this experiment is built to test explicitly wants the
 * "runs entirely in your browser" claim demonstrated, not just asserted.
 * This badge states it plainly and the popover tells the visitor exactly
 * how to verify it themselves (open devtools, watch the Network tab) —
 * an inspectable claim rather than a marketing line.
 */
const DEFAULT_TEXT =
  "There's no backend: every tool runs in your browser. This page's Content-Security-Policy includes connect-src 'none', so the browser itself refuses any background request (fetch, XHR, beacons, WebSockets) from this page. Verify it: open DevTools → Network and use every tool — zero requests after load.";

// Shown only in the counters-enabled launch build (VITE_GC_CODE set at build time).
const COUNTERS_TEXT =
  'There\'s no backend: every tool runs in your browser. The only requests after load are anonymous counters: a fixed event name like "debug-analyze", sent as a 1×1 image to GoatCounter. Never your input, files or reports; no cookies. GoatCounter keeps only aggregate counts and doesn\'t store IP addresses. The Content-Security-Policy (connect-src \'none\') makes the browser refuse every other background request. Verify it in DevTools → Network.';

const COUNTERS_ON = /^[a-z0-9-]{2,40}$/.test(import.meta.env.VITE_GC_CODE ?? "");

export default function PrivacyBadge() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-raised px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-ok" strokeWidth={2} />
        <span className="hidden sm:inline">Processed locally</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 animate-slide-up rounded-xl border border-border bg-raised p-4 text-sm shadow-pop">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-medium text-ink">Nothing you paste leaves this tab</p>
            <button
              onClick={() => setOpen(false)}
              className="text-ink-faint hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-ink-dim">{COUNTERS_ON ? COUNTERS_TEXT : DEFAULT_TEXT}</p>
        </div>
      )}
    </div>
  );
}
