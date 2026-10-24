// Validates src/registry/meta.ts before it can reach the registry or the
// static-page generator. Exits 1 and lists EVERY problem at once, so a failing
// run does not have to be repeated once per bad field.
// Rules: docs/v3/ARCHITECTURE.md §4 and tasks/P1_foundation.md (T-103).
import { TOOL_META } from "../src/registry/meta";
import { ICONS } from "../src/registry/icons";

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SLUGS = ["privacy", "about", "cli", "assets"];
const ICON_KEYS = new Set(Object.keys(ICONS));
const ALL_IDS = new Set(TOOL_META.map((t) => t.id));

const problems: string[] = [];
const seenIds = new Map<string, number>();
const seenSlugs = new Map<string, number>();

function bad(msg: string) {
  problems.push(msg);
}

TOOL_META.forEach((t, i) => {
  const where = `TOOL_META[${i}] (${t.id || "no id"})`;

  if (!ID_RE.test(t.id)) bad(`${where}: id "${t.id}" must be kebab-case (${ID_RE})`);
  if (!ID_RE.test(t.slug)) bad(`${where}: slug "${t.slug}" must be kebab-case (${ID_RE})`);
  if (RESERVED_SLUGS.includes(t.slug)) bad(`${where}: slug "${t.slug}" is reserved`);

  if (seenIds.has(t.id)) bad(`${where}: duplicate id, also at index ${seenIds.get(t.id)}`);
  else seenIds.set(t.id, i);

  if (seenSlugs.has(t.slug)) bad(`${where}: duplicate slug, also at index ${seenSlugs.get(t.slug)}`);
  else seenSlugs.set(t.slug, i);

  if (t.title.length > 48) bad(`${where}: title is ${t.title.length} chars (max 48)`);
  if (t.navTitle.length > 22) bad(`${where}: navTitle is ${t.navTitle.length} chars (max 22)`);

  const d = t.description.length;
  if (d < 70 || d > 155) bad(`${where}: description is ${d} chars (must be 70-155)`);

  if (t.keywords.length < 3) bad(`${where}: has ${t.keywords.length} keywords (min 3)`);

  if (t.docs.howTo.length < 2 || t.docs.howTo.length > 5) bad(`${where}: howTo has ${t.docs.howTo.length} items (must be 2-5)`);
  if (t.docs.faq.length < 1 || t.docs.faq.length > 6) bad(`${where}: faq has ${t.docs.faq.length} items (must be 1-6)`);

  if (t.docs.related.length < 2 || t.docs.related.length > 4) {
    bad(`${where}: related has ${t.docs.related.length} items (must be 2-4)`);
  }
  for (const rel of t.docs.related) {
    if (rel === t.id) bad(`${where}: related must not include itself`);
    else if (!ALL_IDS.has(rel)) bad(`${where}: related "${rel}" is not an existing tool id`);
  }

  if (!ICON_KEYS.has(t.icon)) {
    bad(`${where}: icon "${t.icon}" is not in ICONS (src/registry/icons.ts). Keys: ${[...ICON_KEYS].join(", ")}`);
  }
});

if (problems.length > 0) {
  console.error(`check-registry: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`check-registry: OK (${TOOL_META.length} tools)`);
