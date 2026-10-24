import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { toast } from "../lib/toastBus";

export const COPY_OK = "Copied";
export const COPY_FAILED = "Copy failed — select and copy manually";

/**
 * The one place that turns a clipboard result into user-visible feedback.
 * copyText() returns a boolean and can also reject; both are treated as failure.
 * Reporting "Copied" without checking is how a user ends up pasting an empty
 * clipboard into a support ticket, so this never announces success blindly.
 */
export async function copyAndNotify(text: string, successMessage: string = COPY_OK): Promise<boolean> {
  let ok = false;
  try {
    ok = await copyText(text);
  } catch {
    ok = false;
  }
  toast(ok ? successMessage : COPY_FAILED);
  return ok;
}

export default function CopyButton({
  getText,
  label = "Copy",
  testId,
  className = "",
}: {
  getText: () => string;
  label?: string;
  testId?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const ok = await copyAndNotify(getText());
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-raised px-2.5 text-[12px] font-medium text-ink-dim transition-colors hover:border-accent/40 hover:text-ink ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2} aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}
      {label}
    </button>
  );
}
