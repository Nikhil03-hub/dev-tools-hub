const { chromium } = require(process.env.PW_MODULE || "playwright");

const BASE = process.env.E2E_BASE || "http://127.0.0.1:4173/";
const SHOT_DIR = process.env.SHOT_DIR || "test-results/e2e-shots";
require("fs").mkdirSync(SHOT_DIR, { recursive: true });

const BROKEN_JSON = '{\n  "a": 1,\n  "b": [1, 2,]\n}';

function bigJson(n) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      id: i,
      name: `item-${i}`,
      active: i % 3 === 0,
      score: Math.round(Math.random() * 1000) / 10,
      tags: ["a", "b", i % 2 === 0 ? "even" : "odd"],
      meta: { createdAt: "2026-01-01T00:00:00Z", nested: { deep: { value: i } } },
    });
  }
  return JSON.stringify({ count: n, items });
}

async function setEditorContent(page, containerSelector, text) {
  const content = page.locator(`${containerSelector} .cm-content`);
  await content.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.insertText(text);
}

// A page with its own console-error collector, for sections that navigate.
// AGENTS.md §8: never navigate the shared `page` — that would add requests to
// the after-load network checks it owns.
async function newCheckedPage(context) {
  const p = await context.newPage();
  const errors = [];
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { p, errors };
}

