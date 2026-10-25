# Finding: keyboard focus indicators are removed, and no gate would catch it

Status: **open, needs a reviewer decision** (proposed repair task ID: `R-CP1-focus`)
Found during: T-102 (design tokens). Not a T-102 regression — the defect is present in V1 at commit `c7488ef`. T-102 only made the correct colour available.
Author: implementer (Qoder). This file is a report, not a queue entry; only the reviewer adds `R-` rows.

## 1. What the project requires

- **UX_SPEC §2, Focus:** `outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px;` on `:focus-visible` for **every** interactive element, with "Never remove an outline without replacing it."
- **AGENTS.md §6, Accessibility:** "Every interactive element is reachable by keyboard and has a visible focus ring."
- **UX_SPEC §9:** "Everything is operable by keyboard; … no keyboard traps."
- **T-105 acceptance criterion 4:** "Keyboard: Tab reaches every sidebar link in order, **focus rings are visible**, and Esc closes the drawer and the popover."

## 2. What the code actually does

17 sites remove the outline. Verified with `grep -rnE "outline-none|outline: *[\"']?none" src --include=*.tsx --include=*.ts`.

**A. Ten sites remove the focus indicator with no replacement at all:**

| File | Line | Element |
|---|---|---|
| `src/components/CommandPalette.tsx` | 69 | palette search input |
| `src/lib/cmTheme.ts` | 55 | `&.cm-editor.cm-focused { outline: none }` — every CodeMirror editor, which is the primary input of almost every tool |
| `src/tools/debug/DebugReportApp.tsx` | 258 | Debug Report input |
| `src/tools/generators/components/Base64Panel.tsx` | 130, 173 | Base64 input + output |
| `src/tools/generators/components/HashPanel.tsx` | 110 | hash input |
| `src/tools/generators/components/UrlEncodePanel.tsx` | 143, 186 | URL input + output |
| `src/tools/json/components/JwtDecoderApp.tsx` → actual path `src/tools/jwt/JwtDecoderApp.tsx` | 140 | JWT token input |
| `src/tools/regex/RegexTesterApp.tsx` | 209 | regex test text |

**B. Seven sites replace it with a 50%-alpha border tint:**

`TsView.tsx:36` (`focus:border-accent`), `ReplacePanel.tsx:30`, `RegexTesterApp.tsx:163`, `TimezonePicker.tsx:46`, `TimestampConverterApp.tsx:234`, `:282`, `:294` (all `focus:border-accent/50`).

Tailwind v3's `outline-none` is `outline: 2px solid transparent; outline-offset: 2px` — so the ring space is reserved and then painted transparent. A border tint at 50% alpha is a colour change of roughly one 1px ring segment; it is not a reliable focus indicator, and it is the only cue on those controls.

## 3. Why the automated gate will not catch this

T-109 runs axe-core 4.14.0 and fails only on `serious` or `critical` **violations**. The complete rule list for axe-core 4.14.0 (fetched from `dequelabs/axe-core` tag `v4.14.0`, `doc/rule-descriptions.md`, 73,159 bytes) contains **no focus-appearance or visible-focus rule**. The only focus-related rules are:

- `focus-order-semantics` — DOM order/semantics of focusable elements;
- `focusable-content`, `focusable-disabled`, `focusable-element`, `focusable-modal-open`, `focusable-no-name`, `focusable-not-tabbable` — ARIA/focusability correctness.

None of these asserts that a focused element is *visually distinguishable*. So T-109 can pass with 17 controls that erase their ring, and T-105's "focus rings are visible" has no automated check behind it.

## 4. The correct fix is already one rule away, and it is contrast-safe

The token needed already exists after T-102. WCAG 2.2 **1.4.11 Non-text Contrast** requires 3:1 for UI component states. Computed with the standard relative-luminance formula against the T-102 tokens:

| Ring colour | vs canvas | vs surface | vs raised | Requirement |
|---|---|---|---|---|
| Light `accent` `#5646D8` | 6.17:1 | 6.44:1 | 5.81:1 | ≥ 3:1 ✓ |
| Dark `accent` `#8B7CF8` | 5.93:1 | 5.63:1 | 5.22:1 | ≥ 3:1 ✓ |

## 5. Proposed repair task (for the reviewer to queue and word)

