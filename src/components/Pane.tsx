import type { ReactNode } from "react";

export default function Pane({
  title,
  actions,
  footer,
  children,
  className = "",
}: {
  title?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          {title && <h2 className="text-[12px] font-semibold text-ink">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
      {footer && <div className="shrink-0 border-t border-border-subtle px-3 py-2">{footer}</div>}
    </section>
  );
}
