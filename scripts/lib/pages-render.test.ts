import { describe, expect, it } from "vitest";
import { applyTemplate, escapeHtml, renderHead, renderSitemap, renderToolBody } from "./pages-render";
import { TOOL_META } from "../../src/registry/meta";

describe("escapeHtml", () => {
  it("escapes the five HTML-special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderHead", () => {
  it("escapes data and includes canonical + og tags", () => {
    const h = renderHead({ title: 'A "B" <C>', description: "d&d", canonical: "https://x.test/a/" });
    expect(h).toContain("<title>A &quot;B&quot; &lt;C&gt;</title>");
    expect(h).toContain('content="d&amp;d"');
    expect(h).toContain('<link rel="canonical" href="https://x.test/a/" />');
    expect(h).toContain('property="og:url"');
  });
});

describe("renderToolBody", () => {
  it("renders every docs section without raw '<' from data", () => {
    const t = TOOL_META[0];
    const html = renderToolBody(t, TOOL_META, "Debug & share");
    expect(html).toContain(`<h1>`);
    expect(html).toContain("How to use");
    expect(html).toContain("Debug &amp; share");
    for (const r of t.docs.related) {
      const slug = TOOL_META.find((x) => x.id === r)!.slug;
      expect(html).toContain(`href="/${slug}/"`);
    }
  });
});

describe("applyTemplate", () => {
  const tpl = `<head><!--SEO_HEAD_START--><title>old</title><!--SEO_HEAD_END--></head><div id="root"><!--PRERENDER--></div>`;
  it("replaces head block and prerender marker", () => {
    const out = applyTemplate(tpl, "<title>new</title>", "<main>x</main>");
    expect(out).toContain("<title>new</title>");
    expect(out).not.toContain("<title>old</title>");
    expect(out).toContain('<div id="root"><main>x</main></div>');
  });
  it("does not interpret $ patterns in replacement text", () => {
    const out = applyTemplate(tpl, "<title>$&$1</title>", "<p>$'</p>");
    expect(out).toContain("<title>$&$1</title>");
    expect(out).toContain("<p>$'</p>");
  });
  it("throws when markers are missing", () => {
    expect(() => applyTemplate("<head></head>", "", "")).toThrow(/SEO_HEAD/);
  });
});

describe("renderSitemap", () => {
  it("lists absolute URLs", () => {
    expect(renderSitemap("https://x.test", ["/", "/a/"])).toContain("<loc>https://x.test/a/</loc>");
  });
});
