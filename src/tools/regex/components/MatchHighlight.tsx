import type { ReactNode } from "react";
import type { RegexMatch } from "../../../lib/regex";

interface Region {
  start: number;
  end: number;
  className: string;
  title: string;
  children: Region[];
}

// The canvas background is a very dark near-black (see theme/colors.js),
// so a low-opacity tint barely reads as distinct from unhighlighted text —
// this was reported as a real contrast bug (matches with no capture groups,
// e.g. `\d+` or `hello`, only ever got this base shade and were nearly
// invisible). 40% is the lowest opacity that still stands out clearly
// against that background on its own, before any group shading stacks on
// top of it.
const MATCH_CLASS = "bg-accent/40 rounded-[3px]";
// Increasing intensity by nesting depth so a group inside a group is
// still visually distinguishable from its parent, capped at 3 levels —
// deeper nesting just repeats the deepest shade rather than going dark
// enough to hurt legibility. Text flips to the (dark) canvas color only at
// the deepest level, once the fill is solid enough that the light `ink`
// text color would itself start losing contrast against it.
const GROUP_CLASSES = ["bg-accent/55 rounded-[3px]", "bg-accent/70 rounded-[3px]", "bg-accent/85 rounded-[3px] text-canvas"];

// Capture-group spans are always either nested inside, or disjoint from,
// the overall match and from each other — they come from paired
// parentheses in the pattern, which by construction can never partially
// cross one another. That's what guarantees this stack-based nesting
// always produces a valid tree; the bounds check is a defensive fallback
// only, so a region that somehow doesn't fit is skipped rather than ever
// producing broken/overlapping DOM.
function nestRegions(outer: Region, groupRegions: Region[]): Region {
  const sorted = [...groupRegions].sort((a, b) => a.start - b.start || b.end - a.end);
  const root: Region = { ...outer, children: [] };
  const stack: Region[] = [root];
  for (const r of sorted) {
    while (stack.length > 1 && !(r.start >= stack[stack.length - 1].start && r.end <= stack[stack.length - 1].end)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (r.start < parent.start || r.end > parent.end) continue;
    const node: Region = { ...r, children: [] };
    parent.children.push(node);
    stack.push(node);
  }
  return root;
}

function assignGroupClasses(node: Region, root: Region, depth: number) {
  if (node !== root) node.className = GROUP_CLASSES[Math.min(depth - 1, GROUP_CLASSES.length - 1)];
  node.children.forEach((c) => assignGroupClasses(c, root, depth + 1));
}

function renderRegion(fullText: string, region: Region, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = region.start;
  region.children.forEach((child, i) => {
    if (child.start > cursor) parts.push(fullText.slice(cursor, child.start));
    parts.push(
      <span key={`${keyPrefix}-${i}`} className={child.className} title={child.title}>
        {renderRegion(fullText, child, `${keyPrefix}-${i}`)}
      </span>
    );
    cursor = child.end;
  });
  if (cursor < region.end) parts.push(fullText.slice(cursor, region.end));
  return parts;
}

export default function MatchHighlight({ text, matches }: { text: string; matches: RegexMatch[] }) {
  if (text === "") {
    return <p className="p-4 text-center text-sm text-ink-faint">Nothing to show yet — type some test text on the left.</p>;
  }

  const baseClass =
    "h-full min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3.5 font-mono text-[13px] leading-6 text-ink";

  if (matches.length === 0) {
    return (
      <pre data-testid="regex-highlight" className={baseClass}>
        {text}
      </pre>
    );
  }

  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((m, mi) => {
    if (m.start > cursor) nodes.push(text.slice(cursor, m.start));
    const groupRegions: Region[] = m.groups
      .filter((g) => g.start !== null && g.end !== null)
      .map((g) => ({
        start: g.start as number,
        end: g.end as number,
        className: "",
        title: g.name ? `Group "${g.name}"` : `Group ${g.number}`,
        children: [],
      }));
    const outer: Region = { start: m.start, end: m.end, className: MATCH_CLASS, title: `Match ${mi + 1}`, children: [] };
    const tree = nestRegions(outer, groupRegions);
    assignGroupClasses(tree, tree, 1);
    nodes.push(
      <mark key={`m-${mi}`} className={MATCH_CLASS} title={`Match ${mi + 1}`}>
        {renderRegion(text, tree, `m-${mi}`)}
      </mark>
    );
    cursor = m.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <pre data-testid="regex-highlight" className={baseClass}>
      {nodes}
    </pre>
  );
}
