import type { StaticPage as StaticPageData } from "../registry/pages";
import { interceptLinkClick } from "./navigation";

/**
 * /privacy/, /about/ and 404. The same text is prerendered into the static HTML,
 * so this component only has to look right once React takes over — including
 * when the route was reached by client-side navigation rather than a page load.
 */
export default function StaticPage({ page, onOpenPalette }: { page: StaticPageData; onOpenPalette: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 py-12">
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">{page.heading}</h1>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-dim">
        {page.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      {page.id === "notfound" ? (
        <button
          type="button"
          onClick={onOpenPalette}
          className="focus-ring mt-6 inline-flex h-9 items-center rounded-lg bg-accent-strong px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Search tools
        </button>
      ) : (
        <a
          href="/"
          onClick={(e) => interceptLinkClick(e, "/")}
          className="focus-ring mt-8 inline-block rounded text-sm font-medium text-accent hover:underline"
        >
          Back to all tools
        </a>
      )}
    </main>
  );
}
