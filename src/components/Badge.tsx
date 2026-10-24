import type { ReactNode } from "react";

type Tone = "neutral" | "ok" | "warn" | "err" | "info" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "bg-raised text-ink-dim border-border",
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  err: "bg-err/10 text-err border-err/30",
  info: "bg-info/10 text-info border-info/30",
  accent: "bg-accent-soft text-accent border-accent/30",
};

export default function Badge({
  tone = "neutral",
  dashed = false,
  children,
}: {
  tone?: Tone;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${TONE[tone]} ${
        dashed ? "border-dashed" : ""
      }`}
    >
      {children}
    </span>
  );
}