**`R-CP1-focus` — Restore a visible focus ring on every interactive element.**

Scope:
1. Add one global rule in `src/index.css` (outside `@tailwind` layers):
   ```css
   :focus-visible { outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px; }
   ```
2. Replace `outline-none` at the 17 sites with `focus-visible:outline-none` where a component supplies its own ring, or delete it — never leave a control with no indicator. Apply a consistent `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas` on bordered inputs.
3. Remove `"&.cm-editor.cm-focused": { outline: "none" }` from `cmTheme.ts` and give the editor a `:focus-visible` ring on the wrapper, so CodeMirror does not silently own the whole app's focus behaviour.
4. **Do not rely on axe.** Add an explicit e2e section that, for each of these controls, focuses it with the keyboard and asserts `getComputedStyle(el).outlineStyle !== "none"` **and** `outlineWidth !== "0px"` **and** the outline colour is not transparent. Run it in both themes. This is the check that actually proves AC4 of T-105.
5. Keep `:focus-visible` (not `:focus`), so mouse users do not see rings on click, and respect `prefers-reduced-motion` for any transition on the ring.

Blast radius: CSS + one CodeMirror rule + one e2e section. No behaviour change, no dependency, no network.

## 6. Related defect: copy success is reported even when copying failed

Not a focus issue, recorded here because it is the same class of "the UI asserts something it did not verify".

`copyText()` in `src/lib/clipboard.ts:1` returns `Promise<boolean>`. `copySanitized()` in `src/tools/debug/DebugReportApp.tsx:116` does `await copyText(report.sanitized); toast("Copied sanitized input");` and **discards the boolean**. If both the async clipboard and the legacy `execCommand` path fail, the user is told it succeeded. For the product's core action — "copy this safe report into your ticket" — a false success is the worst possible failure mode.

UX_SPEC §5 already specifies the correct behaviour for the shared `CopyButton`: toast "Copied" / "Copy failed — select and copy manually". Belongs to **T-108**'s `CopyButton` work. Acceptance should include a test that makes the clipboard reject and asserts the failure toast, not just the happy path.

## Status update — CP1 review: repaired

Re-counted against the tree: **16** outline-removal sites, **9** with no replacement (not 17/10 — the T-107 palette rewrite removed one).

The repair is a global `:focus-visible` rule plus removal of every `outline-none`, with two inset exceptions because a positive offset is clipped inside panes: `textarea:focus-visible` and the CodeMirror frame ring both use `outline-offset: -2px`.

Regression tests: 8 checks covering four real controls in both themes, asserting `:focus-visible`, a non-transparent 2px outline, and a non-positive offset for edge-to-edge controls. Verified visually (`test-results/cp1/focus-json-light.jpg`, `focus-debug-dark.jpg`).

`R-CP1-focus` may be closed after Opus confirms; the implementer must not delete the reviewer-owned row.

## Status update — the "repaired" claim above was overstated

The CP1 review pass fixed the plain-input cases but not the editor, and an adversarial
re-verification found two further defects that this finding had missed:

1. **The CodeMirror frame ring painted three edges, not four.** `outline-offset: -2px`
   made it computationally valid, but the sticky, opaque `.cm-gutters` overpaints the
   left edge: measured accent-pixel coverage **0/125** on the left in both themes versus
   125/125 on the right. A computed-style assertion cannot see this. Fixed in **T-111**
   with a non-interactive `::after` border at `z-index: 300`; the suite now decodes
   screenshot pixels and requires ≥90% coverage on all four edges, and ~0% when unfocused.
2. **UX_SPEC §9 "no keyboard traps" was violated by every editor.** `@uiw/react-codemirror`
   defaults `indentWithTab` to true, so Tab/Shift-Tab were bound to indent and focus could
   not leave the editor. Escape does not blur either. Fixed in **T-110** by passing
   `indentWithTab={false}` in the single shared wrapper, restoring CodeMirror's own default.
   Regression tests press real keys and assert `document.activeElement` lands on the
   DOM-order neighbour, on two editor surfaces.

Residual `outline-none` sites after both repairs: **1** — the deliberate `.cm-content`
suppression in `src/lib/cmTheme.ts`, justified only because the frame ring it delegates to
is now verified complete.

`R-CP1-focus` stays open for the reviewer to close; the implementer will not delete it.
