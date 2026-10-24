// Writes one static, crawlable HTML page per tool and per static page, plus
// sitemap.xml. Runs after `vite build`, before postbuild-security.mjs.
// See ARCHITECTURE.md §6.1. Usage: tsx scripts/postbuild-pages.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TOOL_META } from "../src/registry/meta";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../src/registry/types";
import { STATIC_PAGES } from "../src/registry/pages";
import { applyTemplate, renderHead, renderSitemap, renderStaticBody, renderToolBody } from "./lib/pages-render";

const DIST = "dist";
const ORIGIN = (process.env.SITE_ORIGIN || "https://json-workbench.netlify.app").replace(/\/+$/, "");

const templatePath = join(DIST, "index.html");
if (!existsSync(templatePath)) {
  console.error("postbuild-pages: dist/index.html missing — run vite build first.");
  process.exit(1);
}
const template = readFileSync(templatePath, "utf8");

function write(rel: string, html: string) {
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

const sitemapPaths: string[] = [];
const groups = CATEGORY_ORDER.map((c) => ({ label: CATEGORY_LABELS[c], tools: TOOL_META.filter((t) => t.category === c) }));

// Static pages (home is written last because it overwrites the template file).
for (const p of STATIC_PAGES) {
  const head = renderHead({ title: p.title, description: p.description, canonical: ORIGIN + (p.id === "notfound" ? "/" : p.path) });
  const body = renderStaticBody(p, p.id === "home" ? groups : undefined);
  const html = applyTemplate(template, head, body);
  if (p.id === "home") continue;
  if (p.id === "notfound") {
    write("404.html", html.replace('<meta name="description"', '<meta name="robots" content="noindex" />\n    <meta name="description"'));
    continue;
  }
  write(join(p.path.replace(/^\/|\/$/g, ""), "index.html"), html);
  sitemapPaths.push(p.path);
}

for (const t of TOOL_META) {
  const head = renderHead({ title: `${t.title} · Dev Tools Hub`, description: t.description, canonical: `${ORIGIN}/${t.slug}/` });
  const body = renderToolBody(t, TOOL_META, CATEGORY_LABELS[t.category]);
  write(join(t.slug, "index.html"), applyTemplate(template, head, body));
  sitemapPaths.push(`/${t.slug}/`);
}

const home = STATIC_PAGES.find((p) => p.id === "home")!;
writeFileSync(
  templatePath,
  applyTemplate(template, renderHead({ title: home.title, description: home.description, canonical: ORIGIN + "/" }), renderStaticBody(home, groups)),
);
sitemapPaths.unshift("/");

writeFileSync(join(DIST, "sitemap.xml"), renderSitemap(ORIGIN, sitemapPaths));
console.log(`postbuild-pages: ${TOOL_META.length} tool pages + ${STATIC_PAGES.length - 1} static pages + 404 + sitemap (${sitemapPaths.length} URLs) for ${ORIGIN}`);
