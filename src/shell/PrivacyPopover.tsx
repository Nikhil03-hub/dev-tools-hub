import Popover from "../components/Popover";
import { PRIVACY_PROMISE } from "../registry/pages";
import { interceptLinkClick } from "./navigation";

/**
 * The privacy claim, made inspectable. The visible pill says "Processed
 * locally"; the panel states the promise, quotes the exact CSP directive that
 * enforces it, and links to the page that tells you how to check it yourself.
 */
export default function PrivacyPopover() {
  return (
    <Popover
      testId="privacy-popover"
      triggerLabel="Processed locally. Open privacy details."
      triggerClassName="flex items-center gap-1.5 rounded-full border border-border bg-raised px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
      panelClassName="w-[19rem]"
      trigger={
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ok" />
          {/* Mobile shows the dot only (UX_SPEC §3.3); aria-label still carries the name. */}
          <span className="hidden sm:inline">Processed locally</span>
        </>
      }
    >
      <p className="font-medium text-ink">Nothing you paste leaves this tab</p>
      <p className="mt-2 text-ink-dim">{PRIVACY_PROMISE}</p>
      <p className="mt-2 text-ink-dim">
        Enforced by the page policy:{" "}
        <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">connect-src 'none'</code>
      </p>
      <a
        href="/privacy/"
        onClick={(e) => interceptLinkClick(e, "/privacy/")}
        className="focus-ring mt-3 inline-block rounded text-[13px] font-medium text-accent hover:underline"
      >
        How to verify
      </a>
    </Popover>
  );
}