// WCAG 2.x relative-luminance contrast ratio for two [r,g,b] triples.
function contrastRatio(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// "rgb(86, 70, 216)" or "150 138 250" -> [86,70,216]
function parseRgb(str) {
  const n = String(str).match(/\d+(?:\.\d+)?/g);
  return n ? n.slice(0, 3).map(Number) : null;
}

/**
 * Counts accent-coloured pixels along each edge of `box` in a PNG screenshot.
 *
 * Computed CSS cannot see paint order: the shipped editor ring reported
 * `outline: 2px solid accent` on all four sides while the sticky, opaque
 * line-number gutter overpainted the left one, so only three edges rendered.
 * This decodes the actual pixels. Tolerant per channel so anti-aliased edges
 * still count, and it samples mid-edge to skip rounded-corner clipping.
 */
async function edgeCoverage(analyzer, png, box, accent, tol = 45) {
  const res = await analyzer.evaluate(
    async ({ b64, box, accent, tol }) => {
      const img = new Image();
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = "data:image/png;base64," + b64; });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => { const i = ((y | 0) * c.width + (x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const hit = (p) => Math.abs(p[0] - accent[0]) < tol && Math.abs(p[1] - accent[1]) < tol && Math.abs(p[2] - accent[2]) < tol;
      const line = (pts) => {
        let h = 0;
        for (const [x, y] of pts) if (hit(at(x, y))) h++;
        return { hits: h, sampled: pts.length };
      };
      const L = [], R = [], T = [], B = [];
      for (let y = box.t + 14; y <= box.b - 14; y += 4) { L.push([box.l + 1, y]); R.push([box.r - 2, y]); }
      for (let x = box.l + 14; x <= box.r - 14; x += 4) { T.push([x, box.t + 1]); B.push([x, box.b - 2]); }
      return { left: line(L), right: line(R), top: line(T), bottom: line(B) };
    },
    { b64: png.toString("base64"), box, accent, tol }
  );
  const ratio = (e) => (e.sampled ? e.hits / e.sampled : 0);
  return { edges: res, ratio, allFour: ["left", "right", "top", "bottom"].every((k) => ratio(res[k]) >= 0.9) };
}

/**
 * In-page: measure the rendered contrast of every highlighted run inside a
 * container, compositing each element's own background through its ancestors.
 *
 * Two things make a naive version lie, and both were hit while diagnosing N-1:
 * highlight backgrounds STACK (a capture group's alpha sits on its parent group's
 * alpha, which sits on the match's), so the real background is far more saturated
 * than any single class suggests; and a `rgba()` value must not be compared as if
 * it were opaque. Runs in the page because only getComputedStyle sees the cascade.
 */
function measureHighlightContrast(rootSelector) {
  const parse = (x) => {
    const m = String(x).match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null;
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [a * fg[0] + (1 - a) * bg[0], a * fg[1] + (1 - a) * bg[1], a * fg[2] + (1 - a) * bg[2]];
  };
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const effBg = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] >= 1) break;
      }
    }
    let out = stack.length && stack[stack.length - 1][3] >= 1 ? stack[stack.length - 1].slice(0, 3) : [255, 255, 255];
    for (let i = stack.length - 2; i >= 0; i--) out = over(stack[i], [...out, 1]);
    return out;
  };
  const root = document.querySelector(rootSelector);
  if (!root) return { missing: true, rows: [] };
  const rows = [];
  const walk = (el, depth) => {
    for (const kid of el.children) {
      const tag = kid.tagName.toLowerCase();
      const isHighlight = tag === "mark" || tag === "span";
      const level = tag === "mark" ? 0 : depth + 1;
      if (isHighlight && (kid.textContent || "").trim() !== "") {
        const cs = getComputedStyle(kid);
        const bg = effBg(kid);
        const fg = parse(cs.color);
        const eff = fg[3] < 1 ? over(fg, [...bg, 1]) : fg.slice(0, 3);
        rows.push({
          level,
          tag,
          text: (kid.textContent || "").slice(0, 10),
          color: cs.color,
          fg: eff.map(Math.round),
          bg: bg.map(Math.round),
          ratio: +ratio(eff, bg).toFixed(2),
          fontSize: cs.fontSize,
        });
      }
      walk(kid, isHighlight ? level : depth);
    }
  };
  walk(root, -1);
  // The unhighlighted base text is the reference pair for this container.
  const baseCs = getComputedStyle(root);
  const baseBg = effBg(root);
  const baseFg = parse(baseCs.color);
  rows.push({ level: "base", tag: "pre", text: (root.textContent || "").slice(0, 10), color: baseCs.color, fg: baseFg.slice(0, 3).map(Math.round), bg: baseBg.map(Math.round), ratio: +ratio(baseFg.slice(0, 3), baseBg).toFixed(2), fontSize: baseCs.fontSize });
  return { rows, uaBlackMark: rows.some((r) => r.tag === "mark" && r.color === "rgb(0, 0, 0)") };
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  let loadFinished = false;
  const requestsAfterLoad = [];
  const allRequests = [];
  page.on("request", (req) => {
    allRequests.push(req.url());
    if (loadFinished) requestsAfterLoad.push({ url: req.url(), resourceType: req.resourceType() });
  });

  const results = {};
  const failures = [];
  function check(name, cond, detail) {
    results[name] = !!cond;
    if (!cond) failures.push(detail ? `${name}: ${detail}` : name);
  }

  // ---- Load ----
  await page.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  loadFinished = true;

  check("title_is_dev_tools_hub", /Dev Tools Hub/.test(await page.title()), await page.title());
  check("initial_requests_only_document", allRequests.filter((u) => !u.startsWith(BASE + "assets/")).length <= 1, JSON.stringify(allRequests));

  await page.screenshot({ path: `${SHOT_DIR}/01-empty-desktop.png` });

  // ---- Load sample -> tree ----
  await page.getByTestId("btn-load-sample").click();
  await page.waitForTimeout(200);
  check("tab_tree_active_after_sample", await page.getByTestId("json-tree").isVisible());
  check("tree_shows_customer_key", await page.locator('[data-testid="json-tree"] >> text=customer').first().isVisible().catch(() => false));
  check("status_pill_valid_after_sample", (await page.getByTestId("status-pill").getAttribute("data-status")) === "valid");
  await page.screenshot({ path: `${SHOT_DIR}/02-sample-tree-desktop.png` });

  // ---- Tree expand/collapse ----
  const firstToggle = page.locator('[data-testid="json-tree"] .cursor-pointer').first();
  const childCountBefore = await page.locator('[data-testid="json-tree"] div').count();
  await firstToggle.click();
  await page.waitForTimeout(100);
  const childCountAfter = await page.locator('[data-testid="json-tree"] div').count();
  check("tree_toggle_changes_dom", childCountBefore !== childCountAfter, `${childCountBefore} vs ${childCountAfter}`);

  // ---- Format / Minify ----
  await setEditorContent(page, '[data-testid="main-editor"]', '{"z":1,   "a":[1,2,3]}');
  await page.waitForTimeout(150);
  await page.getByTestId("btn-format").click();
  await page.waitForTimeout(100);
  let editorText = await page.locator('[data-testid="main-editor"] .cm-content').innerText();
  check("format_pretty_prints", editorText.includes("\n") && editorText.includes("  "), editorText);

  await page.getByTestId("btn-minify").click();
  await page.waitForTimeout(100);
  editorText = await page.locator('[data-testid="main-editor"] .cm-content').innerText();
  check("minify_removes_newlines", !editorText.trim().includes("\n"), editorText);

  // ---- Malformed JSON ----
  await setEditorContent(page, '[data-testid="main-editor"]', BROKEN_JSON);
  await page.waitForTimeout(200);
  const statusText = await page.getByTestId("status-pill").innerText();
  check("malformed_shows_invalid_status", (await page.getByTestId("status-pill").getAttribute("data-status")) === "invalid", statusText);
  check("malformed_shows_line_col", /Line \d+, Col \d+/.test(statusText), statusText);
  check("malformed_mentions_trailing_comma", /trailing comma/i.test(statusText), statusText);
  await page.screenshot({ path: `${SHOT_DIR}/03-malformed-error.png` });

  // ---- Empty input message ----
  await page.getByTestId("btn-clear").click();
  await page.waitForTimeout(100);
  check("empty_status_shown", (await page.getByTestId("status-pill").getAttribute("data-status")) === "empty");

  // ---- Large JSON ----
  const big = bigJson(3000);
  const t0 = Date.now();
  await setEditorContent(page, '[data-testid="main-editor"]', big);
  await page.waitForTimeout(400);
  const parseMs = Date.now() - t0;
  const bigStatus = await page.getByTestId("status-pill").getAttribute("data-status");
  check("large_json_parses_valid", bigStatus === "valid", bigStatus);
  check("large_json_reasonably_fast", parseMs < 6000, `${parseMs}ms`);
  await page.getByTestId("tab-tree").click();
  await page.waitForTimeout(300);
  check("large_json_tree_renders", await page.getByTestId("json-tree").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/04-large-json-tree.png` });

  // reload sample for further tests
  await page.getByTestId("btn-load-sample").click();
  await page.waitForTimeout(200);

  // ---- Diff ----
  await page.getByTestId("tab-diff").click();
  await page.waitForTimeout(150);
  await page.locator("text=Load an example to compare").click().catch(() => {});
  await page.waitForTimeout(300);
  const diffVisible = await page.getByTestId("diff-result").isVisible().catch(() => false);
  check("diff_result_visible", diffVisible);
  if (diffVisible) {
    const diffText = await page.getByTestId("diff-result").innerText();
    check("diff_shows_changed_status", /changed/i.test(diffText), diffText.slice(0, 200));
  }
  await page.screenshot({ path: `${SHOT_DIR}/05-diff-view.png` });

  // ---- Schema ----
  await page.getByTestId("tab-schema").click();
  await page.waitForTimeout(150);
  await page.getByTestId("btn-load-sample-schema").click();
  await page.waitForTimeout(300);
  check("schema_valid_shown", await page.getByTestId("schema-valid").isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOT_DIR}/06-schema-valid.png` });

  // break the data against the schema
  await setEditorContent(
    page,
    '[data-testid="main-editor"]',
    JSON.stringify({ id: "x", status: "not-a-real-status", total: -5, customer: { name: "A" }, items: [] })
  );
  await page.waitForTimeout(350);
  const schemaIssuesVisible = await page.getByTestId("schema-issues").isVisible().catch(() => false);
  check("schema_issues_shown_for_bad_data", schemaIssuesVisible);
  await page.screenshot({ path: `${SHOT_DIR}/07-schema-issues.png` });

  // ---- TypeScript ----
  await page.getByTestId("btn-load-sample").click();
  await page.waitForTimeout(200);
  await page.getByTestId("tab-ts").click();
  await page.waitForTimeout(200);
  const tsText = await page.locator('[data-testid="ts-output"] .cm-content').innerText();
  check("ts_has_root_interface", /interface Root/.test(tsText), tsText.slice(0, 300));
  check("ts_has_customer_field", /customer/.test(tsText), tsText.slice(0, 300));
  check("ts_has_items_array", /items:/.test(tsText), tsText.slice(0, 300));
  await page.screenshot({ path: `${SHOT_DIR}/08-typescript-view.png` });

  // ==== Hub: tool switcher, state preservation, scoped commands ====

  check(
    "tool_switcher_starts_on_json",
    (await page.getByTestId("tool-tab-json").getAttribute("aria-current")) === "page"
  );

  // Command palette content is scoped to whichever tool is active.
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  let paletteText = await page.getByTestId("command-palette").innerText();
  check("json_palette_has_format_command", /Format JSON/i.test(paletteText), paletteText.slice(0, 200));
  check("json_palette_has_no_jwt_commands", !/Load sample JWT/i.test(paletteText), paletteText.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // Put distinctive content in the JSON editor, then switch away and back —
  // both tools stay mounted specifically so this should be preserved.
  await setEditorContent(page, '[data-testid="main-editor"]', '{"switch_test_marker": 12345}');
  await page.waitForTimeout(200);
  await page.getByTestId("tool-tab-jwt").click();
  await page.waitForTimeout(200);
  check(
    "tool_switcher_shows_jwt_active",
    (await page.getByTestId("tool-tab-jwt").getAttribute("aria-current")) === "page"
  );
  check("jwt_status_empty_initially", (await page.getByTestId("jwt-status").getAttribute("data-status")) === "empty");

  await page.getByTestId("tool-tab-json").click();
  await page.waitForTimeout(200);
  const preservedText = await page.locator('[data-testid="main-editor"] .cm-content').innerText();
  check("json_state_preserved_after_tool_switch", preservedText.includes("switch_test_marker"), preservedText);

  // ==== JWT Decoder ====

  await page.getByTestId("tool-tab-jwt").click();
  await page.waitForTimeout(200);

  // Palette scoping flips with the active tool.
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  paletteText = await page.getByTestId("command-palette").innerText();
  check("jwt_palette_has_jwt_commands", /Load sample JWT/i.test(paletteText), paletteText.slice(0, 200));
  check("jwt_palette_has_no_format_command", !/Format JSON/i.test(paletteText), paletteText.slice(0, 200));
  check("jwt_palette_offers_switch_back", /Switch to JSON Workbench/i.test(paletteText), paletteText.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // ---- JWT: malformed input, each a specific message, never a crash ----
  await page.getByTestId("jwt-input").locator("textarea").fill("not-a-jwt");
  await page.waitForTimeout(200);
  let jwtStatusText = await page.getByTestId("jwt-status").innerText();
  check(
    "jwt_wrong_segment_count_reported",
    (await page.getByTestId("jwt-status").getAttribute("data-status")) === "invalid" && /3 dot-separated segments/i.test(jwtStatusText),
    jwtStatusText
  );

  await page.getByTestId("jwt-input").locator("textarea").fill("!!!.!!!.sig");
  await page.waitForTimeout(200);
  jwtStatusText = await page.getByTestId("jwt-status").innerText();
  check(
    "jwt_bad_base64_reported",
    (await page.getByTestId("jwt-status").getAttribute("data-status")) === "invalid" && /base64url/i.test(jwtStatusText),
    jwtStatusText
  );

  const notJsonHeader = Buffer.from("not json at all").toString("base64url");
  await page.getByTestId("jwt-input").locator("textarea").fill(`${notJsonHeader}.${notJsonHeader}.sig`);
  await page.waitForTimeout(200);
  jwtStatusText = await page.getByTestId("jwt-status").innerText();
  check(
    "jwt_non_json_segment_reported",
    (await page.getByTestId("jwt-status").getAttribute("data-status")) === "invalid" && /isn't valid JSON/i.test(jwtStatusText),
    jwtStatusText
  );
  check("no_console_errors_after_malformed_jwt", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // ---- JWT: load sample -> valid decode ----
  await page.getByTestId("btn-jwt-sample").click();
  await page.waitForTimeout(200);
  check("jwt_status_valid_after_sample", (await page.getByTestId("jwt-status").getAttribute("data-status")) === "valid");
  check("jwt_claims_shown", await page.getByTestId("jwt-claims").isVisible().catch(() => false));

  const jwtPayloadText = await page.locator('[data-testid="jwt-payload-output"] .cm-content').innerText();
  check("jwt_payload_shows_sub_claim", /"sub"/.test(jwtPayloadText), jwtPayloadText.slice(0, 200));
  check("jwt_payload_shows_role_claim", /"role"/.test(jwtPayloadText), jwtPayloadText.slice(0, 200));

  await page.getByTestId("jwt-tab-header").click();
  await page.waitForTimeout(150);
  const jwtHeaderText = await page.locator('[data-testid="jwt-header-output"] .cm-content').innerText();
  check("jwt_header_shows_alg", /"alg"/.test(jwtHeaderText), jwtHeaderText.slice(0, 200));
  await page.screenshot({ path: `${SHOT_DIR}/11-jwt-header-desktop.png` });

  await page.getByTestId("jwt-tab-signature").click();
  await page.waitForTimeout(150);
  const sigWarningText = await page.getByTestId("jwt-signature-warning").innerText();
  check("jwt_signature_labeled_unverified", /not verified/i.test(sigWarningText), sigWarningText);
  check("jwt_signature_value_shown", await page.getByTestId("jwt-signature-value").isVisible().catch(() => false));

  // ---- JWT: copy / download per segment ----
  await page.getByTestId("jwt-tab-payload").click();
  await page.waitForTimeout(150);
  await page.getByTestId("btn-copy-payload").click();
  await page.waitForTimeout(150);
  const jwtClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check("jwt_copy_payload_sets_clipboard", typeof jwtClipboard === "string" && jwtClipboard.includes('"sub"'), String(jwtClipboard).slice(0, 100));

  const jwtDownloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-download-payload").click();
  const jwtDl = await jwtDownloadPromise.catch(() => null);
  check("jwt_download_button_triggers_download", !!jwtDl, jwtDl ? jwtDl.suggestedFilename() : "no download event");

  // ---- JWT: clear ----
  await page.getByTestId("btn-jwt-clear").click();
  await page.waitForTimeout(150);
  check("jwt_status_empty_after_clear", (await page.getByTestId("jwt-status").getAttribute("data-status")) === "empty");

  // ---- JWT: mobile viewport ----
  await page.getByTestId("btn-jwt-sample").click();
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const jwtMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check("jwt_mobile_no_horizontal_overflow", !jwtMobileOverflow, "scrollWidth vs clientWidth");
  check("jwt_toolbar_visible_mobile", await page.getByTestId("btn-jwt-sample").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/12-jwt-mobile.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // ==== Regex Tester ====

  await page.getByTestId("tool-tab-regex").click();
  await page.waitForTimeout(200);
  check(
    "tool_switcher_shows_regex_active",
    (await page.getByTestId("tool-tab-regex").getAttribute("aria-current")) === "page"
  );
  check("regex_status_empty_initially", (await page.getByTestId("regex-status").getAttribute("data-status")) === "empty");

  // Palette scoping flips to Regex's own commands.
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  paletteText = await page.getByTestId("command-palette").innerText();
  check("regex_palette_has_regex_commands", /Load sample pattern/i.test(paletteText), paletteText.slice(0, 200));
  check("regex_palette_has_no_jwt_commands", !/Load sample JWT/i.test(paletteText), paletteText.slice(0, 200));
  check("regex_palette_has_no_json_commands", !/Format JSON/i.test(paletteText), paletteText.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // ---- Basic multi-match ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`\d+`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("there are 42 cats and 7 dogs");
  await page.waitForTimeout(200);
  check("regex_status_valid_2_matches", (await page.getByTestId("regex-status").getAttribute("data-match-count")) === "2");
  await page.getByTestId("regex-tab-list").click();
  await page.waitForTimeout(150);
  let matchListText = await page.getByTestId("regex-match-list").innerText();
  check("regex_match_list_shows_42", /42/.test(matchListText), matchListText.slice(0, 200));
  check("regex_match_list_shows_7", /\b7\b/.test(matchListText), matchListText.slice(0, 200));
  check("regex_match_0_correct_index", (await page.getByTestId("regex-match-0").innerText()).includes("10"));
  check("regex_match_1_correct_index", (await page.getByTestId("regex-match-1").innerText()).includes("22"));
  await page.screenshot({ path: `${SHOT_DIR}/13-regex-matches-desktop.png` });

  // ---- First match only vs all matches ----
  await page.getByTestId("regex-mode-first").click();
  await page.waitForTimeout(200);
  check("regex_first_match_only_1_result", (await page.getByTestId("regex-status").getAttribute("data-match-count")) === "1");
  await page.getByTestId("regex-mode-all").click();
  await page.waitForTimeout(200);

  // ---- Case-insensitive ----
  await page.getByTestId("regex-pattern-input").fill("hello");
  await page.getByTestId("regex-text-input").locator("textarea").fill("Hello HELLO hello");
  await page.waitForTimeout(200);
  const beforeCI = await page.getByTestId("regex-status").getAttribute("data-match-count");
  await page.getByTestId("regex-flag-i").click();
  await page.waitForTimeout(200);
  const afterCI = await page.getByTestId("regex-status").getAttribute("data-match-count");
  check("regex_case_insensitive_finds_more", Number(afterCI) > Number(beforeCI), `${beforeCI} -> ${afterCI}`);
  await page.getByTestId("regex-flag-i").click();
  await page.waitForTimeout(150);

  // ---- Multiline ----
  await page.getByTestId("regex-pattern-input").fill("^b");
  await page.getByTestId("regex-text-input").locator("textarea").fill("a\nb\nc");
  await page.waitForTimeout(200);
  const beforeML = await page.getByTestId("regex-status").getAttribute("data-match-count");
  await page.getByTestId("regex-flag-m").click();
  await page.waitForTimeout(200);
  const afterML = await page.getByTestId("regex-status").getAttribute("data-match-count");
  check("regex_multiline_matches_line_start", beforeML === "0" && afterML === "1", `${beforeML} -> ${afterML}`);
  await page.getByTestId("regex-flag-m").click();
  await page.waitForTimeout(150);

  // ---- Dot matches newline ----
  await page.getByTestId("regex-pattern-input").fill("a.b");
  await page.getByTestId("regex-text-input").locator("textarea").fill("a\nb");
  await page.waitForTimeout(200);
  const beforeDA = await page.getByTestId("regex-status").getAttribute("data-match-count");
  await page.getByTestId("regex-flag-s").click();
  await page.waitForTimeout(200);
  const afterDA = await page.getByTestId("regex-status").getAttribute("data-match-count");
  check("regex_dot_all_matches_newline", beforeDA === "0" && afterDA === "1", `${beforeDA} -> ${afterDA}`);
  await page.getByTestId("regex-flag-s").click();
  await page.waitForTimeout(150);

  // ---- Numbered capture groups ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`(\w+)@(\w+)\.com`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("alice@example.com");
  await page.waitForTimeout(200);
  await page.getByTestId("regex-tab-list").click();
  await page.waitForTimeout(150);
  check("regex_group_1_visible", await page.getByTestId("regex-group-1").isVisible().catch(() => false));
  check("regex_group_2_visible", await page.getByTestId("regex-group-2").isVisible().catch(() => false));
  const group1Text = await page.getByTestId("regex-group-1").innerText();
  check("regex_group_1_value_alice", /alice/.test(group1Text), group1Text);

  // ---- Named capture groups ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`(?<user>\w+)@(?<domain>\w+)\.com`);
  await page.waitForTimeout(200);
  const namedGroupText = await page.getByTestId("regex-group-1").innerText();
  check("regex_named_group_shows_name", /user/i.test(namedGroupText), namedGroupText);

  // ---- Unmatched optional capture group: distinguishable from an empty string ----
  await page.getByTestId("regex-pattern-input").fill("(a)?b");
  await page.getByTestId("regex-text-input").locator("textarea").fill("b");
  await page.waitForTimeout(200);
  check(
    "regex_unmatched_group_labeled_not_matched",
    await page.getByTestId("regex-group-1-unmatched").isVisible().catch(() => false)
  );

  // ---- Zero matches on a valid pattern must not look like an error ----
  await page.getByTestId("regex-pattern-input").fill("zzz_no_match_zzz");
  await page.getByTestId("regex-text-input").locator("textarea").fill("nothing here matches that");
  await page.waitForTimeout(200);
  check("regex_zero_matches_status_is_valid", (await page.getByTestId("regex-status").getAttribute("data-status")) === "valid");
  check("regex_zero_matches_count_is_zero", (await page.getByTestId("regex-status").getAttribute("data-match-count")) === "0");

  // ---- Invalid patterns: test state/behavior, never exact browser wording ----
  await page.getByTestId("regex-pattern-input").fill("(unterminated");
  await page.waitForTimeout(200);
  check("regex_invalid_pattern_1_status", (await page.getByTestId("regex-status").getAttribute("data-status")) === "invalid");
  const invalidMsg = await page.getByTestId("regex-status").innerText();
  check("regex_invalid_pattern_shows_nonempty_message", invalidMsg.trim().length > 0, invalidMsg);
  check("regex_invalid_pattern_no_stale_match_count", (await page.getByTestId("regex-status").getAttribute("data-match-count")) === null);
  check(
    "regex_invalid_pattern_hides_match_list",
    !(await page.getByTestId("regex-match-list").isVisible().catch(() => false))
  );

  await page.getByTestId("regex-pattern-input").fill("[unterminated");
  await page.waitForTimeout(200);
  check("regex_invalid_pattern_2_status", (await page.getByTestId("regex-status").getAttribute("data-status")) === "invalid");

  await page.getByTestId("regex-pattern-input").fill("*starts-with-quantifier");
  await page.waitForTimeout(200);
  check("regex_invalid_pattern_3_status", (await page.getByTestId("regex-status").getAttribute("data-status")) === "invalid");
  check("no_console_errors_after_invalid_regex", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // Fixing the pattern immediately returns to a normal state.
  await page.getByTestId("regex-pattern-input").fill(String.raw`\w+`);
  await page.waitForTimeout(200);
  check("regex_recovers_after_fixing_pattern", (await page.getByTestId("regex-status").getAttribute("data-status")) === "valid");

  // ---- Highlight contrast regression guard ----
  // A real visual bug was reported after manual production testing: the
  // base match highlight (no capture groups involved, e.g. `\d+` or
  // "hello") was nearly invisible against the very dark canvas background.
  // The rest of this suite only ever checks match count/text/indices, never
  // whether the highlight actually reads as visually distinct, so this adds
  // that check directly: read the rendered <mark>'s own background alpha
  // and assert it's comfortably above the old (broken) 0.15 value, for
  // every case that was flagged as hard to see.
  await page.getByTestId("regex-tab-highlight").click();
  await page.waitForTimeout(150);

  async function firstMarkAlpha() {
    const bg = await page
      .locator('[data-testid="regex-highlight"] mark')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const m = bg.match(/([\d.]+)\)\s*$/);
    return { alpha: m ? parseFloat(m[1]) : 0, raw: bg };
  }

  await page.getByTestId("regex-pattern-input").fill(String.raw`\d+`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("I have 12 apples and 345 oranges.");
  await page.waitForTimeout(200);
  let { alpha: alphaDigits, raw: rawDigits } = await firstMarkAlpha();
  check("regex_highlight_contrast_digits", alphaDigits >= 0.35, `${rawDigits} (alpha ${alphaDigits})`);

  await page.getByTestId("regex-pattern-input").fill("hello");
  await page.getByTestId("regex-text-input").locator("textarea").fill("Hello HELLO hello HeLLo");
  await page.getByTestId("regex-flag-i").click();
  await page.waitForTimeout(200);
  let { alpha: alphaCI, raw: rawCI } = await firstMarkAlpha();
  check("regex_highlight_contrast_case_insensitive", alphaCI >= 0.35, `${rawCI} (alpha ${alphaCI})`);
  await page.getByTestId("regex-flag-i").click();
  await page.waitForTimeout(150);

  await page.getByTestId("regex-pattern-input").fill("^ERROR");
  await page.getByTestId("regex-text-input").locator("textarea").fill("INFO Server started\nERROR Database failed");
  await page.getByTestId("regex-flag-m").click();
  await page.waitForTimeout(200);
  let { alpha: alphaML, raw: rawML } = await firstMarkAlpha();
  check("regex_highlight_contrast_multiline", alphaML >= 0.35, `${rawML} (alpha ${alphaML})`);
  await page.getByTestId("regex-flag-m").click();
  await page.waitForTimeout(150);

  await page.getByTestId("regex-pattern-input").fill(String.raw`hello.*world`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("hello\nbeautiful\nworld");
  await page.getByTestId("regex-flag-s").click();
  await page.waitForTimeout(200);
  let { alpha: alphaDA, raw: rawDA } = await firstMarkAlpha();
  check("regex_highlight_contrast_dot_all", alphaDA >= 0.35, `${rawDA} (alpha ${alphaDA})`);
  await page.getByTestId("regex-flag-s").click();
  await page.waitForTimeout(150);

  await page.getByTestId("regex-pattern-input").fill(String.raw`\.`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("example.com");
  await page.waitForTimeout(200);
  let { alpha: alphaDot, raw: rawDot } = await firstMarkAlpha();
  check("regex_highlight_contrast_escaped_dot", alphaDot >= 0.35, `${rawDot} (alpha ${alphaDot})`);
  await page.screenshot({ path: `${SHOT_DIR}/15-regex-highlight-contrast.png` });

  // ---- Replacement: numbered groups ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`(\w+)@(\w+)\.com`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("alice@example.com");
  await page.getByTestId("regex-tab-replace").click();
  await page.waitForTimeout(150);
  await page.getByTestId("regex-replacement-input").fill("$1 at $2");
  await page.waitForTimeout(200);
  let replaceOutput = await page.getByTestId("regex-replace-output").innerText();
  check("regex_replace_numbered_groups", replaceOutput.trim() === "alice at example", replaceOutput);

  // ---- Replacement: named groups ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`(?<user>\w+)@(?<domain>\w+)\.com`);
  await page.waitForTimeout(200);
  replaceOutput = await page.getByTestId("regex-replace-output").innerText();
  check("regex_replace_named_groups", replaceOutput.trim() === "alice at example", replaceOutput);

  // ---- Replacement: no match is a clean no-op ----
  await page.getByTestId("regex-pattern-input").fill("zzz_never_matches_zzz");
  await page.waitForTimeout(200);
  const replaceStatusText = await page.getByTestId("regex-replace-status").innerText();
  check("regex_replace_no_match_is_noop", /unchanged/i.test(replaceStatusText), replaceStatusText);

  // ---- Copy / download ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`\d+`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("42 and 7");
  await page.getByTestId("regex-tab-list").click();
  await page.waitForTimeout(200);
  await page.getByTestId("btn-copy-matches").click();
  await page.waitForTimeout(150);
  const regexClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check(
    "regex_copy_matches_sets_clipboard",
    typeof regexClipboard === "string" && regexClipboard.includes('"text": "42"'),
    String(regexClipboard).slice(0, 200)
  );

  const regexDownloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-download-matches").click();
  const regexDl = await regexDownloadPromise.catch(() => null);
  check("regex_download_matches_triggers_download", !!regexDl, regexDl ? regexDl.suggestedFilename() : "no download event");

  // ---- Clear ----
  await page.getByTestId("btn-regex-clear").click();
  await page.waitForTimeout(150);
  check("regex_status_empty_after_clear", (await page.getByTestId("regex-status").getAttribute("data-status")) === "empty");
  check("regex_text_cleared_after_clear", (await page.getByTestId("regex-text-input").locator("textarea").inputValue()) === "");

  // ---- Mobile viewport ----
  await page.getByTestId("btn-regex-sample").click();
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const regexMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check("regex_mobile_no_horizontal_overflow", !regexMobileOverflow, "scrollWidth vs clientWidth");
  check("regex_toolbar_visible_mobile", await page.getByTestId("btn-regex-sample").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/14-regex-mobile.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // ---- State preservation across a full 3-tool cycle: Regex -> JWT -> JSON -> Regex ----
  await page.getByTestId("regex-pattern-input").fill(String.raw`cycle_marker_\d+`);
  await page.getByTestId("regex-text-input").locator("textarea").fill("cycle_marker_999");
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-jwt").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-json").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-regex").click();
  await page.waitForTimeout(150);
  const cyclePattern = await page.getByTestId("regex-pattern-input").inputValue();
  check("regex_state_preserved_across_full_tool_cycle", cyclePattern === String.raw`cycle_marker_\d+`, cyclePattern);
  check("regex_status_still_valid_after_cycle", (await page.getByTestId("regex-status").getAttribute("data-status")) === "valid");
  check("no_console_errors_after_regex_suite", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // ==== Timestamp Converter ====
  // A fixed instant used wherever a deterministic "now" is needed, chosen
  // once here in Node — completely unaffected by the frozen-clock patch
  // installed on the page further down — so every expected value in this
  // section is computed the same trustworthy way, with the real, un-frozen
  // Date/Intl running host-side, independent of the app's own code.
  const FROZEN_NOW_MS = Date.parse("2026-06-15T12:00:00.000Z");

  await page.getByTestId("tool-tab-timestamp").click();
  await page.waitForTimeout(200);
  check(
    "tool_switcher_shows_timestamp_active",
    (await page.getByTestId("tool-tab-timestamp").getAttribute("aria-current")) === "page"
  );
  check("timestamp_status_empty_initially", (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "empty");

  // Palette scoping flips to Timestamp Converter's own commands.
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  paletteText = await page.getByTestId("command-palette").innerText();
  check("timestamp_palette_has_own_commands", /Load current time \(Now\)/i.test(paletteText), paletteText.slice(0, 200));
  check("timestamp_palette_has_no_regex_commands", !/Load sample pattern/i.test(paletteText), paletteText.slice(0, 200));
  check("timestamp_palette_offers_switch_back", /Switch to Regex Tester/i.test(paletteText), paletteText.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // ---- Epoch input: a fixed, non-"now" instant, computed with the real Date ----
  const FIXED_ISO = "2025-03-10T13:45:30.000Z";
  const FIXED_EPOCH_SECONDS = Math.floor(Date.parse(FIXED_ISO) / 1000);
  await page.getByTestId("timestamp-epoch-input").fill(String(FIXED_EPOCH_SECONDS));
  await page.waitForTimeout(200);
  check("timestamp_status_valid_for_fixed_epoch", (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "valid");
  check(
    "timestamp_status_epoch_seconds_attr_correct",
    (await page.getByTestId("timestamp-status").getAttribute("data-epoch-seconds")) === String(FIXED_EPOCH_SECONDS)
  );
  check("timestamp_epoch_to_iso_correct", (await page.getByTestId("timestamp-epoch-iso-value").innerText()) === FIXED_ISO);
  check("timestamp_epoch_seconds_echoed", (await page.getByTestId("timestamp-epoch-seconds-value").innerText()) === String(FIXED_EPOCH_SECONDS));
  check(
    "timestamp_epoch_ms_correct",
    (await page.getByTestId("timestamp-epoch-milliseconds-value").innerText()) === String(FIXED_EPOCH_SECONDS * 1000)
  );
  check("timestamp_unit_auto_detected_seconds", /seconds/i.test(await page.getByTestId("timestamp-detected-unit").innerText()));
  await page.screenshot({ path: `${SHOT_DIR}/16-timestamp-desktop.png` });

  // ---- Epoch unit: explicit override beats auto-detection ----
  // 50000 as seconds is 1970-01-01T13:53:20.000Z; as milliseconds it's
  // 1970-01-01T00:00:50.000Z — different enough to prove the toggle, not
  // just the auto heuristic, is what's driving the result.
  await page.getByTestId("timestamp-epoch-input").fill("50000");
  await page.getByTestId("timestamp-unit-milliseconds").click();
  await page.waitForTimeout(200);
  check(
    "timestamp_unit_override_milliseconds",
    (await page.getByTestId("timestamp-epoch-iso-value").innerText()) === new Date(50000).toISOString()
  );

  await page.getByTestId("timestamp-unit-seconds").click();
  await page.waitForTimeout(200);
  check(
    "timestamp_unit_override_seconds",
    (await page.getByTestId("timestamp-epoch-iso-value").innerText()) === new Date(50000 * 1000).toISOString()
  );

  await page.getByTestId("timestamp-unit-auto").click();
  await page.waitForTimeout(150);

  // ---- Invalid epoch input: specific messages, never a crash ----
  await page.getByTestId("timestamp-epoch-input").fill("not-a-number");
  await page.waitForTimeout(200);
  let tsStatusText = await page.getByTestId("timestamp-status").innerText();
  check(
    "timestamp_non_numeric_epoch_reported",
    (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "invalid" && /whole number/i.test(tsStatusText),
    tsStatusText
  );

  await page.getByTestId("timestamp-epoch-input").fill("12.5");
  await page.waitForTimeout(200);
  tsStatusText = await page.getByTestId("timestamp-status").innerText();
  check(
    "timestamp_decimal_epoch_reported",
    (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "invalid" && /whole number/i.test(tsStatusText),
    tsStatusText
  );

  await page.getByTestId("timestamp-epoch-input").fill("99999999999999999");
  await page.waitForTimeout(200);
  tsStatusText = await page.getByTestId("timestamp-status").innerText();
  check(
    "timestamp_out_of_range_epoch_reported",
    (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "invalid" && /range/i.test(tsStatusText),
    tsStatusText
  );
  check("no_console_errors_after_invalid_timestamp_input", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // ---- INTERPRET vs DISPLAY: a human date/time read in an explicit zone ----
  // America/New_York's EST/EDT offsets (UTC-5 / UTC-4) are well-established
  // facts independent of this app's own code, so hand arithmetic against
  // them is a trustworthy check of the interpret step — not a test of the
  // implementation against a copy of itself.
  await page.getByTestId("timestamp-mode-date").click();
  await page.waitForTimeout(150);
  check("timestamp_status_empty_in_date_mode_before_input", (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "empty");

  await page.getByTestId("timestamp-datetime-input").fill("2026-01-15T10:00");
  await page.getByTestId("timestamp-interpret-zone").selectOption("America/New_York");
  await page.waitForTimeout(200);
  check(
    "timestamp_interprets_winter_date_as_est",
    (await page.getByTestId("timestamp-epoch-iso-value").innerText()) === "2026-01-15T15:00:00.000Z"
  );

  await page.getByTestId("timestamp-datetime-input").fill("2026-07-15T10:00");
  await page.waitForTimeout(200);
  check(
    "timestamp_interprets_summer_date_as_edt",
    (await page.getByTestId("timestamp-epoch-iso-value").innerText()) === "2026-07-15T14:00:00.000Z"
  );
  await page.screenshot({ path: `${SHOT_DIR}/17-timestamp-date-mode.png` });

  // Switching modes doesn't drop what was typed in the other field — the
  // same "never discard input" property every other tab/tool switch in this
  // hub already has.
  await page.getByTestId("timestamp-mode-epoch").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_epoch_field_preserved_across_mode_switch",
    (await page.getByTestId("timestamp-epoch-input").inputValue()) === "99999999999999999"
  );
  await page.getByTestId("timestamp-mode-date").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_date_field_preserved_across_mode_switch",
    (await page.getByTestId("timestamp-datetime-input").inputValue()) === "2026-07-15T10:00"
  );

  // ---- Freeze the clock, then exercise Now / presets / relative time ----
  // page.addInitScript only takes effect on future navigations, so the page
  // is reloaded once, deliberately, right after installing it. That
  // reload's own document request is expected, not a regression — it's
  // excluded from requestsAfterLoad below rather than left to trip the
  // zero-network-after-load check at the end of this suite.
  await page.addInitScript((fixedMs) => {
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(fixedMs);
        else super(...args);
      }
      static now() {
        return fixedMs;
      }
    }
    window.Date = FrozenDate;
  }, FROZEN_NOW_MS);
  const requestsBeforeClockReload = requestsAfterLoad.length;
  await page.reload({ waitUntil: "networkidle" });
  requestsAfterLoad.length = requestsBeforeClockReload;
  await page.waitForTimeout(150);
  check("timestamp_clock_freeze_took_effect", (await page.evaluate(() => Date.now())) === FROZEN_NOW_MS);

  await page.getByTestId("tool-tab-timestamp").click();
  await page.waitForTimeout(150);

  await page.getByTestId("btn-timestamp-now").click();
  await page.waitForTimeout(200);
  check(
    "timestamp_now_button_uses_frozen_clock",
    (await page.getByTestId("timestamp-status").getAttribute("data-epoch-seconds")) === String(Math.floor(FROZEN_NOW_MS / 1000))
  );
  check("timestamp_mode_switches_to_epoch_after_now", (await page.getByTestId("timestamp-mode-epoch").getAttribute("aria-pressed")) === "true");
  const defaultZoneRowCount = await page.getByTestId("timestamp-zone-rows").locator("li").count();
  check("timestamp_default_pinned_zones_count", defaultZoneRowCount === 2, String(defaultZoneRowCount));

  // ---- Presets, each expected value computed independently in Node with
  // the same frozen instant, using ordinary calendar arithmetic rather than
  // any code shared with lib/timestamp.ts ----
  const frozenLocal = new Date(FROZEN_NOW_MS);
  const startOfDay = new Date(frozenLocal.getFullYear(), frozenLocal.getMonth(), frozenLocal.getDate(), 0, 0, 0, 0);
  const isoDay = (startOfDay.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfDay.getTime());
  startOfWeek.setDate(startOfWeek.getDate() - isoDay);
  const startOfMonth = new Date(frozenLocal.getFullYear(), frozenLocal.getMonth(), 1, 0, 0, 0, 0);
  const startOfYear = new Date(frozenLocal.getFullYear(), 0, 1, 0, 0, 0, 0);

  const presetChecks = [
    ["timestamp-preset-start-of-day", startOfDay],
    ["timestamp-preset-start-of-week", startOfWeek],
    ["timestamp-preset-start-of-month", startOfMonth],
    ["timestamp-preset-start-of-year", startOfYear],
  ];
  for (const [presetTestId, expectedDate] of presetChecks) {
    await page.getByTestId(presetTestId).click();
    await page.waitForTimeout(200);
    const gotSeconds = await page.getByTestId("timestamp-epoch-seconds-value").innerText();
    const expectedSeconds = String(Math.floor(expectedDate.getTime() / 1000));
    check(`${presetTestId.replace(/-/g, "_")}_matches_expected`, gotSeconds === expectedSeconds, `${gotSeconds} vs ${expectedSeconds}`);
  }

  await page.getByTestId("timestamp-preset-epoch-zero").click();
  await page.waitForTimeout(200);
  check("timestamp_preset_epoch_zero", (await page.getByTestId("timestamp-epoch-seconds-value").innerText()) === "0");

  // ---- Relative time reflects the frozen clock, not the real one ----
  let utcRelative = await page.getByTestId("timestamp-zone-row-UTC").innerText();
  check("timestamp_relative_time_for_epoch_zero_is_years_ago", /year/i.test(utcRelative) && /ago/i.test(utcRelative), utcRelative);

  await page.getByTestId("timestamp-epoch-input").fill(String(Math.floor(FROZEN_NOW_MS / 1000) - 3600));
  await page.waitForTimeout(200);
  utcRelative = await page.getByTestId("timestamp-zone-row-UTC").innerText();
  check("timestamp_relative_time_one_hour_ago", /hour/i.test(utcRelative) && /ago/i.test(utcRelative), utcRelative);

  // ---- Timezone picker: search, add, remove, and the last-zone guard ----
  await page.getByTestId("timestamp-zone-search").fill("Tokyo");
  await page.waitForTimeout(150);
  check("timestamp_zone_search_finds_tokyo", await page.getByTestId("timestamp-zone-option-Asia/Tokyo").isVisible().catch(() => false));
  await page.getByTestId("timestamp-zone-option-Asia/Tokyo").click();
  await page.waitForTimeout(150);
  check("timestamp_zone_added_row_appears", await page.getByTestId("timestamp-zone-row-Asia/Tokyo").isVisible().catch(() => false));
  check("timestamp_zone_search_clears_after_add", (await page.getByTestId("timestamp-zone-search").inputValue()) === "");

  await page.getByTestId("btn-remove-zone-Asia/Tokyo").click();
  await page.waitForTimeout(150);
  check("timestamp_zone_removed_row_gone", !(await page.getByTestId("timestamp-zone-row-Asia/Tokyo").isVisible().catch(() => false)));
  const zoneRowsAfterRoundtrip = await page.getByTestId("timestamp-zone-rows").locator("li").count();
  check("timestamp_zone_count_restored_after_add_remove", zoneRowsAfterRoundtrip === 2, String(zoneRowsAfterRoundtrip));

  // Remove down to one and confirm its own Remove button disappears — the
  // hub never lets the result panel go fully empty this way.
  const firstRemoveBtn = page.getByTestId("timestamp-zone-rows").locator('button[data-testid^="btn-remove-zone-"]').first();
  await firstRemoveBtn.click();
  await page.waitForTimeout(150);
  const remainingRows = page.getByTestId("timestamp-zone-rows").locator("li");
  check("timestamp_one_zone_remains", (await remainingRows.count()) === 1);
  check("timestamp_last_zone_has_no_remove_button", (await remainingRows.locator('button[data-testid^="btn-remove-zone-"]').count()) === 0);

  // Re-add a second zone so copy/download/clear below work with an
  // ordinary two-row list, same as the rest of this section.
  await page.getByTestId("timestamp-zone-search").fill("Tokyo");
  await page.waitForTimeout(150);
  await page.getByTestId("timestamp-zone-option-Asia/Tokyo").click();
  await page.waitForTimeout(150);

  // ---- Copy / download ----
  await page.getByTestId("btn-timestamp-epoch-seconds-copy").click();
  await page.waitForTimeout(150);
  let tsClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check(
    "timestamp_copy_epoch_seconds_sets_clipboard",
    tsClipboard === (await page.getByTestId("timestamp-epoch-seconds-value").innerText()),
    String(tsClipboard)
  );

  await page.getByTestId("btn-timestamp-epoch-iso-copy").click();
  await page.waitForTimeout(150);
  tsClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check(
    "timestamp_copy_iso_sets_clipboard",
    tsClipboard === (await page.getByTestId("timestamp-epoch-iso-value").innerText()),
    String(tsClipboard)
  );

  await page.getByTestId("btn-copy-timestamp-result").click();
  await page.waitForTimeout(150);
  tsClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  let parsedTsClipboard = null;
  try {
    parsedTsClipboard = JSON.parse(tsClipboard);
  } catch {
    // left null; the check below fails on that
  }
  check(
    "timestamp_copy_all_sets_valid_json_clipboard",
    !!parsedTsClipboard && typeof parsedTsClipboard.epoch === "object" && Array.isArray(parsedTsClipboard.timezones),
    String(tsClipboard).slice(0, 200)
  );

  const tsDownloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-download-timestamp-result").click();
  const tsDl = await tsDownloadPromise.catch(() => null);
  check(
    "timestamp_download_triggers_download",
    !!tsDl && tsDl.suggestedFilename() === "timestamp-conversion.json",
    tsDl ? tsDl.suggestedFilename() : "no download event"
  );

  // ---- Preset highlight: clicking a preset marks it selected, and that
  // selection is invalidated the moment anything could change what value
  // it stands for (a hand-edit, or an epoch-unit change that reinterprets
  // the same digits) ----
  await page.getByTestId("timestamp-preset-start-of-day").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_shows_pressed_after_click",
    (await page.getByTestId("timestamp-preset-start-of-day").getAttribute("aria-pressed")) === "true"
  );
  check(
    "timestamp_other_preset_not_pressed",
    (await page.getByTestId("timestamp-preset-epoch-zero").getAttribute("aria-pressed")) === "false"
  );

  await page.getByTestId("timestamp-epoch-input").fill("42");
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_highlight_clears_on_manual_edit",
    (await page.getByTestId("timestamp-preset-start-of-day").getAttribute("aria-pressed")) === "false"
  );

  // Same check, via the "From date & time" field instead of the epoch field
  // — a manual edit there is just as much a hand-edit as one in the epoch
  // field, so it must clear a stale preset highlight the same way. (Found by
  // manual interactive testing during the final validation pass: the epoch
  // field's onChange cleared the preset, but the date/time field's did not.)
  await page.getByTestId("timestamp-preset-start-of-month").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_shows_pressed_before_date_field_edit",
    (await page.getByTestId("timestamp-preset-start-of-month").getAttribute("aria-pressed")) === "true"
  );
  await page.getByTestId("timestamp-mode-date").click();
  await page.getByTestId("timestamp-datetime-input").fill("2026-03-01T09:30");
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_highlight_clears_on_date_field_manual_edit",
    (await page.getByTestId("timestamp-preset-start-of-month").getAttribute("aria-pressed")) === "false"
  );

  await page.getByTestId("timestamp-preset-epoch-zero").click();
  await page.getByTestId("timestamp-unit-milliseconds").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_highlight_clears_on_unit_change",
    (await page.getByTestId("timestamp-preset-epoch-zero").getAttribute("aria-pressed")) === "false"
  );
  await page.getByTestId("timestamp-unit-auto").click();

  await page.getByTestId("timestamp-preset-start-of-week").click();
  await page.waitForTimeout(150);
  await page.getByTestId("btn-timestamp-clear").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_preset_highlight_clears_on_clear_button",
    (await page.getByTestId("timestamp-preset-start-of-week").getAttribute("aria-pressed")) === "false"
  );

  await page.getByTestId("btn-timestamp-now").click();
  await page.waitForTimeout(150);
  check(
    "timestamp_toolbar_now_highlights_now_preset",
    (await page.getByTestId("timestamp-preset-now").getAttribute("aria-pressed")) === "true"
  );

  // ---- Clear: only raw inputs reset, mode/unit/zone selections persist ----
  await page.getByTestId("timestamp-mode-epoch").click();
  await page.getByTestId("timestamp-epoch-input").fill("123456");
  await page.getByTestId("timestamp-unit-milliseconds").click();
  await page.waitForTimeout(150);
  await page.getByTestId("btn-timestamp-clear").click();
  await page.waitForTimeout(150);
  check("timestamp_status_empty_after_clear", (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "empty");
  check("timestamp_epoch_input_cleared", (await page.getByTestId("timestamp-epoch-input").inputValue()) === "");
  check(
    "timestamp_unit_selection_preserved_after_clear",
    (await page.getByTestId("timestamp-unit-milliseconds").getAttribute("aria-pressed")) === "true"
  );
  // Clearing empties the input, so the result panel (and the zone list with
  // it) is legitimately blank right now — that's the empty state working as
  // designed, not the thing being tested here. Re-establish a valid instant
  // and confirm the same pinned zones come back with no re-adding needed.
  await page.getByTestId("btn-timestamp-now").click();
  await page.waitForTimeout(200);
  const zoneRowsAfterClear = await page.getByTestId("timestamp-zone-rows").locator("li").count();
  check("timestamp_pinned_zones_preserved_after_clear", zoneRowsAfterClear === 2, String(zoneRowsAfterClear));

  // ---- Mobile viewport ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const timestampMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check("timestamp_mobile_no_horizontal_overflow", !timestampMobileOverflow, "scrollWidth vs clientWidth");
  check("timestamp_toolbar_visible_mobile", await page.getByTestId("btn-timestamp-now").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/18-timestamp-mobile.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // ---- State preservation across a full 4-tool cycle: Timestamp -> JWT -> JSON -> Regex -> Timestamp ----
  await page.getByTestId("timestamp-epoch-input").fill("777");
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-jwt").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-json").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-regex").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-timestamp").click();
  await page.waitForTimeout(150);
  const cycleEpochValue = await page.getByTestId("timestamp-epoch-input").inputValue();
  check("timestamp_state_preserved_across_full_tool_cycle", cycleEpochValue === "777", cycleEpochValue);
  check("timestamp_status_still_valid_after_cycle", (await page.getByTestId("timestamp-status").getAttribute("data-status")) === "valid");
  check("no_console_errors_after_timestamp_suite", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // ==================== Generators & Converters (Phase 5) ====================
  // Four independent utilities (Base64, URL Encode/Decode, UUID, Hash)
  // bundled under one top-level tab with their own sub-mode switcher, one
  // level below the hub's own tool switcher. lib/base64.ts, lib/urlEncode.ts,
  // lib/hash.ts, and lib/uuid.ts were already verified in isolation against
  // independent test vectors (RFC 1321 for MD5, NIST/RFC vectors and Node's
  // own native crypto for SHA-1/256/384/512, cross-checked at every
  // block-boundary length) before any UI was built — see scripts/verify_lib.ts.
  // The checks below exercise the UI wiring on top of that already-verified
  // logic: does clicking the right thing show the right result, not "is MD5
  // implemented correctly" a second time.
  await page.getByTestId("tool-tab-generators").click();
  await page.waitForTimeout(200);
  check("tool_switcher_shows_generators_active", (await page.getByTestId("tool-tab-generators").getAttribute("aria-current")) === "page");
  check("generators_default_submode_is_base64", (await page.getByTestId("generators-submode-base64").getAttribute("aria-pressed")) === "true");
  check("generators_base64_status_empty_initially", (await page.getByTestId("base64-status").getAttribute("data-status")) === "empty");

  // ---- Command palette scoping: active sub-mode's commands only, plus the
  // always-present sub-mode switch commands and the top-level switch-back ----
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  paletteText = await page.getByTestId("command-palette").innerText();
  check("generators_palette_has_base64_commands", /Toggle URL-safe output/i.test(paletteText), paletteText.slice(0, 200));
  check("generators_palette_has_no_url_commands", !/Switch to: Component mode/i.test(paletteText), paletteText.slice(0, 200));
  check("generators_palette_has_no_uuid_commands", !/Toggle uppercase/i.test(paletteText), paletteText.slice(0, 200));
  check("generators_palette_has_no_hash_commands", !/Switch to: MD5/i.test(paletteText), paletteText.slice(0, 200));
  check("generators_palette_offers_submode_switch", /Switch to: Hash/i.test(paletteText), paletteText.slice(0, 200));
  check("generators_palette_offers_switch_back", /Switch to Regex Tester/i.test(paletteText), paletteText.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // ---- Base64 ----
  await page.getByTestId("btn-base64-sample").click();
  await page.waitForTimeout(150);
  check("base64_sample_encodes", (await page.getByTestId("base64-status").getAttribute("data-status")) === "valid");

  await page.getByTestId("base64-input").fill("hello");
  await page.waitForTimeout(150);
  check("base64_encode_known_value", (await page.getByTestId("base64-output").inputValue()) === "aGVsbG8=");

  await page.getByTestId("base64-url-safe-toggle").click();
  await page.waitForTimeout(150);
  const base64UrlSafeOutput = await page.getByTestId("base64-output").inputValue();
  check("base64_url_safe_output_has_no_reserved_chars", !/[+/=]/.test(base64UrlSafeOutput), base64UrlSafeOutput);
  check("base64_url_safe_known_value", base64UrlSafeOutput === "aGVsbG8");

  // Non-ASCII round trip through the real UI: encode, read the output,
  // switch direction, paste the encoded text back in, confirm it recovers
  // the exact original.
  const unicodeSample = "café 🎉 日本語";
  await page.getByTestId("base64-url-safe-toggle").click(); // back to standard alphabet
  await page.getByTestId("base64-input").fill(unicodeSample);
  await page.waitForTimeout(150);
  const unicodeEncoded = await page.getByTestId("base64-output").inputValue();
  await page.getByTestId("base64-direction-decode").click();
  await page.getByTestId("base64-input").fill(unicodeEncoded);
  await page.waitForTimeout(150);
  check("base64_unicode_roundtrip_via_ui", (await page.getByTestId("base64-output").inputValue()) === unicodeSample);

  await page.getByTestId("base64-input").fill("not valid base64 !!!");
  await page.waitForTimeout(150);
  check("base64_invalid_shows_error", (await page.getByTestId("base64-status").getAttribute("data-status")) === "invalid");

  await page.getByTestId("btn-base64-clear").click();
  await page.waitForTimeout(150);
  check("base64_clear_empties_input", (await page.getByTestId("base64-input").inputValue()) === "");

  // ---- URL Encode/Decode ----
  await page.getByTestId("generators-submode-url").click();
  await page.waitForTimeout(150);
  check("generators_switches_to_url_submode", (await page.getByTestId("generators-submode-url").getAttribute("aria-pressed")) === "true");

  const urlFixture = "a/b c&d";
  await page.getByTestId("url-input").fill(urlFixture);
  await page.waitForTimeout(150);
  const urlComponentOut = await page.getByTestId("url-output").inputValue();
  check("url_component_mode_encodes_slash_and_ampersand", urlComponentOut === "a%2Fb%20c%26d", urlComponentOut);

  await page.getByTestId("url-mode-full").click();
  await page.waitForTimeout(150);
  const urlFullOut = await page.getByTestId("url-output").inputValue();
  check("url_full_mode_preserves_slash_and_ampersand", urlFullOut === "a/b%20c&d", urlFullOut);
  check("url_component_and_full_modes_differ", urlComponentOut !== urlFullOut);

  await page.getByTestId("url-direction-decode").click();
  await page.getByTestId("url-input").fill(urlFullOut);
  await page.waitForTimeout(150);
  check("url_full_mode_roundtrip", (await page.getByTestId("url-output").inputValue()) === urlFixture);

  await page.getByTestId("url-input").fill("100% not valid %zz");
  await page.waitForTimeout(150);
  check("url_malformed_shows_error", (await page.getByTestId("url-status").getAttribute("data-status")) === "invalid");

  await page.getByTestId("btn-url-clear").click();
  await page.waitForTimeout(150);
  check("url_clear_empties_input", (await page.getByTestId("url-input").inputValue()) === "");

  // ---- UUID ----
  await page.getByTestId("generators-submode-uuid").click();
  await page.waitForTimeout(150);
  check("generators_switches_to_uuid_submode", (await page.getByTestId("generators-submode-uuid").getAttribute("aria-pressed")) === "true");

  await page.getByTestId("uuid-count-5").click();
  await page.getByTestId("btn-uuid-generate").click();
  await page.waitForTimeout(200);
  const uuidRowsBefore = await page.getByTestId("uuid-results").locator("li").allInnerTexts();
  check("uuid_generate_produces_5", uuidRowsBefore.length === 5, String(uuidRowsBefore.length));
  const uuidShapeLower = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  check("uuid_all_rows_valid_v4_shape", uuidRowsBefore.every((t) => uuidShapeLower.test(t.trim())), JSON.stringify(uuidRowsBefore));
  check("uuid_batch_all_unique", new Set(uuidRowsBefore.map((t) => t.trim())).size === 5);

  // Toggling format re-styles the existing batch rather than generating a
  // fresh one — proven by confirming the lowercased-back-down set is
  // exactly the same set as before the toggle, not five new random values.
  await page.getByTestId("uuid-format-uppercase").click();
  await page.waitForTimeout(150);
  const uuidRowsUpper = await page.getByTestId("uuid-results").locator("li").allInnerTexts();
  const sameSetAfterUppercase =
    JSON.stringify(uuidRowsUpper.map((t) => t.trim().toLowerCase()).sort()) === JSON.stringify(uuidRowsBefore.map((t) => t.trim().toLowerCase()).sort());
  check("uuid_uppercase_restyles_not_regenerates", sameSetAfterUppercase);
  check("uuid_uppercase_output_is_uppercase", uuidRowsUpper.every((t) => t.trim() === t.trim().toUpperCase()), JSON.stringify(uuidRowsUpper));

  await page.getByTestId("uuid-format-hyphens").click();
  await page.waitForTimeout(150);
  const uuidRowsNoHyphens = await page.getByTestId("uuid-results").locator("li").allInnerTexts();
  check("uuid_no_hyphens_format", uuidRowsNoHyphens.every((t) => !t.includes("-")), JSON.stringify(uuidRowsNoHyphens));
  await page.getByTestId("uuid-format-hyphens").click();
  await page.getByTestId("uuid-format-uppercase").click();
  await page.waitForTimeout(150);

  await page.getByTestId("btn-uuid-clear").click();
  await page.waitForTimeout(150);
  check("uuid_clear_empties_results", (await page.getByTestId("uuid-result-count").innerText()).includes("No UUIDs"));

  // ---- Hash ----
  await page.getByTestId("generators-submode-hash").click();
  await page.waitForTimeout(150);
  check("generators_switches_to_hash_submode", (await page.getByTestId("generators-submode-hash").getAttribute("aria-pressed")) === "true");

  await page.getByTestId("btn-hash-sample").click();
  await page.waitForTimeout(400); // crypto.subtle.digest is async
  check("hash_default_algorithm_is_sha256", (await page.getByTestId("hash-algorithm-SHA-256").getAttribute("aria-pressed")) === "true");
  const hashSha256 = await page.getByTestId("hash-output").innerText();
  check("hash_sha256_matches_known_vector", hashSha256.trim() === "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592", hashSha256);

  await page.getByTestId("hash-algorithm-MD5").click();
  await page.waitForTimeout(400);
  const hashMd5 = await page.getByTestId("hash-output").innerText();
  check("hash_md5_matches_known_vector", hashMd5.trim() === "9e107d9d372bb6826bd81d3542a419d6", hashMd5);
  check("hash_changing_algorithm_changes_digest", hashMd5.trim() !== hashSha256.trim());
  check("hash_md5_labeled_legacy", /legacy/i.test(await page.getByTestId("hash-algorithm-MD5").innerText()));
  check("hash_sha1_labeled_not_for_security", /not for security/i.test(await page.getByTestId("hash-algorithm-SHA-1").innerText()));

  await page.getByTestId("btn-hash-clear").click();
  await page.waitForTimeout(150);
  check("hash_clear_empties_input", (await page.getByTestId("hash-input").inputValue()) === "");
  check("hash_status_empty_after_clear", (await page.getByTestId("hash-status").getAttribute("data-status")) === "empty");

  // ---- Mobile viewport ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const generatorsMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check("generators_mobile_no_horizontal_overflow", !generatorsMobileOverflow, "scrollWidth vs clientWidth");
  check("generators_submode_toggle_visible_mobile", await page.getByTestId("generators-submode-hash").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/20-generators-mobile.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // ---- State preservation, at both the top-level tool AND the sub-mode
  // level: Generators(Base64) -> JSON -> JWT -> Regex -> Timestamp -> Generators ----
  await page.getByTestId("generators-submode-base64").click();
  await page.getByTestId("base64-input").fill("preserve-me");
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-json").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-jwt").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-regex").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-timestamp").click();
  await page.waitForTimeout(150);
  await page.getByTestId("tool-tab-generators").click();
  await page.waitForTimeout(150);
  check("generators_submode_preserved_across_tool_cycle", (await page.getByTestId("generators-submode-base64").getAttribute("aria-pressed")) === "true");
  check("generators_base64_input_preserved_across_tool_cycle", (await page.getByTestId("base64-input").inputValue()) === "preserve-me");

  check("no_console_errors_after_generators_suite", consoleErrors.length === 0, JSON.stringify(consoleErrors));

  // Leave the hub back on JSON Workbench — the remaining checks below are
  // all JSON-tool checks carried over unchanged from before this hub existed.
  await page.getByTestId("tool-tab-json").click();
  await page.waitForTimeout(200);
  await page.getByTestId("btn-load-sample").click();
  await page.waitForTimeout(200);
  await page.getByTestId("tab-ts").click();
  await page.waitForTimeout(150);

  // ---- Command palette ----
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  check("command_palette_opens", await page.getByTestId("command-palette").isVisible());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  check("command_palette_closes_on_escape", !(await page.getByTestId("command-palette").isVisible().catch(() => false)));

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(150);
  check("command_palette_opens_via_shortcut", await page.getByTestId("command-palette").isVisible());
  await page.keyboard.type("typescript");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  check("palette_command_switches_tab", await page.getByTestId("ts-output").isVisible());

  // ---- Copy button + clipboard ----
  await page.getByTestId("btn-load-sample").click();
  await page.waitForTimeout(150);
  await page.getByTestId("btn-copy").click();
  await page.waitForTimeout(150);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check("copy_button_sets_clipboard", typeof clipboard === "string" && clipboard.includes('"customer"'), String(clipboard).slice(0, 100));

  // ---- Download button ----
  const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-download").click();
  const dl = await downloadPromise.catch((e) => null);
  check("download_button_triggers_download", !!dl, dl ? dl.suggestedFilename() : "no download event");

  // ---- Mobile viewport ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.getByTestId("tab-tree").click();
  await page.waitForTimeout(150);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  check("mobile_no_horizontal_overflow", !bodyOverflow, `scrollWidth vs clientWidth`);
  check("toolbar_visible_mobile", await page.getByTestId("btn-format").isVisible());
  await page.screenshot({ path: `${SHOT_DIR}/09-mobile-tree.png`, fullPage: false });

  await page.getByTestId("tab-diff").click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOT_DIR}/10-mobile-diff.png`, fullPage: false });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // ---- Debug Report suite (WP2) ----
  const dbgConsole = [];
  const dbgConsoleHandler = (msg) => dbgConsole.push(`${msg.type()}: ${msg.text()}`);
  page.on("console", dbgConsoleHandler);
  const errorsBeforeDebug = consoleErrors.length;
  const SECRET_STRINGS = ["demo_key_not_real_1234567890", "correct-horse-battery-demo", "demo_s3ss10n_value_123", "demo-db-pass-2026", "asha.verma@example.com"];
  const JWT_RE = /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/;
  const dbgIds = () => page.locator('[data-testid="finding-card"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-finding-id")));
  const loadDebugSample = async (id) => {
    await page.getByTestId("btn-debug-sample").click();
    await page.getByTestId(`debug-sample-option-${id}`).click();
    await page.waitForTimeout(550); // debounce (300 ms) + analysis; otherwise the previous sample's summary is still on screen
    await page.getByTestId("debug-summary").waitFor({ timeout: 2500 });
  };

  check("debug_tab_exists", await page.getByTestId("tool-tab-debug").isVisible());
  const deep = await context.newPage();
  await deep.goto(BASE + "#debug", { waitUntil: "networkidle" });
  check("debug_hash_deeplink_opens_tab", await deep.getByTestId("debug-input").isVisible() && !(await deep.getByTestId("json-tree").isVisible().catch(() => false)));
  await deep.close();
  await page.getByTestId("tool-tab-jwt").click();
  check("hash_updates_on_switch", (await page.evaluate(() => location.pathname)) === "/jwt-decoder/");
  await page.getByTestId("tool-tab-debug").click();
  await page.waitForTimeout(100);
  check("debug_empty_state_shown", await page.getByTestId("debug-empty").isVisible());

  // expired-token sample
  await loadDebugSample("expired-token");
  let ids = await dbgIds();
  check("debug_sample_expired_token_findings", ids.includes("jwt-expired") && ids.includes("http-401"), JSON.stringify(ids));
  const firstHigh = page.locator('[data-testid="finding-card"][data-severity="high"]').first();
  check("debug_first_high_expanded", (await firstHigh.getByTestId("btn-finding-toggle").getAttribute("aria-expanded")) === "true");
  check("debug_detected_line_mentions_curl", /cURL/.test(await page.getByTestId("debug-detected").innerText()), await page.getByTestId("debug-detected").innerText());
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-expired-1440.png` });
  const rawInput = await page.getByTestId("debug-input").inputValue();
  const rawJwt = (rawInput.match(JWT_RE) || [""])[0];
  await page.getByTestId("debug-tab-sanitized").click();
  const sanitizedText = await page.getByTestId("debug-sanitized-output").innerText();
  check("debug_sanitized_has_no_raw_jwt", rawJwt.length > 20 && !sanitizedText.includes(rawJwt) && sanitizedText.includes("<JWT_1>"), sanitizedText.slice(0, 200));
  check("debug_ledger_lists_jwt", /JWTs/.test(await page.getByTestId("debug-ledger").innerText()));
  await page.getByTestId("btn-debug-copy-sanitized").click();
  await page.waitForTimeout(100);
  const sanClip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  const sanPre = await page.getByTestId("debug-sanitized-output").evaluate((el) => el.textContent);
  // win32: Chromium rewrites \n to \r\n when writing to the system clipboard, so
  // line endings alone are not a content difference. Both sides must be strings,
  // every other byte must still match, and the app's copy path is untouched.
  // The diagnostic reports shape only — type, length, and the first differing
  // offset — because even sanitized report text is sensitive and this message
  // ends up in CI logs.
  const clipIsStr = typeof sanClip === "string";
  const preIsStr = typeof sanPre === "string";
  const toLf = (s) => (typeof s === "string" ? s.replace(/\r\n/g, "\n") : s);
  const clipLf = toLf(sanClip);
  const preLf = toLf(sanPre);
  let firstDiffAt = -1;
  if (clipIsStr && preIsStr && clipLf !== preLf) {
    const shorter = Math.min(clipLf.length, preLf.length);
    firstDiffAt = 0;
    while (firstDiffAt < shorter && clipLf[firstDiffAt] === preLf[firstDiffAt]) firstDiffAt++;
  }
  check(
    "debug_copy_sanitized_matches",
    clipIsStr && preIsStr && clipLf === preLf && sanClip.length > 0,
    `clipType=${typeof sanClip} preType=${typeof sanPre} clipLen=${clipIsStr ? sanClip.length : "n/a"} preLen=${preIsStr ? sanPre.length : "n/a"} clipHasCrlf=${clipIsStr ? sanClip.includes("\r\n") : "n/a"} firstDiffAt=${firstDiffAt}`
  );
  const dlTxt = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-debug-download-sanitized").click();
  check("debug_download_sanitized_filename_txt", (await dlTxt).suggestedFilename() === "sanitized.txt");

  await page.getByTestId("debug-tab-share").click();
  check("debug_share_ai_default", (await page.getByTestId("debug-share-format-ai").getAttribute("aria-pressed")) === "true");
  await page.getByTestId("btn-debug-copy-report").click();
  await page.waitForTimeout(100);
  const aiClip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
  check("debug_share_ai_default_and_copy", aiClip.includes("FINDINGS") && aiClip.includes("review before sharing") && !aiClip.includes(rawJwt), String(aiClip).slice(0, 120));
  await page.getByTestId("debug-share-format-issue").click();
  check("debug_share_issue_has_details", (await page.getByTestId("debug-share-preview").innerText()).includes("Sanitized input") && (await page.getByTestId("debug-share-preview").textContent()).includes("<details>"));
  await page.getByTestId("debug-share-format-plain").click();
  check("debug_share_plain_has_problem_summary", (await page.getByTestId("debug-share-preview").innerText()).includes("PROBLEM SUMMARY"));
  check("debug_fakedoor_buttons_present", await page.getByTestId("btn-fakedoor-cli").isVisible() && await page.getByTestId("btn-fakedoor-team").isVisible() && await page.getByTestId("debug-fakedoor").isVisible());
  await page.getByTestId("debug-share-format-ai").click();
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-share-1440.png` });

  // CORS HAR sample
  await loadDebugSample("cors-har");
  await page.getByTestId("debug-tab-findings").click();
  ids = await dbgIds();
  check(
    "debug_sample_cors_har_findings",
    ["cors-method-not-allowed", "cors-header-not-allowed", "cors-missing-allow-origin", "cookie-samesite-none-insecure"].every((i) => ids.includes(i)),
    JSON.stringify(ids)
  );
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-har-1440.png` });
  await page.getByTestId("debug-tab-sanitized").click();
  const dlHar = page.waitForEvent("download", { timeout: 5000 });
  await page.getByTestId("btn-debug-download-sanitized").click();
  const harDownload = await dlHar;
  check("debug_download_sanitized_filename_har", harDownload.suggestedFilename() === "sanitized.har", harDownload.suggestedFilename());
  let harParses = false;
  try {
    const harPath = await harDownload.path();
    JSON.parse(require("fs").readFileSync(harPath, "utf8"));
    harParses = true;
  } catch (e) {
    harParses = false;
  }
  check("debug_sanitized_har_valid_json", harParses);

  // Java log sample
  await loadDebugSample("java-log");
  await page.getByTestId("debug-tab-findings").click();
  check("debug_sample_java_log_root_cause", /PSQLException/.test(await page.getByTestId("debug-log-card").innerText().catch(() => "")));
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-log-1440.png` });
  await page.getByTestId("debug-tab-sanitized").click();
  await page.getByTestId("toggle-debug-emails").click();
  await page.waitForTimeout(400);
  check("debug_toggle_emails_off_keeps_email", (await page.getByTestId("debug-sanitized-output").innerText()).includes("dev.user@example.com"));
  await page.getByTestId("toggle-debug-emails").click();
  await page.waitForTimeout(400);

  // palette commands (report exists)
  await page.getByTestId("btn-open-palette").click();
  await page.waitForTimeout(150);
  const dbgPalette = await page.getByTestId("command-palette").innerText();
  check("debug_palette_commands", /Load sample: expired token/i.test(dbgPalette) && /Copy AI-ready report/i.test(dbgPalette), dbgPalette.slice(0, 200));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  // localStorage / console hygiene so far
  await page.evaluate(() => {});
  const lsDump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  check("no_input_in_local_storage", SECRET_STRINGS.every((s) => !lsDump.includes(s)) && !JWT_RE.test(lsDump) && lsKeys.every((k) => ["dth.debug.firstSeen", "dth.theme", "dth.sidebar", "dth.recent", "dth.policy.v1"].includes(k)), lsDump.slice(0, 200));

  // clear resets
  await page.getByTestId("btn-debug-clear").click();
  await page.waitForTimeout(700);
  check("debug_clear_resets", (await page.getByTestId("debug-input").inputValue()) === "" && (await page.getByTestId("debug-empty").isVisible()));
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-empty-1440.png` });

  // open file
  await page.getByTestId("debug-tab-findings").click();
  await page.getByTestId("debug-file-input").setInputFiles({ name: "x.log", mimeType: "text/plain", buffer: Buffer.from("ERROR boom\nERROR boom") });
  await page.getByTestId("debug-summary").waitFor({ timeout: 3000 }).catch(() => {});
  check("debug_open_file_reads_text", (await page.getByTestId("debug-input").inputValue()).includes("ERROR boom") && (await page.getByTestId("debug-summary").isVisible()));

  // 20k lines
  const bigLog = Array.from({ length: 20000 }, (_, i) => `2026-09-30 10:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")} ERROR request ${i} failed for user ${i % 97}`).join("\n");
  await page.getByTestId("btn-debug-clear").click();
  await page.waitForTimeout(600);
  const dbgT0 = Date.now();
  // Playwright's fill() is very slow for multi-MB strings in a textarea (it is a harness cost, not an app cost),
  // so set the value the way a paste would: native setter + input event.
  await page.getByTestId("debug-input").evaluate((el, text) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, bigLog);
  await page.getByTestId("debug-summary").waitFor({ timeout: 8000 });
  const bigMs = Date.now() - dbgT0;
  check("debug_large_input_20k_lines_under_3s", bigMs < 3000, `${bigMs}ms`);

  // keyboard reachability
  await page.getByTestId("btn-debug-clear").click();
  await page.waitForTimeout(600);
  await page.getByTestId("btn-debug-sample").focus();
  const seen = new Set(["btn-debug-sample"]);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const tid = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    if (tid) seen.add(tid);
  }
  await loadDebugSample("expired-token");
  await page.getByTestId("debug-tab-share").click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const tid = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    if (tid) seen.add(tid);
  }
  check("debug_keyboard_reachable", ["btn-debug-sample", "debug-input", "debug-tab-findings", "btn-debug-copy-report"].every((t) => seen.has(t)), JSON.stringify([...seen]));

  // waitlist page
  const wl = await page.request.get(BASE + "waitlist.html");
  check("waitlist_page_served_and_has_form", wl.status() === 200 && (await wl.text()).includes('data-netlify="true"'));

  // mobile: no horizontal overflow on any sample x tab
  async function mobileOverflow(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    let worst = 0;
    for (const id of ["expired-token", "cors-har", "java-log"]) {
      await loadDebugSample(id);
      for (const t of ["findings", "sanitized", "share"]) {
        await page.getByTestId(`debug-tab-${t}`).click();
        await page.waitForTimeout(80);
        const w = await page.evaluate(() => document.documentElement.scrollWidth);
        worst = Math.max(worst, w);
      }
    }
    return worst;
  }
  const w844 = await mobileOverflow(390, 844);
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-390x844.png` });
  check("debug_mobile_390x844_no_overflow", w844 <= 390, `${w844}`);
  const menuVisible = await page.getByTestId("btn-menu").isVisible();
  check("debug_nav_scrolls_not_page_on_mobile", w844 <= 390 && menuVisible, JSON.stringify({ w844, menuVisible }));
  const w640 = await mobileOverflow(390, 640);
  await page.screenshot({ path: `${SHOT_DIR}/wp2-debug-390x640.png` });
  check("debug_mobile_390x640_no_overflow", w640 <= 390, `${w640}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);

  // console hygiene for the whole Debug suite
  page.off("console", dbgConsoleHandler);
  const leaked = dbgConsole.filter((m) => SECRET_STRINGS.some((s) => m.includes(s)) || JWT_RE.test(m));
  check("no_console_message_contains_input", leaked.length === 0, JSON.stringify(leaked).slice(0, 300));
  const dbgErrors = consoleErrors.slice(errorsBeforeDebug);
  check("no_console_errors_after_debug_suite", dbgErrors.length === 0, JSON.stringify(dbgErrors));
  // localStorage again after all three samples were loaded
  const lsDump2 = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  const lsKeys2 = await page.evaluate(() => Object.keys(localStorage));
  check("no_input_in_local_storage_after_all_samples", SECRET_STRINGS.every((s) => !lsDump2.includes(s)) && !JWT_RE.test(lsDump2) && lsKeys2.every((k) => ["dth.debug.firstSeen", "dth.theme", "dth.sidebar", "dth.recent", "dth.policy.v1"].includes(k)), lsDump2.slice(0, 200));

  // ---- Final console/network check ----
  check("no_console_errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  // Lazy chunks are real same-origin asset requests after first paint. What must
  // stay at zero is any request that is not our own code: no API, no CDN, no font.
  const offOriginOrNonAsset = requestsAfterLoad.filter((r) => !r.url.startsWith(BASE + "assets/"));
  check("zero_network_after_load", offOriginOrNonAsset.length === 0, JSON.stringify(offOriginOrNonAsset));
  check("only_same_origin_assets_after_load", requestsAfterLoad.every((r) => r.url.startsWith(BASE + "assets/") && ["script", "stylesheet", "font", "image"].includes(r.resourceType)), JSON.stringify(requestsAfterLoad));

  // ---- WP1: CSP + headers + public files ----
  const cspContent = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content").catch(() => null);
  check("csp_meta_present", !!cspContent, String(cspContent));
  check("csp_connect_src_none", !!cspContent && cspContent.includes("connect-src 'none'"), String(cspContent));
  check("csp_default_src_none", !!cspContent && cspContent.includes("default-src 'none'"), String(cspContent));
  const probe = await context.newPage();
  await probe.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });
  const fetchResult = await probe.evaluate(async () => {
    try { await fetch("https://example.com/?probe=1"); return "sent"; } catch { return "blocked"; }
  });
  check("csp_blocks_background_fetch", fetchResult === "blocked", fetchResult);
  await probe.close();
  check("robots_txt_served", (await page.request.get(BASE + "robots.txt")).status() === 200);
  check("sitemap_xml_served", (await page.request.get(BASE + "sitemap.xml")).status() === 200);
  const fs = require("fs");
  const headersFile = fs.existsSync("dist/_headers") ? fs.readFileSync("dist/_headers", "utf8") : "";
  check("headers_file_has_frame_protection", headersFile.includes("X-Frame-Options: DENY") && headersFile.includes("frame-ancestors 'none'"), headersFile.slice(0, 200));
  check("headers_csp_not_on_wildcard", !/\/\*\n(?:  [^\n]*\n)*  Content-Security-Policy/.test(headersFile), "CSP must not be under /*");
  await page.getByRole("button", { name: /processed locally/i }).click();
  check("privacy_badge_mentions_csp", await page.getByText("connect-src 'none'", { exact: false }).first().isVisible().catch(() => false));

  // ---- theme (T-102) ----
  const { p, errors } = await newCheckedPage(context);
  await p.goto(BASE, { waitUntil: "networkidle" });

  // The header button cycles system -> light -> dark -> system, so clicking it
  // until the attribute reads back the target is the only way to get there
  // without assuming what the stored preference was on arrival.
  async function clickThemeTo(target) {
    for (let i = 0; i < 4; i++) {
      const cur = await p.evaluate(() => document.documentElement.dataset.theme || "system");
      if (cur === target) return true;
      await p.getByTestId("btn-theme").click();
      await p.waitForTimeout(120);
    }
    return false;
  }

  const toLight = await clickThemeTo("light");
  const lightBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("theme_light_bg", toLight && lightBg === "rgb(250, 250, 251)", `reached=${toLight} bg=${lightBg}`);

  const toDark = await clickThemeTo("dark");
  const darkBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("theme_dark_bg", toDark && darkBg === "rgb(11, 11, 15)", `reached=${toDark} bg=${darkBg}`);

  await p.reload({ waitUntil: "networkidle" });
  const themeAfterReload = await p.evaluate(() => document.documentElement.dataset.theme || "system");
  check("theme_persists_after_reload", themeAfterReload === "dark", themeAfterReload);

  const backToSystem = await clickThemeTo("system");
  check("theme_no_console_errors", errors.length === 0 && backToSystem, JSON.stringify({ errors, backToSystem }));
  await p.close();

  // ---- paths & pages (T-104) ----
  const TOOL_ROOTS = [
    ["json-formatter", "main-editor"],
    ["jwt-decoder", "jwt-input"],
    ["regex-tester", "regex-pattern-input"],
    ["timestamp-converter", "timestamp-epoch-input"],
    ["encode-generate", "generators-submode-base64"],
    ["debug-report", "debug-input"],
  ];
  for (const [slug, rootId] of TOOL_ROOTS) {
    const { p: tp, errors: te } = await newCheckedPage(context);
    await tp.goto(BASE + slug + "/", { waitUntil: "networkidle" });
    const visible = await tp.getByTestId(rootId).isVisible().catch(() => false);
    check(`path_${slug}_loads`, visible && te.length === 0, JSON.stringify({ visible, errors: te }));
    await tp.close();
  }

  {
    const { p: hp } = await newCheckedPage(context);
    await hp.goto(BASE + "#jwt", { waitUntil: "networkidle" });
    const path = await hp.evaluate(() => location.pathname);
    check("legacy_hash_redirects", path === "/jwt-decoder/", path);
    await hp.close();
  }

  // Files on disk: what a crawler gets without running any JavaScript.
  const fsRead = (rel) => require("fs").readFileSync(require("path").join(process.cwd(), "dist", rel), "utf8");
  check("prerender_has_h1", fsRead("jwt-decoder/index.html").includes("<h1>JWT Decoder</h1>"));

  const allHtml = [];
  (function walk(rel) {
    for (const name of require("fs").readdirSync(require("path").join(process.cwd(), "dist", rel))) {
      const childRel = rel ? `${rel}/${name}` : name;
      const full = require("path").join(process.cwd(), "dist", childRel);
      if (require("fs").statSync(full).isDirectory()) walk(childRel);
      else if (name.endsWith(".html")) allHtml.push(childRel);
    }
  })("");
  const missingCsp = allHtml.filter((f) => !/^waitlist/.test(f) && !fsRead(f).includes("connect-src 'none'"));
  check("csp_meta_on_every_page", missingCsp.length === 0, JSON.stringify(missingCsp));

  // Every tool ships as <slug>/index.html, so the shipped set is read from the build
  // rather than typed. A hard-coded count went stale the moment P2 added a tool;
  // deriving it makes each new tool a check instead of a maintenance chore.
  const SHIPPED_TOOLS = allHtml
    .filter((f) => /^[^/]+\/index\.html$/.test(f) && !["privacy", "about"].includes(f.split("/")[0]))
    .map((f) => f.split("/")[0]);
  check("shipped_tools_from_build", SHIPPED_TOOLS.length >= 7 && SHIPPED_TOOLS.includes("yaml-to-json"), JSON.stringify(SHIPPED_TOOLS));

  // Netlify merges every matching rule, so two CSPs would both apply. The header
  // must be attached per page and never to the "/*" block. Split into blocks
  // rather than regex across them: "\s+" matches blank lines, which would let a
  // later block's CSP look like part of the wildcard block.
  const headers = fsRead("_headers");
  const headerBlocks = headers.split(/\r?\n\r?\n/);
  const wildcardBlock = headerBlocks.find((b) => b.trimStart().startsWith("/*")) ?? "";
  const jwtBlock = headerBlocks.find((b) => /^\/jwt-decoder\/\s*$/m.test(b)) ?? "";
  check(
    "headers_csp_per_page",
    /Content-Security-Policy:/.test(jwtBlock) && !/Content-Security-Policy:/.test(wildcardBlock),
    JSON.stringify({ jwtBlockHasCsp: /Content-Security-Policy:/.test(jwtBlock), wildcardHasCsp: /Content-Security-Policy:/.test(wildcardBlock) })
  );
  check("sitemap_lists_tools", fsRead("sitemap.xml").includes("/debug-report/"));
  check("notfound_page_exists", fsRead("404.html").includes("Page not found"));

  // ---- shell (T-105) ----
  {
    const { p: sp, errors: se } = await newCheckedPage(context);
    await sp.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });

    const linkCount = await sp.getByTestId("tool-switcher").locator("a").count();
    check("shell_sidebar_has_all_tools", linkCount === SHIPPED_TOOLS.length, JSON.stringify({ linkCount, SHIPPED_TOOLS }));

    // AC4: reach the link with the Tab key, then read the REAL computed outline.
    // Programmatic .focus() would not match :focus-visible, so this drives the
    // keyboard like a person would.
    let tabbedToLink = false;
    for (let i = 0; i < 40; i++) {
      await sp.keyboard.press("Tab");
      const active = await sp.evaluate(() => document.activeElement?.getAttribute("data-testid"));
      if (active === "tool-tab-jwt") {
        tabbedToLink = true;
        break;
      }
    }
    const ring = await sp.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor };
    });
    check(
      "shell_focus_ring_visible",
      tabbedToLink && ring !== null && ring.outlineStyle !== "none" && ring.outlineWidth !== "0px" && !/rgba\(0, 0, 0, 0\)/.test(ring.outlineColor),
      JSON.stringify({ tabbedToLink, ring })
    );

    await sp.getByRole("button", { name: /processed locally/i }).click();
    const popoverOpen = await sp.getByTestId("privacy-popover").isVisible();
    const popoverText = await sp.getByTestId("privacy-popover").innerText();
    await sp.keyboard.press("Escape");
    await sp.waitForTimeout(120);
    const popoverClosed = !(await sp.getByTestId("privacy-popover").isVisible().catch(() => false));
    check(
      "shell_privacy_popover_text",
      popoverOpen && popoverText.includes("connect-src 'none'") && popoverClosed,
      JSON.stringify({ popoverOpen, popoverClosed })
    );

    await sp.getByTestId("tool-tab-jwt").click();
    await sp.waitForTimeout(200);
    await sp.getByTestId("tool-tab-regex").click();
    await sp.waitForTimeout(200);
    const recentJwt = await sp.getByTestId("recent-jwt-decoder").count();
    const recentRegex = await sp.getByTestId("recent-regex-tester").count();
    check("shell_recent_updates", recentJwt === 1 && recentRegex === 1, JSON.stringify({ recentJwt, recentRegex }));

    await sp.getByTestId("btn-collapse-sidebar").click();
    await sp.waitForTimeout(120);
    const collapsedWidth = await sp.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width ?? -1);
    await sp.reload({ waitUntil: "networkidle" });
    const afterReloadWidth = await sp.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width ?? -1);
    check(
      "shell_collapse_persists",
      Math.round(collapsedWidth) === 56 && Math.round(afterReloadWidth) === 56,
      JSON.stringify({ collapsedWidth, afterReloadWidth })
    );
    await sp.getByTestId("btn-collapse-sidebar").click();

    check("shell_no_console_errors", se.length === 0, JSON.stringify(se));
    await sp.close();
  }

  {
    const { p: mp, errors: me } = await newCheckedPage(context);
    await mp.setViewportSize({ width: 390, height: 844 });
    await mp.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });
    const pageWidth = await mp.evaluate(() => document.documentElement.scrollWidth);
    check("shell_no_horizontal_overflow_390", pageWidth <= 390, String(pageWidth));

    const expandedAttr = () => mp.getByTestId("btn-menu").getAttribute("aria-expanded");
    const controlsAttr = () => mp.getByTestId("btn-menu").getAttribute("aria-controls");
    const controlsResolves = () => mp.evaluate(() => {
      const t = document.querySelector('[data-testid="btn-menu"]');
      const id = t && t.getAttribute("aria-controls");
      return id ? !!document.getElementById(id) : null;
    });
    const expClosed = await expandedAttr();
    const ctlClosed = await controlsAttr();

    await mp.getByTestId("btn-menu").click();
    await mp.waitForTimeout(150);
    const drawerOpen = await mp.getByTestId("mobile-drawer").isVisible();
    const expOpen = await expandedAttr();
    const ctlOpenResolves = await controlsResolves();
    // A drawer rendered in the collapsed state would still "be visible" while
    // showing icon-only rows, so assert the labels are actually there.
    const drawerText = drawerOpen ? await mp.getByTestId("mobile-drawer").innerText() : "";
    const drawerHasLabels = drawerText.includes("JSON Workbench") && drawerText.includes("Debug Report");
    await mp.keyboard.press("Escape");
    await mp.waitForTimeout(150);
    const drawerClosed = !(await mp.getByTestId("mobile-drawer").isVisible().catch(() => false));
    const focusReturnedTo = await mp.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    const expReClosed = await expandedAttr();
    check(
      "shell_mobile_drawer_opens",
      drawerOpen && drawerHasLabels && drawerClosed && focusReturnedTo === "btn-menu" && me.length === 0,
      JSON.stringify({ drawerOpen, drawerHasLabels, drawerClosed, focusReturnedTo, errors: me })
    );
    // The disclosure state must be announced and must not desynchronise after a
    // second open/close cycle.
    await mp.getByTestId("btn-menu").click();
    await mp.waitForTimeout(150);
    const expSecondOpen = await expandedAttr();
    await mp.getByTestId("drawer-scrim").click({ position: { x: 300, y: 400 } });
    await mp.waitForTimeout(150);
    const expAfterScrim = await expandedAttr();
    check(
      "drawer_aria_expanded_tracks_state",
      expClosed === "false" && expOpen === "true" && expReClosed === "false" && expSecondOpen === "true" && expAfterScrim === "false",
      JSON.stringify({ expClosed, expOpen, expReClosed, expSecondOpen, expAfterScrim })
    );
    check(
      "drawer_aria_controls_resolves_only_when_open",
      ctlClosed === null && ctlOpenResolves === true,
      JSON.stringify({ ctlClosed, ctlOpenResolves })
    );
    await mp.close();
  }

  // ---- home & static pages (T-106) ----
  {
    const { p: hp, errors: he } = await newCheckedPage(context);
    await hp.goto(BASE, { waitUntil: "networkidle" });
    const homeH1 = await hp.getByRole("heading", { level: 1 }).innerText();
    check("home_loads", /Developer tools that never see your data/.test(homeH1), homeH1.slice(0, 80));

    // Take a token from the JWT tool's own sample — never a literal in this file
    // (gitleaks would flag a real-looking JWT in source).
    await hp.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" });
    await hp.getByTestId("btn-jwt-sample").click();
    await hp.waitForTimeout(250);
    const token = await hp.getByTestId("jwt-input").locator("textarea").inputValue();

    await hp.goto(BASE, { waitUntil: "networkidle" });
    await hp.getByTestId("home-paste").fill(token);
    await hp.waitForTimeout(400);
    const chipVisible = await hp.getByTestId("home-suggest-jwt-decoder").isVisible();
    check("home_detects_jwt", chipVisible && token.length > 20, JSON.stringify({ chipVisible, len: token.length }));

    await hp.getByTestId("home-suggest-jwt-decoder").click();
    await hp.waitForTimeout(400);
    const handoffPath = await hp.evaluate(() => location.pathname);
    const applied = await hp.getByTestId("jwt-input").locator("textarea").inputValue();
    check("home_handoff_jwt", handoffPath === "/jwt-decoder/" && applied.startsWith(token.slice(0, 20)), JSON.stringify({ handoffPath, matched: applied.startsWith(token.slice(0, 20)) }));

    const lsDump = await hp.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    check("handoff_not_persisted", !lsDump.includes(token.slice(0, 20)), "localStorage holds no pasted text");

    await hp.goto(BASE, { waitUntil: "networkidle" });
    await hp.getByTestId("home-paste").fill(`curl https://api.example.com -H 'authorization: Bearer ${token}'`);
    await hp.waitForTimeout(400);
    check("home_secrets_warning", await hp.getByTestId("home-secrets-warning").isVisible(), "warning shown");

    const cards = await hp.locator('[data-testid^="home-card-"]').count();
    check("home_cards_link", cards === SHIPPED_TOOLS.length, JSON.stringify({ cards, SHIPPED_TOOLS }));

    await hp.goto(BASE + "privacy/", { waitUntil: "networkidle" });
    const privacyH1 = await hp.getByRole("heading", { level: 1 }).innerText();
    check("privacy_page_loads", /privacy/i.test(privacyH1), privacyH1.slice(0, 80));

    await hp.goto(BASE + "no-such-tool/", { waitUntil: "networkidle" });
    const notfoundH1 = await hp.getByRole("heading", { level: 1 }).innerText();
    check("notfound_page_for_unknown_path", /page not found/i.test(notfoundH1), notfoundH1.slice(0, 80));

    check("home_no_console_errors", he.length === 0, JSON.stringify(he));
    await hp.close();
  }

  // ---- palette v2 (T-107) ----
  {
    const { p: pp, errors: pe } = await newCheckedPage(context);
    await pp.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });

    await pp.keyboard.press("/");
    await pp.waitForTimeout(200);
    const slashOpen = await pp.getByTestId("command-palette").isVisible().catch(() => false);
    check("palette_slash_opens", slashOpen, String(slashOpen));

    await pp.getByRole("combobox").fill("jwtdec");
    await pp.waitForTimeout(150);
    const firstOption = await pp.getByRole("option").first().innerText();
    check("palette_fuzzy_yaml_like", /JWT Decoder/i.test(firstOption), firstOption.slice(0, 60));
    await pp.keyboard.press("Escape");

    // Recents: visit two tools, reopen the palette, expect the Recent group.
    await pp.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" });
    await pp.goto(BASE + "regex-tester/", { waitUntil: "networkidle" });
    await pp.getByTestId("btn-open-palette").click();
    await pp.waitForTimeout(250);
    const paletteText = await pp.getByTestId("command-palette").innerText();
    check("palette_recent_section", /recent/i.test(paletteText), paletteText.slice(0, 120));
    check("palette_no_console_errors", pe.length === 0, JSON.stringify(pe));
    await pp.close();
  }

  // ---- tool layout & shared components (T-108) ----
  {
    const TOOL_PAGES = [
      ["json-formatter", "JSON Formatter, Validator and Diff"],
      ["jwt-decoder", "JWT Decoder"],
      ["regex-tester", "Regex Tester"],
      ["timestamp-converter", "Unix Timestamp Converter"],
      ["encode-generate", "Base64, URL, UUID and Hash Tools"],
      ["debug-report", "Debug Report: diagnose and redact requests"],
    ];
    for (const [slug, title] of TOOL_PAGES) {
      const { p: lp, errors: le } = await newCheckedPage(context);
      await lp.goto(BASE + slug + "/", { waitUntil: "networkidle" });
      const h1 = await lp.getByRole("heading", { level: 1 }).innerText();
      check(`toollayout_h1_${slug}`, h1 === title && le.length === 0, JSON.stringify({ h1, expected: title }));
      await lp.close();
    }

    const { p: dp, errors: de } = await newCheckedPage(context);
    await dp.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" });

    await dp.getByRole("heading", { name: "How to use" }).scrollIntoViewIfNeeded();
    const docsVisible = await dp.getByRole("heading", { name: "How to use" }).isVisible();
    const relatedVisible = await dp.getByTestId("related-debug-report").isVisible().catch(() => false);
    check("toollayout_docs_block", docsVisible && relatedVisible, JSON.stringify({ docsVisible, relatedVisible }));

    // The app shell is a fixed-height grid, so the scroll container is the main
    // region, not window. Find the nearest scrollable ancestor of the workspace.
    const scrollInfo = await dp.evaluate(() => {
      let sc = document.querySelector('[data-testid="tool-workspace"]')?.parentElement ?? null;
      while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!sc) return { found: false };
      const before = sc.scrollTop;
      sc.scrollTop = sc.scrollHeight;
      const after = sc.scrollTop;
      sc.scrollTop = before;
      return { found: true, after, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight };
    });
    check("toollayout_page_scrolls", scrollInfo.found === true && scrollInfo.scrollHeight > scrollInfo.clientHeight && scrollInfo.after > 0, JSON.stringify(scrollInfo));

    await dp.getByTestId("related-debug-report").click();
    await dp.waitForTimeout(400);
    const relatedPath = await dp.evaluate(() => location.pathname);
    check("toollayout_related_links_navigate", relatedPath === "/debug-report/", relatedPath);

    // Clipboard correctness: success is announced only after it happens, and a
    // forced failure (rejected promise + failing execCommand) must say so. Both
    // clipboard paths are broken deliberately; nothing is read back here.
    await dp.getByTestId("btn-debug-sample").click();
    await dp.waitForTimeout(200);
    const sampleItem = dp.getByRole("menuitem").first();
    if (await sampleItem.isVisible().catch(() => false)) await sampleItem.click();
    await dp.waitForTimeout(800);
    await dp.getByTestId("debug-tab-sanitized").click();
    await dp.waitForTimeout(300);

    await dp.getByTestId("btn-debug-copy-sanitized").click();
    await dp.waitForTimeout(300);
    const okToast = await dp.getByText("Copied", { exact: true }).isVisible().catch(() => false);
    check("copy_success_reports_copied", okToast, String(okToast));

    await dp.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
      document.execCommand = () => false;
    });
    await dp.getByTestId("btn-debug-copy-sanitized").click();
    await dp.waitForTimeout(400);
    const failToast = await dp.getByText("Copy failed — select and copy manually", { exact: true }).isVisible().catch(() => false);
    check("copy_failure_reports_failure", failToast, String(failToast));

    check("toollayout_no_console_errors", de.length === 0, JSON.stringify(de));
    await dp.close();
  }

  // ---- T-113: the docs block must be reachable by scrolling in BOTH themes ----
  // The original check ran once under the ambient theme only; a theme that
  // changed the workspace height could hide the docs block undetected.
  {
    for (const theme of ["light", "dark"]) {
      const { p: wp, errors: we } = await newCheckedPage(context);
      await wp.goto(BASE, { waitUntil: "domcontentloaded" });
      await wp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      await wp.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" });
      await wp.waitForTimeout(300);
      const info = await wp.evaluate(() => {
        let sc = document.querySelector('[data-testid="tool-workspace"]')?.parentElement ?? null;
        while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (!sc) return { found: false };
        const before = sc.scrollTop;
        sc.scrollTop = sc.scrollHeight;
        const after = sc.scrollTop;
        // Measured AT full scroll: the point of the check is that the docs block
        // can be reached, so sampling it after the restore would always miss.
        const docs = Array.from(document.querySelectorAll("h2,h3")).find((h) => /how to use/i.test(h.textContent || ""));
        const r = docs?.getBoundingClientRect();
        const docsReachable = !!r && r.top < innerHeight && r.bottom > 0;
        sc.scrollTop = before;
        return { found: true, after, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, theme: document.documentElement.dataset.theme ?? "system", docsReachable };
      });
      check(`toollayout_page_scrolls_${theme}`, info.found === true && info.scrollHeight > info.clientHeight && info.after > 0 && info.docsReachable && we.length === 0, JSON.stringify({ info, errors: we }));
      await wp.close();
    }
  }

  {
    // AC4 on a narrow screen: the page scrolls and never overflows sideways.
    const { p: mp2 } = await newCheckedPage(context);
    await mp2.setViewportSize({ width: 390, height: 844 });
    await mp2.goto(BASE + "debug-report/", { waitUntil: "networkidle" });
    const info = await mp2.evaluate(() => {
      let sc = document.querySelector('[data-testid="tool-workspace"]')?.parentElement ?? null;
      while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      const before = sc ? sc.scrollTop : 0;
      if (sc) sc.scrollTop = sc.scrollHeight;
      const after = sc ? sc.scrollTop : 0;
      if (sc) sc.scrollTop = before;
      return { width: document.documentElement.scrollWidth, found: !!sc, after, scrollHeight: sc ? sc.scrollHeight : 0, clientHeight: sc ? sc.clientHeight : 0 };
    });
    check("toollayout_mobile_scrolls_no_overflow", info.width <= 390 && info.found && info.scrollHeight > info.clientHeight && info.after > 0, JSON.stringify(info));
    await mp2.close();
  }

  // ---- accessibility (T-109) ----
  {
    const axeSource = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
    // Every route the product actually ships: 7 tools, home, and all three
    // static pages including the not-found experience, which the first pass
    // omitted along with /about/.
    const PAGES = [
      ["", "home"],
      ["privacy/", "privacy"],
      ["about/", "about"],
      ["not-a-real-route/", "notfound"],
      ["json-formatter/", "json-formatter"],
      ["jwt-decoder/", "jwt-decoder"],
      ["regex-tester/", "regex-tester"],
      ["timestamp-converter/", "timestamp-converter"],
      ["encode-generate/", "encode-generate"],
      ["debug-report/", "debug-report"],
      ["yaml-to-json/", "yaml-to-json"],
    ];
    for (const [slug, name] of PAGES) {
      for (const theme of ["light", "dark"]) {
        const { p: ap } = await newCheckedPage(context);
        await ap.goto(BASE + slug, { waitUntil: "networkidle" });
        // localStorage then reload: the theme must be applied before axe reads
        // computed colours. addScriptTag would be blocked by script-src 'self'.
        await ap.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
        await ap.reload({ waitUntil: "networkidle" });
        await ap.waitForTimeout(250);
        await ap.evaluate(axeSource);
        const violations = await ap.evaluate(async () => {
          const result = await window.axe.run(document, { resultTypes: ["violations"] });
          return result.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0] && v.nodes[0].target }));
        });
        check(`a11y_${name}_${theme}`, violations.length === 0, JSON.stringify(violations));
        await ap.close();
      }
    }
  }

  // ---- R-CP1-focus: visible keyboard focus, measured not assumed ----
  {
    // mustBeInset: controls that sit edge-to-edge inside a pane with
    // overflow:hidden. A positive outline-offset would be clipped there, so the
    // ring must be drawn inside the control. Computed style alone cannot see
    // clipping — the offset is the geometric part of the assertion.
    const CONTROLS = [
      // The CodeMirror editors are NOT listed here: their ring is painted by a
      // pseudo-element on the frame, so a computed `outline` assertion on them
      // would be meaningless. They are covered by the rendered-pixel block
      // further down, which checks all four edges actually paint.
      ["debug_textarea", "debug-report/", '[data-testid="debug-input"]', true],
      ["jwt_textarea", "jwt-decoder/", '[data-testid="jwt-input"] textarea', true],
      ["regex_pattern", "regex-tester/", '[data-testid="regex-pattern-input"]', false],
    ];
    for (const theme of ["light", "dark"]) {
      for (const [name, slug, selector, mustBeInset] of CONTROLS) {
        const { p: fp } = await newCheckedPage(context);
        await fp.goto(BASE + slug, { waitUntil: "networkidle" });
        await fp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
        await fp.reload({ waitUntil: "networkidle" });
        await fp.waitForTimeout(200);
        const result = await fp.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { missing: true };
          el.focus();
          // CodeMirror paints the ring on its frame; plain inputs on themselves.
          const target = el.closest(".cm-editor") ?? el;
          const s = getComputedStyle(target);
          return {
            focused: document.activeElement === el,
            focusVisible: el.matches(":focus-visible"),
            outlineStyle: s.outlineStyle,
            outlineWidth: s.outlineWidth,
            outlineColor: s.outlineColor,
            outlineOffset: parseFloat(s.outlineOffset) || 0,
          };
        }, selector);
        const ringVisible =
          !result.missing &&
          result.focused &&
          result.focusVisible &&
          result.outlineStyle !== "none" &&
          result.outlineWidth !== "0px" &&
          !/rgba\(0, 0, 0, 0\)/.test(result.outlineColor);
        check(
          `focus_ring_${name}_${theme}`,
          ringVisible && (!mustBeInset || result.outlineOffset <= 0),
          JSON.stringify(result)
        );
        await fp.close();
      }
    }
  }

  // ---- T-110: a CodeMirror editor must not trap the keyboard ----
  {
    // @uiw/react-codemirror defaults indentWithTab to true, which binds Tab and
    // Shift-Tab to indentMore/indentLess. Focus could then never leave the
    // editor by keyboard. These tests drive real key presses and assert on
    // document.activeElement; "a Tab event fired" would prove nothing.
    const EDITOR_SURFACES = [
      ["json", "json-formatter/", '[data-testid="main-editor"] .cm-content', async (p) => { await p.goto(BASE + "json-formatter/", { waitUntil: "networkidle" }); }],
      ["jwt_payload", "jwt-decoder/", '[data-testid="jwt-payload-output"] .cm-content', async (p) => { await p.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" }); await p.getByTestId("btn-jwt-sample").click(); await p.waitForTimeout(600); }],
    ];
    for (const [label, slug, sel, setup] of EDITOR_SURFACES) {
      const { p: kp, errors: ke } = await newCheckedPage(context);
      await setup(kp);
      await kp.waitForTimeout(200);
      // Resolve the sequential-focus neighbours of the editor in DOM order so
      // the assertion is about real navigation, not a hardcoded control.
      const plan = await kp.evaluate((s) => {
        const editor = document.querySelector(s);
        if (!editor) return { missing: true };
        const items = Array.from(
          document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])')
        ).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const idx = items.findIndex((el) => el === editor || el.contains(editor) || editor.contains(el));
        const id = (el) => (el ? el.tagName.toLowerCase() + ":" + (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.className.toString().split(/\s+/)[0]).slice(0, 30) : null);
        return { idx, prev: id(items[idx - 1]), next: id(items[idx + 1]), count: items.length };
      }, sel);
      if (plan.missing || plan.idx < 1) {
        check(`cm_tab_escapes_${label}`, false, JSON.stringify(plan));
        await kp.close();
        continue;
      }
      // Step in from the preceding control, then step out again.
      await kp.evaluate((s) => {
        const editor = document.querySelector(s);
        const items = Array.from(document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])')).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const idx = items.findIndex((el) => el === editor || el.contains(editor) || editor.contains(el));
        items[idx - 1].scrollIntoView({ block: "center" });
        items[idx - 1].focus();
      }, sel);
      await kp.keyboard.press("Tab");
      const entered = await kp.evaluate((s) => { const e = document.querySelector(s); return !!e && document.activeElement === e; }, sel);
      await kp.keyboard.press("Tab");
      const after = await kp.evaluate(() => {
        const a = document.activeElement;
        return { insideEditor: !!(a && a.closest && a.closest(".cm-editor")), id: a ? a.tagName.toLowerCase() + ":" + (a.getAttribute("data-testid") || a.getAttribute("aria-label") || a.className.toString().split(/\s+/)[0]).slice(0, 30) : "BODY" };
      });
      await kp.keyboard.press("Shift+Tab");
      const backInside = await kp.evaluate((s) => { const e = document.querySelector(s); return !!e && document.activeElement === e; }, sel);
      check(`cm_tab_enters_${label}`, entered === true, JSON.stringify({ entered, plan }));
      check(`cm_tab_escapes_${label}`, after.insideEditor === false, JSON.stringify({ after, plan }));
      check(`cm_tab_destination_is_document_order_${label}`, after.id === plan.next, JSON.stringify({ expected: plan.next, got: after.id }));
      check(`cm_shift_tab_returns_${label}`, backInside === true, JSON.stringify({ backInside, after }));
      await kp.close();
      void slug;
    }
    // Editor semantics survive the keymap change: typing still edits.
    {
      const { p: ep, errors: ee } = await newCheckedPage(context);
      await ep.goto(BASE + "json-formatter/", { waitUntil: "networkidle" });
      await ep.waitForTimeout(400);
      await ep.locator('[data-testid="main-editor"] .cm-content').first().click({ position: { x: 200, y: 40 } });
      await ep.keyboard.type('  {"kept": true}');
      const typed = await ep.locator('[data-testid="main-editor"] .cm-content').innerText();
      check("cm_typing_still_works", typed.includes('"kept"') && ee.length === 0, JSON.stringify({ typed: typed.replace(/\s+/g, " ").slice(0, 40), errors: ee }));
      await ep.close();
    }
  }

  // ---- T-111: the editor focus ring must actually render on all four edges ----
  {
    const analyzer = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const RING_TARGETS = [
      ["json_editor", "json-formatter/", ".cm-editor", async (p) => { await p.goto(BASE + "json-formatter/", { waitUntil: "networkidle" }); }],
      ["jwt_payload_editor", "jwt-decoder/", '[data-testid="jwt-payload-output"] .cm-editor', async (p) => { await p.goto(BASE + "jwt-decoder/", { waitUntil: "networkidle" }); await p.getByTestId("btn-jwt-sample").click(); await p.waitForTimeout(600); }],
    ];
    for (const theme of ["light", "dark"]) {
      for (const [label, slug, frameSel, setup] of RING_TARGETS) {
        const { p: rp } = await newCheckedPage(context);
        await rp.goto(BASE, { waitUntil: "domcontentloaded" });
        await rp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
        await setup(rp);
        await rp.waitForTimeout(300);
        const accent = await rp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-accent").trim().split(/\s+/).map(Number));
        const box = await rp.evaluate((s) => {
          const content = document.querySelector(s.replace(".cm-editor", ".cm-content")) || document.querySelector(`${s} .cm-content`);
          const frame = document.querySelector(s);
          if (!frame || !content) return { missing: true };
          frame.scrollIntoView({ block: "center" });
          content.focus();
          const r = frame.getBoundingClientRect();
          return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), focused: document.activeElement === content, label: content.getAttribute("aria-label") };
        }, frameSel);
        if (box.missing) { check(`focus_ring_${label}_${theme}`, false, JSON.stringify(box)); await rp.close(); continue; }
        const focused = await edgeCoverage(analyzer, await rp.screenshot(), box, accent);
        // Blur and re-measure: a ring that never disappears is not a focus indicator.
        await rp.evaluate(() => document.activeElement && document.activeElement.blur());
        await rp.waitForTimeout(150);
        const blurred = await edgeCoverage(analyzer, await rp.screenshot(), box, accent);
        const ok = box.focused && focused.allFour && ["left", "right", "top", "bottom"].every((k) => blurred.ratio(blurred.edges[k]) < 0.05);
        check(`focus_ring_${label}_${theme}`, ok, JSON.stringify({ accent, box, focused: focused.edges, blurred: blurred.edges }));
        await rp.screenshot({ path: `${SHOT_DIR}/ring-${label}-${theme}.png`, clip: { x: Math.max(0, box.l - 12), y: Math.max(0, box.t - 12), width: Math.min(1400, box.r - box.l + 24), height: Math.min(880, box.b - box.t + 24) } });
        await rp.close();
      }
    }
    await analyzer.close();
  }

  // ---- T-112: accent foreground/background pairs must hold AA in both themes ----
  {
    // --c-accent-hover is a foreground token; a hovered FILLED control needs its
    // own background token, because the two roles demand opposite luminance in
    // dark mode. This measures the real rendered pair on a reachable control.
    for (const theme of ["light", "dark"]) {
      const { p: cp } = await newCheckedPage(context);
      await cp.goto(BASE, { waitUntil: "domcontentloaded" });
      await cp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      await cp.goto(BASE + "no-such-route-xyz/", { waitUntil: "networkidle" });
      await cp.waitForTimeout(300);
      const tokens = await cp.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const triple = (n) => cs.getPropertyValue(n).trim();
        return { accent: triple("--c-accent"), accentHover: triple("--c-accent-hover"), strong: triple("--c-accent-strong"), strongHover: triple("--c-accent-strong-hover"), onAccent: triple("--c-on-accent"), surface: triple("--c-surface"), canvas: triple("--c-canvas") };
      });
      const T = (s) => s.split(/\s+/).map(Number);
      const white = T(tokens.onAccent);
      const pairs = {
        "strong_bg_white_text": contrastRatio(white, T(tokens.strong)),
        "strong_hover_bg_white_text": contrastRatio(white, T(tokens.strongHover)),
        "accent_text_on_surface": contrastRatio(T(tokens.accent), T(tokens.surface)),
        "accent_hover_text_on_surface": contrastRatio(T(tokens.accentHover), T(tokens.surface)),
        "focus_ring_on_surface": contrastRatio(T(tokens.accent), T(tokens.surface)),
      };
      const cta = cp.getByRole("button", { name: "Search tools", exact: true });
      const rest = await cta.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color, fontSize: getComputedStyle(e).fontSize }));
      await cta.hover();
      await cp.waitForTimeout(200);
      const hov = await cta.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }));
      const renderedRest = contrastRatio(parseRgb(rest.fg), parseRgb(rest.bg));
      const renderedHover = contrastRatio(parseRgb(hov.fg), parseRgb(hov.bg));
      const allPass =
        pairs.strong_bg_white_text >= 4.5 &&
        pairs.strong_hover_bg_white_text >= 4.5 &&
        pairs.accent_text_on_surface >= 4.5 &&
        pairs.accent_hover_text_on_surface >= 4.5 &&
        pairs.focus_ring_on_surface >= 3 &&
        renderedRest >= 4.5 &&
        renderedHover >= 4.5;
      check(`contrast_accent_pairs_${theme}`, allPass, JSON.stringify({ pairs, renderedRest: +renderedRest.toFixed(2), renderedHover: +renderedHover.toFixed(2), rest, hover: hov }));
      await cp.close();
    }
  }

  // ---- T-114: rendered regex highlights must stay readable (N-1) ----
  {
    // Every fixture drives the real workbench and then measures the painted
    // pixels' colours. The empty-page sweep that let N-1 through is exactly what
    // this replaces: a highlight only exists once a pattern produces matches.
    const FIXTURES = [
      { name: "nested_groups", pattern: "(((x)))y", text: "xy", minHighlights: 4, minLevels: 3 },
      { name: "multiple_matches", pattern: "\\d+", text: "a1b22c333", minHighlights: 3, minLevels: 1 },
      { name: "capture_and_plain", pattern: "(\\w)(\\d)", text: "a1 b2 c3", minHighlights: 6, minLevels: 2 },
      { name: "no_match", pattern: "zzz", text: "abc", minHighlights: 0, minLevels: 0, exactHighlights: 0 },
    ];
    for (const theme of ["light", "dark"]) {
      let levelsSeen = new Set();
      for (const fx of FIXTURES) {
        const { p: gp, errors: ge } = await newCheckedPage(context);
        await gp.goto(BASE, { waitUntil: "domcontentloaded" });
        await gp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
        await gp.goto(BASE + "regex-tester/", { waitUntil: "networkidle" });
        await gp.waitForTimeout(250);
        await gp.getByTestId("regex-pattern-input").fill(fx.pattern);
        await gp.locator('textarea[aria-label="Test text"]').fill(fx.text);
        await gp.waitForTimeout(500);
        const measured = await gp.evaluate(measureHighlightContrast, '[data-testid="regex-highlight"]');
        if (measured.missing) {
          check(`regex_highlight_contrast_${fx.name}_${theme}`, false, "highlight container never rendered");
          await gp.close();
          continue;
        }
        const highlights = measured.rows.filter((r) => r.tag !== "pre");
        // Assert the fixture actually produced output before trusting the numbers:
        // a silent no-match would make any contrast test vacuously pass.
        const fixtureOk = highlights.length >= fx.minHighlights &&
          // A no-match fixture that silently started matching would otherwise
          // assert nothing at all, so pin the count exactly where it matters.
          (fx.exactHighlights === undefined || highlights.length === fx.exactHighlights);
        const levels = new Set(highlights.map((r) => r.level));
        const levelsOk = levels.size >= fx.minLevels;
        const failing = highlights.concat(measured.rows).filter((r) => r.ratio < 4.5);
        check(
          `regex_highlight_contrast_${fx.name}_${theme}`,
          fixtureOk && (fx.minLevels === 0 || levelsOk) && failing.length === 0 && !measured.uaBlackMark && ge.length === 0,
          JSON.stringify({ theme, fixture: fx.name, highlights: highlights.length, levels: [...levels], uaBlackMark: measured.uaBlackMark, failing, sample: highlights.slice(0, 5), errors: ge })
        );
        highlights.forEach((r) => levelsSeen.add(r.level));
        await gp.close();
      }
      check(`regex_highlight_levels_exercised_${theme}`, [0, 1, 2].every((l) => levelsSeen.has(l)), JSON.stringify([...levelsSeen]));
      // An invalid pattern must be reported, not silently rendered as no matches.
      const { p: ip } = await newCheckedPage(context);
      await ip.goto(BASE + "regex-tester/", { waitUntil: "networkidle" });
      await ip.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      await ip.reload({ waitUntil: "networkidle" });
      await ip.getByTestId("regex-pattern-input").fill("(unclosed");
      await ip.locator('textarea[aria-label="Test text"]').fill("abc");
      await ip.waitForTimeout(500);
      const invalid = await ip.evaluate(() => {
        const st = document.querySelector('[data-testid="regex-status"][data-status="invalid"]');
        return { reported: !!st, text: st ? (st.textContent || "").trim().slice(0, 60) : null };
      });
      check(`regex_invalid_pattern_reported_${theme}`, invalid.reported === true && /invalid|error|unterminated|unexpected/i.test(invalid.text || ""), JSON.stringify(invalid));
      await ip.close();
    }
  }

  // ---- T-113: closing the command palette must return focus to its opener ----
  {
    for (const theme of ["light", "dark"]) {
      const { p: fp, errors: fe } = await newCheckedPage(context);
      await fp.goto(BASE, { waitUntil: "domcontentloaded" });
      await fp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      await fp.goto(BASE, { waitUntil: "networkidle" });
      const active = () => fp.evaluate(() => {
        const a = document.activeElement;
        return !a || a === document.body ? "BODY" : a.tagName.toLowerCase() + ":" + (a.getAttribute("data-testid") || a.getAttribute("aria-label") || "").slice(0, 30);
      });
      // 1. Opened by pointer from the header trigger.
      await fp.getByTestId("btn-open-palette").click();
      await fp.waitForTimeout(250);
      const openedOn = await active();
      await fp.keyboard.press("Escape");
      await fp.waitForTimeout(250);
      const restoredTo = await active();
      check(`palette_focus_restored_pointer_${theme}`, openedOn.startsWith("input:") && restoredTo === "button:btn-open-palette", JSON.stringify({ openedOn, restoredTo }));
      // 2. Opened by keyboard from a sidebar link: the link is the opener.
      await fp.getByTestId("nav-home").focus();
      await fp.keyboard.press("Control+k");
      await fp.waitForTimeout(250);
      const openedByKbd = await active();
      await fp.keyboard.press("Escape");
      await fp.waitForTimeout(250);
      const restoredKbd = await active();
      check(`palette_focus_restored_keyboard_${theme}`, openedByKbd.startsWith("input:") && restoredKbd === "a:nav-home", JSON.stringify({ openedByKbd, restoredKbd }));
      // 3. Running a command must still navigate and must not lose focus.
      await fp.getByTestId("btn-open-palette").click();
      await fp.waitForTimeout(250);
      await fp.keyboard.press("Enter");
      await fp.waitForTimeout(500);
      const afterRun = await active();
      const path = await fp.evaluate(() => location.pathname);
      check(`palette_run_navigates_and_keeps_focus_${theme}`, path !== "/" && afterRun === "button:btn-open-palette" && fe.length === 0, JSON.stringify({ path, afterRun, errors: fe }));
      await fp.close();
    }
  }

  // ---- T-114 closure: palette focus when the executed command unmounts the opener ----
  {
    for (const theme of ["light", "dark"]) {
      const { p: up, errors: ue } = await newCheckedPage(context);
      await up.goto(BASE, { waitUntil: "domcontentloaded" });
      await up.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      // The 404 page's CTA is the opener; running a command navigates away and
      // unmounts it, which previously left focus on <body>.
      await up.goto(BASE + "no-such-route-xyz/", { waitUntil: "networkidle" });
      await up.waitForTimeout(250);
      await up.getByRole("button", { name: "Search tools", exact: true }).click();
      await up.waitForTimeout(250);
      await up.keyboard.press("Enter");
      await up.waitForTimeout(600);
      const landed = await up.evaluate(() => {
        const a = document.activeElement;
        return {
          tag: a ? a.tagName.toLowerCase() : null,
          visible: !!a && a.offsetParent !== null,
          onToolPage: !!(a && a.closest && a.closest("[data-tool-page], main")),
          isHeading: !!a && a.tagName === "H1",
          text: (a && a.textContent || "").trim().slice(0, 34),
          path: location.pathname,
        };
      });
      check(
        `palette_focus_lands_on_heading_when_opener_unmounts_${theme}`,
        landed.isHeading && landed.visible && landed.onToolPage && landed.path !== "/no-such-route-xyz/" && ue.length === 0,
        JSON.stringify({ landed, errors: ue })
      );
      // Repeated palette-driven navigation must never strand focus on <body>.
      let strandedAt = null;
      for (let round = 1; round <= 3; round++) {
        await up.getByTestId("btn-open-palette").click();
        await up.waitForTimeout(250);
        await up.keyboard.press("Enter"); // run the highlighted command -> navigates
        await up.waitForTimeout(500);
        const act = await up.evaluate(() => !document.activeElement || document.activeElement === document.body);
        if (act && !strandedAt) strandedAt = round;
      }
      check(`palette_focus_never_stranded_on_body_${theme}`, strandedAt === null, JSON.stringify({ strandedAt }));
      // Rapid open/close must leave the palette closed and focus recoverable.
      for (let i = 0; i < 4; i++) {
        await up.keyboard.press("Control+k");
        await up.waitForTimeout(60);
      }
      const rapid = await up.evaluate(() => ({
        dialogOpen: !!document.querySelector('[data-testid="command-palette"]'),
        active: document.activeElement ? document.activeElement.tagName.toLowerCase() : "none",
      }));
      check(`palette_rapid_toggle_stable_${theme}`, rapid.dialogOpen === false && rapid.active !== "body" && ue.length === 0, JSON.stringify({ rapid, errors: ue }));
      await up.close();
    }
  }

  // ---- regex hand-off carries flags (T-109 review repair) ----
  {
    const { p: rp } = await newCheckedPage(context);
    await rp.goto(BASE, { waitUntil: "networkidle" });
    await rp.getByTestId("home-paste").fill("/foo/gi");
    await rp.waitForTimeout(400);
    await rp.getByTestId("home-suggest-regex-tester").click();
    await rp.waitForTimeout(500);
    const pattern = await rp.getByTestId("regex-pattern-input").inputValue();
    const iOn = await rp.getByTestId("regex-flag-i").getAttribute("aria-pressed");
    const gOn = await rp.getByTestId("regex-mode-all").getAttribute("aria-pressed");
    check("regex_handoff_applies_flags", pattern === "foo" && iOn === "true" && gOn === "true", JSON.stringify({ pattern, iOn, gOn }));
    await rp.close();
  }

  // ---- home route must not preload an editor it never shows ----
  {
    const { p: np } = await newCheckedPage(context);
    const requested = [];
    np.on("request", (r) => requested.push(r.url()));
    await np.goto(BASE, { waitUntil: "networkidle" });
    const jsFiles = requested.filter((u) => /\/assets\/.*\.js$/.test(u)).map((u) => u.split("/").pop());
    const editorLoaded = jsFiles.some((f) => /codemirror|JsonWorkbenchApp|JsonEditor|DebugReportApp/i.test(f));
    check("home_loads_no_editor_chunk", !editorLoaded, JSON.stringify(jsFiles));
    await np.close();
  }

  // ---- T-201: YAML ⇄ JSON ----
  {
    const YAML_SRC = "a: 1\nb: [x, y]";
    const YAML_EXPECTED = '{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}';
    const JSON_SRC = '{"a":1,"b":["x"],"c":{"d":null,"e":"yes"}}';
    const JSON_EXPECTED = "a: 1\nb:\n  - x\nc:\n  d: null\n  e: yes\n";
    const ALIAS_BOMB =
      "a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]";

    const { p, errors } = await newCheckedPage(context);
    const requests = [];
    p.on("request", (r) => requests.push(r.url()));

    await p.goto(BASE + "yaml-to-json/", { waitUntil: "networkidle" });
    await p.waitForTimeout(250);

    const h1 = p.getByRole("heading", { level: 1 });
    const h1Text = await h1.innerText().catch(() => "");
    check("yaml_json_loads", (await h1.isVisible().catch(() => false)) && /YAML/i.test(h1Text), JSON.stringify(h1Text));
    check("yaml_json_in_sidebar", await p.getByTestId("nav-yaml-json").isVisible().catch(() => false));
    check(
      "yaml_json_related_links_render",
      (await p.getByTestId("related-json-workbench").count()) > 0 && (await p.getByTestId("related-debug-report").count()) > 0
    );

    const input = p.getByTestId("yaml-json-input").locator("textarea");
    const status = p.getByTestId("yaml-json-status");
    // React tracks the value on the instance, so a megabyte-scale input has to go
    // through the native setter plus an input event; Playwright's fill() spent
    // 30 s on it and timed out.
    const setValue = (text) =>
      p.evaluate((v) => {
        const ta = document.querySelector('[data-testid="yaml-json-input"] textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, v);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }, text);
    const readOutput = async () => {
      const el = p.getByTestId("yaml-json-output").locator(".cm-content");
      if ((await el.count()) === 0) return null;
      return (await el.innerText()).replace(/\n+$/, "");
    };
    // win32: Chromium rewrites \n to \r\n on its way to the system clipboard, so
    // line endings alone are not a content difference. Every other byte must still
    // match, and the app's copy path is untouched.
    const clipText = (s) => (typeof s === "string" ? s.replace(/\r\n/g, "\n") : s);

    // Empty state must be useful, not just blank.
    check("yaml_json_empty_status", (await status.getAttribute("data-status")) === "empty", await status.innerText());
    check("yaml_json_copy_disabled_when_empty", await p.getByTestId("yaml-json-copy").isDisabled().catch(() => false));
    await p.getByTestId("btn-yaml-json-sample").click();
    await p.waitForTimeout(350);
    check("yaml_json_after_sample", (await status.getAttribute("data-status")) === "valid" && /"apiVersion"/.test((await readOutput()) || ""), (await status.innerText()));

    // Main example, exact.
    await setValue(YAML_SRC);
    await p.waitForTimeout(350);
    const mainOut = await readOutput();
    check("yaml_json_main", mainOut === YAML_EXPECTED, JSON.stringify(mainOut));

    // Copy gives back exactly what the spec's table says, newline for newline.
    await p.getByTestId("yaml-json-copy").click();
    await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
    check("yaml_json_copy", clipText(clip) === YAML_EXPECTED, JSON.stringify(clip).slice(0, 160));

    // Indent select.
    await p.getByTestId("yaml-json-indent").selectOption("4");
    await p.waitForTimeout(350);
    check("yaml_json_indent_4", (await readOutput()) === '{\n    "a": 1,\n    "b": [\n        "x",\n        "y"\n    ]\n}', JSON.stringify(await readOutput()));
    await p.getByTestId("yaml-json-indent").selectOption("2");
    await p.waitForTimeout(300);

    // Multi-document: one array plus the note that says why.
    await setValue("a: 1\n---\nb: 2\n");
    await p.waitForTimeout(350);
    const multiOut = await readOutput();
    const multiNotes = await p.getByTestId("yaml-json-notes").innerText().catch(() => "");
    check(
      "yaml_json_multi_doc",
      multiOut === '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]' && /2 YAML documents were combined/.test(multiNotes),
      JSON.stringify({ multiOut, multiNotes })
    );

    // Reverse direction, exact.
    await p.getByRole("radio", { name: "JSON → YAML" }).click();
    await p.waitForTimeout(150);
    await setValue(JSON_SRC);
    await p.waitForTimeout(350);
    const revOut = await readOutput();
    await p.getByTestId("yaml-json-copy").click();
    await p.waitForTimeout(200);
    const revClip = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR:${e.message}`);
    check("yaml_json_reverse", revOut === JSON_EXPECTED.trimEnd() && clipText(revClip) === JSON_EXPECTED, JSON.stringify({ revOut, revClip }));

    // Paste auto-detects the direction (spec: auto-set on paste via guessDirection).
    await p.getByRole("radio", { name: "YAML → JSON" }).click();
    await p.waitForTimeout(150);
    await input.click();
    const pasted = await p
      .evaluate((text) => {
        const ta = document.querySelector('[data-testid="yaml-json-input"] textarea');
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const dispatched = ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        return { dispatched, hasClipboardData: !!new ClipboardEvent("paste", { clipboardData: dt }).clipboardData };
      }, JSON_SRC)
      .catch((e) => ({ error: e.message }));
    await p.waitForTimeout(350);
    const autoDir = await p.getByRole("radio", { name: "JSON → YAML" }).getAttribute("aria-checked");
    check("yaml_json_paste_autodetects_direction", autoDir === "true", JSON.stringify({ pasted, autoDir }));

    // The paste test leaves the tool in JSON → YAML; every case below is YAML input.
    await p.getByRole("radio", { name: "YAML → JSON" }).click();
    await p.waitForTimeout(200);

    // Errors: coordinates shown once, and the output pane refuses to show stale text.
    await setValue("a: [1, 2\nb: 3");
    await p.waitForTimeout(350);
    const errStatus = await status.getAttribute("data-status");
    const errText = await status.innerText();
    check("yaml_json_error", errStatus === "invalid" && /line 2/.test(errText) && errText.length > 20, JSON.stringify(errText));
    check("yaml_json_error_coordinates_once", !/column 1: \(line/.test(errText), JSON.stringify(errText));
    check("yaml_json_error_hides_output", (await p.getByTestId("yaml-json-output").count()) === 0);

    await setValue("a: 1\na: 2");
    await p.waitForTimeout(350);
    check("yaml_json_duplicate_key", /unique/i.test(await status.innerText()), await status.innerText());

    // Refusals that matter for a tool that parses untrusted input.
    await setValue(ALIAS_BOMB);
    await p.waitForTimeout(500);
    check(
      "yaml_json_alias_bomb_refused",
      (await status.getAttribute("data-status")) === "invalid" && /Too many aliases/.test(await status.innerText()),
      await status.innerText()
    );

    await setValue("__proto__: evil\nsafe: 1");
    await p.waitForTimeout(350);
    const protoText = await status.innerText();
    check(
      "yaml_json_prototype_key_refused",
      (await status.getAttribute("data-status")) === "invalid" && /__proto__/.test(protoText),
      JSON.stringify(protoText)
    );
    const polluted = await p.evaluate(() => ({}).polluted === undefined && !Object.prototype.hasOwnProperty.call({}, "safe"));
    check("yaml_json_no_prototype_pollution", polluted);

    // YAML 1.2 semantics, surfaced in the UI rather than only in unit tests.
    await setValue("on: yes\noff: no\nnullish:\nempty:");
    await p.waitForTimeout(350);
    const sem = await readOutput();
    check("yaml_json_12_semantics", /"on": "yes"/.test(sem || "") && /"off": "no"/.test(sem || "") && /"nullish": null/.test(sem || ""), JSON.stringify(sem));

    // Over the manual threshold the tool must stop recomputing on every keystroke.
    // Comment lines only, so the document stays 1 MB while the result stays tiny.
    const bigComment = ("# " + "p".repeat(78) + "\n").repeat(12_600);
    check("yaml_json_manual_input_is_over_threshold", bigComment.length > 1_000_000, String(bigComment.length));
    await setValue(bigComment);
    await p.waitForTimeout(600);
    check(
      "yaml_json_manual_button",
      (await p.getByTestId("yaml-json-run").isVisible().catch(() => false)) && (await status.getAttribute("data-status")) === "idle",
      await status.innerText()
    );
    check("yaml_json_manual_output_absent", (await p.getByTestId("yaml-json-output").count()) === 0);
    await p.getByTestId("yaml-json-run").click();
    await p.waitForTimeout(2000);
    check("yaml_json_manual_converts_on_demand", (await status.getAttribute("data-status")) === "valid", await status.innerText());

    // Clear resets everything.
    await setValue(YAML_SRC);
    await p.waitForTimeout(400);
    await p.getByTestId("btn-yaml-json-clear").click();
    await p.waitForTimeout(250);
    check("yaml_json_clear", (await status.getAttribute("data-status")) === "empty" && (await input.inputValue()) === "");

    // Home detection and hand-off.
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.getByTestId("home-paste").fill("server:\n  host: localhost\n  port: 8080\n");
    await p.waitForTimeout(400);
    check("yaml_json_home_detects", await p.getByTestId("home-suggest-yaml-json").isVisible().catch(() => false));
    await p.getByTestId("home-suggest-yaml-json").click();
    await p.waitForTimeout(600);
    const handed = await readOutput();
    check(
      "yaml_json_handoff_converts",
      /yaml-to-json/.test(p.url()) && (await status.getAttribute("data-status")) === "valid" && /"host": "localhost"/.test(handed || ""),
      JSON.stringify({ url: p.url(), handed })
    );

    // Keyboard: focus must be able to leave both the textarea and the read-only editor.
    await input.click();
    const seen = new Set();
    for (let i = 0; i < 14; i++) {
      await p.keyboard.press("Tab");
      seen.add(await p.evaluate(() => {
        const a = document.activeElement;
        return a ? `${a.tagName}:${a.getAttribute("data-testid") || a.getAttribute("aria-label") || ""}` : "none";
      }));
    }
    check("yaml_json_keyboard_escapes_editor", seen.size >= 4, JSON.stringify([...seen]));
    const trappedInEditor = await p.evaluate(() => {
      const a = document.activeElement;
      return !!a && !!a.closest && !!a.closest('[data-testid="yaml-json-output"]');
    });
    check("yaml_json_focus_not_stranded_in_output", !trappedInEditor);

    check("yaml_json_no_console_errors", errors.length === 0, JSON.stringify(errors.slice(0, 3)));
    const offOrigin = requests.filter((u) => /^https?:\/\//.test(u) && !u.startsWith(BASE));
    check("yaml_json_requests_stay_local", offOrigin.length === 0, JSON.stringify(offOrigin.slice(0, 5)));
    await p.screenshot({ path: `${SHOT_DIR}/30-yaml-json-dark.png` });
    await p.close();

    // Light theme and a phone viewport.
    const axeSource = require("fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
    for (const theme of ["light", "dark"]) {
      const { p: tp, errors: te } = await newCheckedPage(context);
      await tp.goto(BASE + "yaml-to-json/", { waitUntil: "domcontentloaded" });
      await tp.evaluate((t) => localStorage.setItem("dth.theme", t), theme);
      await tp.reload({ waitUntil: "networkidle" });
      await tp.getByTestId("yaml-json-input").locator("textarea").fill(YAML_SRC);
      await tp.waitForTimeout(400);
      const tOut = await tp.getByTestId("yaml-json-output").locator(".cm-content").innerText().catch(() => "");
      check(`yaml_json_${theme}_theme_converts`, tOut.replace(/\n+$/, "") === YAML_EXPECTED && te.length === 0, JSON.stringify({ tOut, te: te.slice(0, 2) }));
      // axe against the populated page: an empty tool page cannot show a contrast
      // problem in the result pane, which is how CP1's blockers stayed hidden.
      // Same impact filter as the route gate above. The one finding here is
      // `region/moderate × 6`, measured identical on all five older tool pages —
      // a shared ToolLayout matter, recorded in reports/T-201.md, not a T-201 regression.
      await tp.evaluate(axeSource);
      const violations = await tp.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ["violations"] });
        return r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}/${v.impact} × ${v.nodes.length}: ${(v.nodes[0].target || []).join(" ")}`);
      });
      check(`yaml_json_axe_populated_${theme}`, violations.length === 0, JSON.stringify(violations.slice(0, 4)));
      await tp.screenshot({ path: `${SHOT_DIR}/31-yaml-json-${theme}.png` });
      await tp.close();
    }
    {
      const { p: mp, errors: me } = await newCheckedPage(context);
      await mp.setViewportSize({ width: 375, height: 812 });
      await mp.goto(BASE + "yaml-to-json/", { waitUntil: "networkidle" });
      await mp.getByTestId("yaml-json-input").locator("textarea").fill(YAML_SRC);
      await mp.waitForTimeout(400);
      const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(
        "yaml_json_mobile_usable",
        (await mp.getByTestId("yaml-json-input").isVisible()) &&
          (await mp.getByTestId("yaml-json-output").isVisible()) &&
          overflow <= 1 &&
          me.length === 0,
        JSON.stringify({ overflow, me: me.slice(0, 2) })
      );
      await mp.screenshot({ path: `${SHOT_DIR}/32-yaml-json-mobile.png`, fullPage: true });
      await mp.close();
    }
  }

  await browser.close();

  console.log("\n===== RESULTS =====");
  for (const [k, v] of Object.entries(results)) {
    console.log(`${v ? "PASS" : "FAIL"}  ${k}`);
  }
  console.log("\n===== CONSOLE ERRORS =====");
  console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");
  console.log("\n===== CONSOLE WARNINGS =====");
  console.log(consoleWarnings.length ? consoleWarnings.join("\n") : "(none)");
  console.log("\n===== REQUESTS AFTER LOAD =====");
  console.log(requestsAfterLoad.length ? JSON.stringify(requestsAfterLoad, null, 2) : "(none — fully local)");
  console.log("\n===== ALL REQUESTS (incl. initial doc) =====");
  console.log(JSON.stringify(allRequests));
  console.log(`\n${failures.length} FAILURE(S)`);
  if (failures.length) {
    console.log(failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
