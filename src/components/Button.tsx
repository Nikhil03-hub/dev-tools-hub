import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent-strong text-on-accent hover:bg-accent-hover border border-transparent",
  secondary: "bg-raised text-ink border border-border hover:border-accent/40",
  ghost: "bg-transparent text-ink-dim border border-transparent hover:bg-raised hover:text-ink",
  danger: "bg-transparent text-err border border-err/40 hover:bg-err/10",
};

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  kbd,
  loading = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
  kbd?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`focus-ring inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3 text-[13px]"
      } ${VARIANT[variant]} ${className}`}
    >
      {loading ? <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
      {kbd}
    </button>
  );
}
