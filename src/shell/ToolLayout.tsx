import type { ReactNode } from "react";
import { CATEGORY_LABELS } from "../registry/types";
import type { ToolMeta } from "../registry/types";
import { getTool } from "../registry/tools";
import { interceptLinkClick } from "./navigation";

/**
 * The frame every tool page shares: breadcrumb, title, description, the privacy
 * line, the tool itself in a fixed-height workspace, and the docs block below
 * the fold. ToolHost supplies it, so tool components never wrap themselves and
 * a page can never end up with two H1s.
 */
export default function ToolLayout({
  tool,
  actions,
  children,
}: {
  tool: ToolMeta;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const related = tool.docs.related
    .map((id) => getTool(id))
    .filter((t) => t !== undefined)
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-12 pt-5 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-[12px] text-ink-faint">
        <a href="/" onClick={(e) => interceptLinkClick(e, "/")} className="focus-ring rounded hover:text-ink">
          Dev Tools Hub
        </a>
        <span aria-hidden="true" className="mx-1.5">›</span>
        <span>{CATEGORY_LABELS[tool.category]}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-[22px] font-semibold leading-[30px] tracking-[-0.01em] text-ink">{tool.title}</h1>
          <p className="mt-1 max-w-[70ch] text-[14px] leading-[22px] text-ink-dim">{tool.description}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-dim">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ok" />
            Runs locally — nothing you paste leaves this tab.
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>

      <div
        data-testid="tool-workspace"
        className="mt-4 overflow-hidden rounded-[10px] border border-border bg-canvas"
        style={{ height: "max(520px, calc(100vh - 220px))" }}
      >
        {children}
      </div>

      <section className="mt-10 max-w-[760px]">
        <h2 className="text-[16px] font-semibold text-ink">How to use</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-[22px] text-ink-dim">
          {tool.docs.howTo.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        {tool.docs.faq.length > 0 && (
          <>
            <h2 className="mt-7 text-[16px] font-semibold text-ink">FAQ</h2>
            <div className="mt-2 space-y-1.5">
              {tool.docs.faq.map((entry) => (
                <details key={entry.q} className="rounded-lg border border-border-subtle bg-surface px-3 py-2">
                  <summary className="focus-ring cursor-pointer rounded text-[14px] font-medium text-ink">{entry.q}</summary>
                  <p className="mt-1.5 text-[14px] leading-[22px] text-ink-dim">{entry.a}</p>
                </details>
              ))}
            </div>
          </>
        )}

        {related.length > 0 && (
          <>
            <h2 className="mt-7 text-[16px] font-semibold text-ink">Related tools</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {related.map((t) => (
                <a
                  key={t.id}
                  href={`/${t.slug}/`}
                  data-testid={`related-${t.id}`}
                  onClick={(e) => interceptLinkClick(e, `/${t.slug}/`)}
                  className="focus-ring rounded-lg border border-border-subtle bg-surface px-3 py-2 transition-colors hover:border-accent/40"
                >
                  <span className="block text-[13px] font-medium text-ink">{t.navTitle}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-dim">{t.description}</span>
                </a>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
