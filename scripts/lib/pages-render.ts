// Pure HTML helpers for scripts/postbuild-pages.ts. Everything that comes
// from data is escaped here; never build HTML any other way.
import type { ToolMeta } from "../../src/registry/types";
import type { StaticPage } from "../../src/registry/pages";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface HeadInfo {
  title: string;
  description: string;
  /** absolute URL */
  canonical: string;
}

export function renderHead(h: HeadInfo): string {
  const t = escapeHtml(h.title);
  const d = escapeHtml(h.description);
  const c = escapeHtml(h.canonical);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${c}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${c}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join("\n    ");
}

/** Prerendered, crawlable body for a tool page. React replaces it on mount. */
export function renderToolBody(t: ToolMeta, all: ToolMeta[], categoryLabel: string): string {
  const related = t.docs.related
    .map((id) => all.find((x) => x.id === id))
    .filter((x): x is ToolMeta => !!x)
    .map((x) => `<li><a href="/${escapeHtml(x.slug)}/">${escapeHtml(x.navTitle)}</a></li>`)
    .join("");
  const steps = t.docs.howTo.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const faq = t.docs.faq.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join("");
  return (
    `<main class="prerender">` +
    `<p class="prerender-crumb"><a href="/">Dev Tools Hub</a> › ${escapeHtml(categoryLabel)}</p>` +
    `<h1>${escapeHtml(t.title)}</h1>` +
    `<p>${escapeHtml(t.description)}</p>` +
    `<p>Runs locally — nothing you paste leaves this tab.</p>` +
    `<h2>How to use</h2><ol>${steps}</ol>` +
    (faq ? `<h2>FAQ</h2>${faq}` : "") +
    (related ? `<h2>Related tools</h2><ul>${related}</ul>` : "") +
    `<noscript><p>This tool needs JavaScript. It runs entirely in your browser.</p></noscript>` +
    `</main>`
  );
}

/** Prerendered body for a static page; the home page also lists every tool. */
export function renderStaticBody(p: StaticPage, toolsByCategory?: { label: string; tools: ToolMeta[] }[]): string {
  const paras = p.body.map((b) => `<p>${escapeHtml(b)}</p>`).join("");
  const lists = (toolsByCategory ?? [])
    .filter((g) => g.tools.length)
    .map(
      (g) =>
        `<h2>${escapeHtml(g.label)}</h2><ul>` +
        g.tools.map((t) => `<li><a href="/${escapeHtml(t.slug)}/">${escapeHtml(t.navTitle)}</a> — ${escapeHtml(t.description)}</li>`).join("") +
        `</ul>`,
    )
    .join("");
  const home = p.id === "home" ? "" : `<p><a href="/">Back to all tools</a></p>`;
  return `<main class="prerender"><h1>${escapeHtml(p.heading)}</h1>${paras}${lists}${home}</main>`;
}

/**
 * Replaces the block between <!--SEO_HEAD_START--> and <!--SEO_HEAD_END--> and
 * the <!--PRERENDER--> marker inside <div id="root">. Throws if a marker is
 * missing (a build-time error, never user input).
 */
export function applyTemplate(template: string, head: string, body: string): string {
  const headRe = /<!--SEO_HEAD_START-->[\s\S]*?<!--SEO_HEAD_END-->/;
  if (!headRe.test(template)) throw new Error("postbuild-pages: SEO_HEAD markers missing in dist/index.html");
  if (!template.includes("<!--PRERENDER-->")) throw new Error("postbuild-pages: <!--PRERENDER--> marker missing in dist/index.html");
  return template
    .replace(headRe, () => `<!--SEO_HEAD_START-->\n    ${head}\n    <!--SEO_HEAD_END-->`)
    .replace("<!--PRERENDER-->", () => body);
}

export function renderSitemap(origin: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${escapeHtml(origin + p)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
