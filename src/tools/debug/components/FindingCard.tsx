import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Finding, Severity } from "../../../lib/debugkit/types";

const SEVERITY_CLASS: Record<Severity, string> = {
  high: "border-err/30 bg-err/10 text-err",
  medium: "border-warn/30 bg-warn/10 text-warn",
  low: "border-accent/30 bg-accent/10 text-accent",
  info: "border-border bg-raised text-ink-dim",
};

export default function FindingCard({ finding, defaultOpen }: { finding: Finding; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article
      data-testid="finding-card"
      data-finding-id={finding.id}
      data-severity={finding.severity}
      className="rounded-lg border border-border-subtle bg-raised/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase ${SEVERITY_CLASS[finding.severity]}`}>
          {finding.severity}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-ink-dim">
          {finding.label === "DETECTED" ? "Detected" : "Not verified"}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-ink">{finding.title}</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-dim">
        <span className="font-medium text-ink">Do:</span> {finding.action}
      </p>
      <button
        type="button"
        data-testid="btn-finding-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-accent hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} /> : <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />}
        Why &amp; evidence
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border-subtle pt-2">
          <p className="text-[13px] leading-5 text-ink-dim">
            <span className="font-medium text-ink">Why:</span> {finding.why}
          </p>
          {finding.evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink">Evidence</p>
              <ul className="mt-1 space-y-1">
                {finding.evidence.map((e, i) => (
                  <li key={i} className="break-all font-mono text-[12px] text-ink-dim">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finding.ref && (
            <a href={finding.ref} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline">
              Reference
            </a>
          )}
        </div>
      )}
    </article>
  );
}
