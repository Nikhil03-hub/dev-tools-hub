const { chromium } = require(process.env.PW_MODULE || "/home/claude/.npm-global/lib/node_modules/playwright");

const BASE = "http://127.0.0.1:4173/";
const SHOT_DIR = process.env.SHOT_DIR || "/home/claude/json-workbench/test";

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

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  loadFinished = true;

  check("title_is_dev_tools_hub", (await page.title()) === "Dev Tools Hub", await page.title());
  check("initial_requests_only_document", allRequests.length <= 1, JSON.stringify(allRequests));

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
  check("hash_updates_on_switch", (await page.evaluate(() => location.hash)) === "#jwt");
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
  check("debug_copy_sanitized_matches", sanClip === sanPre && sanClip.length > 0, String(sanClip).slice(0, 80));
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
  check("no_input_in_local_storage", SECRET_STRINGS.every((s) => !lsDump.includes(s)) && !JWT_RE.test(lsDump) && lsKeys.every((k) => k === "dth.debug.firstSeen"), lsDump.slice(0, 200));

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
  const navInfo = await page.getByTestId("tool-switcher").evaluate((el) => ({ ov: getComputedStyle(el).overflowX, sw: el.scrollWidth, cw: el.clientWidth }));
  check("debug_nav_scrolls_not_page_on_mobile", w844 <= 390 && (navInfo.ov === "auto" || navInfo.ov === "scroll") && navInfo.cw <= 390, JSON.stringify(navInfo));
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
  check("no_input_in_local_storage_after_all_samples", SECRET_STRINGS.every((s) => !lsDump2.includes(s)) && !JWT_RE.test(lsDump2) && lsKeys2.every((k) => k === "dth.debug.firstSeen"), lsDump2.slice(0, 200));

  // ---- Final console/network check ----
  check("no_console_errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("zero_network_after_load", requestsAfterLoad.length === 0, JSON.stringify(requestsAfterLoad));

  // ---- WP1: CSP + headers + public files ----
  const cspContent = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content").catch(() => null);
  check("csp_meta_present", !!cspContent, String(cspContent));
  check("csp_connect_src_none", !!cspContent && cspContent.includes("connect-src 'none'"), String(cspContent));
  check("csp_default_src_none", !!cspContent && cspContent.includes("default-src 'none'"), String(cspContent));
  const probe = await context.newPage();
  await probe.goto(BASE, { waitUntil: "networkidle" });
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
