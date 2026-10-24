# Dev Tools Hub V3: UX and visual design spec

Version 1.0 (2026-10-22), by Claude Opus. **Visual reference:** open `docs/v3/design/reference.html` in a browser. It is the source of truth for look and feel; this document is the source of truth for behaviour and exact values. If they disagree, this document wins.

**Design intent, in one line: calm, dense, precise, trustworthy.** It should feel like Linear, Raycast or Vercel's dashboard: quiet surfaces, one accent colour, strong typography and keyboard-first. It should not look like an ad-filled formatter site or a generic AI dashboard. No gradients on surfaces, no glassmorphism, no emoji in UI and no stock illustrations.

---

## 1. What we keep, fix and add (from reviewing V1)

- **Keep:**
  - violet accent and dark aesthetic;
  - ⌘K palette;
  - "Processed locally" trust badge;
  - two-pane input/output layout;
  - sample buttons;
  - toasts;
  - CodeMirror editors;
  - finding cards with evidence.
- **Fix:**
  - top tabs that won't scale;
  - empty right pane with nothing useful in it;
  - no home page;
  - no light theme;
  - no page-level explanation;
  - low-contrast faint text (`#5c5c6a` = 3.0:1 on canvas, fails WCAG);
  - no way to find a tool except through the palette.
- **Add:**
  - sidebar with categories;
  - home page with "Paste anything";
  - per-tool page frame (title, privacy line, docs below the fold);
  - light/dark/system theme;
  - privacy proof popover;
  - recent tools;
  - consistent empty, loading and error states.

---

## 2. Design tokens (exact; checked against WCAG 2.2 AA)

Colours are CSS variables holding RGB triplets (for example `--c-canvas: 11 11 15;`). Contrast ratios were computed on 2026-10-22.

| Token | Light | Dark | Use | Contrast notes |
|---|---|---|---|---|
| `canvas` | `#FAFAFB` | `#0B0B0F` | page background | — |
| `surface` | `#FFFFFF` | `#121218` | panes, cards | — |
| `raised` | `#F3F3F6` | `#1A1A22` | toolbars, inputs, hover rows | — |
| `border` | `#E4E4E9` | `#2A2A35` | dividers, control borders | — |
| `border-subtle` | `#EEEEF2` | `#1F1F28` | inner dividers | — |
| `ink` | `#17171E` | `#EDEDF2` | primary text | ≥ 14.8:1 |
| `ink-dim` | `#52525E` | `#A1A1B0` | secondary text | ≥ 6.8:1 |
| `ink-faint` | `#6E6E7C` | `#82828F` | hints, placeholders, metadata | ≥ 4.5:1 on every surface |
| `accent` | `#5646D8` | `#8B7CF8` | links, active nav, focus ring, accent text | ≥ 5.2:1 |
| `accent-strong` | `#5646D8` | `#6352E8` | **primary button background** (white text) | 6.4:1 / 5.4:1 |
| `accent-soft` | accent at 10% alpha | accent at 16% alpha | active nav background, selected chips (Tailwind `bg-accent-soft`) | — |
| `on-accent` | `#FFFFFF` | `#FFFFFF` | text on `accent-strong` (Tailwind `text-on-accent`) | see `accent-strong` |
| `syn-prop` / `syn-type` | `#0369A1` | `#7DD3FC` | editor: property and type names | ≥ 5.3:1 |
| `syn-string` | `#4D7C0F` | `#A3E635` | editor: strings | ≥ 4.5:1 |
| `syn-number` | `#B45309` | `#FBBF24` | editor: numbers | ≥ 4.5:1 |
| `syn-bool` | `#BE185D` | `#F472B6` | editor: true/false/null | ≥ 5.4:1 |
| `syn-keyword` | `#6D28D9` | `#C4B5FD` | editor: keywords | ≥ 6.4:1 |
| `syn-typedef` | `#1D4ED8` | `#93C5FD` | editor: type definitions | ≥ 6.0:1 |
| `ok` | `#047857` | `#34D399` | success | ≥ 4.9:1 |
| `warn` | `#B45309` | `#FBBF24` | warnings, "Not verified" | ≥ 4.5:1 |
| `err` | `#C62828` | `#F87171` | errors, high severity | ≥ 5.0:1 |
| `info` | `#1D4ED8` | `#60A5FA` | info | ≥ 6.0:1 |

**Typography:**
- Sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Mono: `ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace`.
- No web fonts (zero extra requests, instant render).

| Style | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 36/44 (mobile 28/36) | 650 | home hero only |
| `h1` | 22/30 | 600 | tool title |
| `h2` | 16/24 | 600 | section titles, docs headings |
| `body` | 14/22 | 400 | default |
| `small` | 13/20 | 400 | toolbar labels, descriptions |
| `micro` | 12/16 | 500 | badges, kbd, metadata |
| `code` | 13/20 mono | 400 | editors, evidence |

- Letter-spacing −0.01em on `display` and `h1`, 0 elsewhere.

**Space and shape:**
- Spacing on a 4 px grid: 4, 8, 12, 16, 20, 24, 32, 48, 64.
- Radius: 6 px (controls, chips), 10 px (panes, cards, popovers), 14 px (home detect box).
- Borders are 1 px `border`. Shadows only on overlays (palette, popover, toast):
  - light: `0 12px 32px -12px rgb(23 23 30 / 0.18)`;
  - dark: `0 16px 40px -12px rgb(0 0 0 / 0.6)`.
- Control height 32 px (toolbar), 36 px (primary actions), 44 px minimum touch target on mobile (padding may extend the hit area).

**Focus:**
- `outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px;` on `:focus-visible` for every interactive element.
- Never remove an outline without replacing it.

**Motion:**
- 120–160 ms ease-out for fades and small slides; no bouncing.
- Respect `prefers-reduced-motion: reduce` by disabling transforms and animations.

---

## 3. Layout and information architecture

### 3.1 Desktop (≥ 1024 px)

```
┌─────────────┬──────────────────────────────────────────────────────────────┐
│ ◆ Dev Tools │  [ Search tools…  ⌘K ]                    🛡 Private · ☀/☾ · GitHub │  ← TopBar 52px
│   Hub       ├──────────────────────────────────────────────────────────────┤
│             │  Debug & share › Debug Report                                 │  ← breadcrumb (small, ink-faint)
│ ⌂ Home      │  Debug Report                              [Load sample ▾]    │  ← h1 + primary actions
│ ★ Recent    │  Paste a failing request, HAR or log — get the likely cause   │  ← description (ink-dim)
│             │  and a redacted report you can share.  ● Runs locally          │  ← privacy line
│ DEBUG&SHARE │ ┌───────────────────────────┐ ┌───────────────────────────┐ │
│  Debug Rep. │ │ INPUT pane                 │ │ OUTPUT pane (tabs)         │ │  ← workspace, fills height
│  Secret Sc. │ │                            │ │                            │ │     (min 520px)
│ DATA        │ └───────────────────────────┘ └───────────────────────────┘ │
│  JSON …     │  How to use · Examples · FAQ · Related tools  (scroll)        │  ← docs block below the fold
│ …           │                                                              │
│ ─────────── │                                                              │
│ ⌘K Commands │                                                              │
│ v3.0 · MIT  │                                                              │
└─────────────┴──────────────────────────────────────────────────────────────┘
```

- **Sidebar.** 248 px wide; it collapses to a 56 px icon rail when you press `[` or the collapse button.
  - Sections are `CATEGORY_ORDER`. Headers are `micro` uppercase, `ink-faint`, with 0.06em tracking.
  - Item: 32 px high, icon 16 + label `small`. The active item gets `accent-soft` background, `accent` text and a 2 px accent bar on the left.
  - A "New" badge shows for `status: "new"`. The sidebar scrolls independently.
- **TopBar.** It holds:
  - the search field, a button that opens the palette, showing "Search tools…" and a `⌘K` / `Ctrl K` kbd;
  - on the right: the privacy pill (a button with visible text "● Processed locally"; it opens a popover), the theme toggle (system → light → dark cycle, with a tooltip naming the current mode) and a GitHub icon link.
- **Page scroll.**
  - The tool page scrolls as a whole; the workspace keeps a fixed height of `max(520px, 100vh − 220px)`.
  - The editors scroll internally.
  - The docs block sits below the workspace.

### 3.2 Tablet (768–1023 px)

- The sidebar becomes the 56 px icon rail by default.
- The panes stay side by side once the content area is 720 px or wider; otherwise they stack.

### 3.3 Mobile (< 768 px)

- **Sidebar:** becomes a full-height drawer opened from a ☰ button in the TopBar.
- **TopBar:** shows ☰, the logo mark, a search icon and the privacy dot.
- **Panes:** stack in the order input then output.
- **Output tabs:** scroll horizontally.
- **Sticky action bar:** primary actions sit in a bar at the bottom (Analyze / Copy / Share).
- **Hover:** no hover-only affordances.
- **Overflow:** zero horizontal page overflow at 360 px. The e2e suite checks this at 360 and 390 px.

### 3.4 URL map

- `/`: home
- `/<slug>/`: tools
- `/privacy/`: how to verify our privacy claims
- `/about/`: what this is, who made it, open source, changelog
- `/cli/`: CLI and MCP docs (Phase 4)
- `/404.html`

---

## 4. Pages

### 4.1 Home (`/`)

1. **Hero** (centred, max-width 760):
   - **Headline:** `display` "Developer tools that never see your data."
   - **Subhead:** `body`, `ink-dim`: "Format, convert, decode and debug — everything runs in your browser. Paste a failing request or log and get a redacted report you can safely share."
2. **Paste-anything box:**
   - 14 px radius, `surface`, 1 px border, 160 px tall mono textarea.
   - Placeholder: "Paste anything — JSON, a JWT, a cURL command, a HAR file, a log, a cron expression…"
   - On input (debounced 150 ms), `detectInput(text)` from `src/core/detect` shows up to 3 **suggestion chips** under the box: "Looks like a JWT → **Open in JWT Decoder**".
   - Clicking a chip navigates to the tool **with the pasted text handed over in memory** (an `initialInput` held in a module-level hand-off store, never in the URL or storage).
   - If the redactor finds secrets, a `warn` line appears: "⚠ Contains 2 likely secrets (JWT, password). Use **Debug Report** to share it safely."
   - The box never sends anything.
3. **Continue** row: up to 4 recent tools as small cards. Hidden when there are none.
4. **All tools:** one grid per category in `CATEGORY_ORDER`.
   - Category title `h2` plus a count.
   - Cards: 3 columns at ≥ 1280 px, 2 at ≥ 768 px, 1 on mobile.
   - Card: icon 20 in a 32 px `raised` square, `navTitle` (14/600), and a single line of `description` truncated with an ellipsis.
   - The whole card is a link. Hover: border becomes `accent` at 40% alpha (no lift).
5. **Trust strip** (3 columns):
   - "No uploads": the browser blocks every connection (`connect-src 'none'`). Links to `/privacy/`.
   - "Open source": MIT on GitHub. Links to the repo.
   - "Keyboard-first": ⌘K for everything.
6. **Footer:** © year, MIT, GitHub, Privacy, About, and a "Report a vulnerability" link to SECURITY.md on GitHub.

### 4.2 Tool page frame (`ToolLayout`)

- Header: breadcrumb (category › title), H1 `title`, a `description` paragraph, then the privacy line "● Runs locally — nothing you paste leaves this tab." `ok` dot, `small` `ink-dim`.
- The right side of the header holds the tool's primary actions (passed as a prop).
- **Workspace:** `children`. Tools use the shared `Pane` component:
  - pane header 40 px with title (`small`, 600) and actions;
  - body below.
- **Docs block** (from `docs`):
  - "How to use" (numbered list);
  - "FAQ" (`<details>` accordions, closed by default);
  - "Related tools" (cards).
  - Max width 760, `body` text.
- **Pane empty state:**
  - centred icon 20 in `ink-faint`;
  - one-line title (14/600);
  - a one-line hint (`small`, `ink-dim`);
  - up to 3 sample chips.

  Never leave a pane blank.

### 4.3 Debug Report (flagship): V3 behaviour

- **Input pane.** Toolbar: Load sample ▾, Open file, Clear, then two toggles "Redact emails" and "Redact IPs" (checkbox style, not pill buttons), then "Policy…" (P3).
- **Input modes.** A segmented control: **Single** (default) or **Compare** (P3: two stacked editors, "Working request" and "Failing request").
- **Output tabs:**
  - **Findings:** severity groups High → Info.
  - **Sanitized:** a read-only editor plus a redaction ledger on the right. Clicking a ledger row highlights its occurrences.
  - **Review:** P3. A side-by-side diff of original vs sanitized. The original side is visible only in this tab, in memory, behind a "Show original" toggle that is **off by default**.
  - **Share:** format radio (AI chat / GitHub issue / Support ticket / Agent / JSON), a preview, and Copy / Download buttons.
- **Finding card:**
  - left 3 px severity bar (err / warn / info / ink-faint);
  - title (14/600);
  - **trust badge**:
    - `DETECTED`: solid `raised` chip with an `ok` dot, text "Detected";
    - `NOT_VERIFIED`: dashed `warn` border chip, text "Not verified";
  - "Why" and "What to do" paragraphs;
  - evidence in a mono block;
  - an optional "Learn more" link (MDN/RFC, which opens a new tab with `rel="noopener noreferrer"`).
- **Future AI suggestions** (deferred) must render in a separate section titled "AI suggestion — check before trusting", with an `info` dashed border. **Never mix them into the deterministic findings list.**

### 4.4 Privacy page (`/privacy/`)

A plain article:
1. What runs where.
2. The CSP text.
3. How to verify it yourself: open DevTools → Network, paste anything, and see only same-origin `/assets/` files.
4. Counters: what is counted and what is not.
5. What we can't promise: redaction can miss unusual secrets.
6. Source code link.

### 4.5 404

The H1 "Page not found" and a link home, with the search field that opens the palette.

---

## 5. Component inventory (`src/components/`)

| Component | Props (essentials) | Notes |
|---|---|---|
| `Button` | `variant: "primary"\|"secondary"\|"ghost"\|"danger"`, `size: "sm"\|"md"`, `icon?`, `kbd?`, `loading?` | primary = `accent-strong` bg + white; secondary = `raised` + border; ghost = transparent; 32/36 px |
| `IconButton` | `label` (required, used as aria-label and tooltip), `icon` | 32×32 |
| `Toggle` | `checked`, `onChange`, `label` | checkbox semantics (`role="switch"`) |
| `Segmented` | `options`, `value`, `onChange` | radiogroup semantics |
| `Tabs` | `tabs: {id,label,count?}[]`, `value` | `role=tablist`, arrow-key navigation |
| `Pane` | `title`, `actions?`, `children`, `footer?` | 10 px radius, `surface` |
| `CodeArea` | wraps the existing CodeMirror config; `value`, `onChange?`, `readOnly?`, `language?` | uses token-based theme |
| `CopyButton` | `getText: () => string`, `label?` | toast "Copied" / "Copy failed — select and copy manually" |
| `DownloadButton` | `filename`, `getBlob` | Blob + object URL, revoked after click |
| `EmptyState` | `icon`, `title`, `hint`, `samples?` | |
| `Badge` | `tone: "neutral"\|"ok"\|"warn"\|"err"\|"info"\|"accent"`, `dashed?` | micro text |
| `Kbd` | `keys: string[]` | shows ⌘ on Mac, Ctrl elsewhere |
| `Tooltip` | `label` | on hover and focus, 400 ms delay, never the only carrier of information |
| `Popover` | `trigger`, `children` | Esc closes, focus is trapped while open |
| `ToastHost` | existing | keep |
| `CommandPalette` | upgraded (§6) | |
| `ErrorBoundary` | per tool | shows "This tool hit an error. Your input is still here." + "Reset tool" |

---

## 6. Command palette v2

- **Open:** ⌘K / Ctrl K anywhere, `/` when focus is not in an editable field, or the TopBar search button.
- **Contents:**
  - **Recent tools** (when the query is empty);
  - **Tools** (fuzzy match on title, navTitle, keywords and category);
  - **Actions in this tool** (from `ToolHandle.getCommands()`);
  - **General:** Toggle theme, Collapse sidebar, Go to home, Privacy.
- **Fuzzy scoring** in pure function `src/core/search/fuzzy.ts` (unit-tested):
  - exact prefix > word prefix > subsequence;
  - ties broken by recent use, then registry order.
- **Keyboard:** ↑/↓ move, Enter runs, Esc closes. Results show the category as right-aligned `micro` text.
- **Accessibility:** `role="dialog"` with `aria-modal`, the list `role="listbox"`, `aria-activedescendant`.

---

## 7. Global keyboard shortcuts

| Keys | Action |
|---|---|
| ⌘K / Ctrl K | palette |
| `/` | palette (outside text fields) |
| `[` | collapse/expand sidebar (outside text fields) |
| ⌘⏎ / Ctrl Enter | the tool's primary action (Analyze / Convert / Format) when the tool defines one |
| ⌘⇧C / Ctrl Shift C | copy the primary output (when defined) |
| Esc | close palette / popover / drawer |

All shortcuts are listed in the palette and on `/about/`.

---

## 8. States and copy rules

- **Loading.** A lazy tool chunk shows a pane-shaped skeleton. Long work (> 300 ms) shows a spinner in the action button plus the text "Working…". There is no full-page loader.
- **Errors in input.** Show an inline message in the pane footer: `err` icon + "Line 3, column 12: unexpected comma". If possible, the editor highlights the line. Never use `alert()`.
- **Success.** Results appear without animation. Copy actions show a toast.
- **Copy rules:**
  - say what happened and what to do next;
  - do not blame the user;
  - sentence case;
  - no exclamation marks;
  - no "Oops";
  - numbers use thousands separators.

---

## 9. Accessibility checklist (WCAG 2.2 AA)

- Contrast is as shown in the §2 table. Never put `ink-faint` text on `accent-soft`.
- Everything is operable by keyboard; the focus order follows the visual order; no keyboard traps outside modals.
- Landmarks: `<nav aria-label="Tools">` (sidebar), `<header>`, `<main>`, `<footer>`. One `<h1>` per page.
- Forms: every input has a `<label>` (visible or `sr-only`).
- Live regions: result counts and error messages use `aria-live="polite"`.
- Respect reduced motion. Target sizes are at least 24×24 px (and 44 px on mobile primary actions).
- axe-core reports zero serious or critical violations on every page in both themes (checked in e2e, T-109).

---

## 10. Per-tool layout patterns (use these, don't invent)

| Pattern | Used by | Layout |
|---|---|---|
| **Convert** | YAML⇄JSON, CSV⇄JSON, TOML⇄JSON, XML, case, escape, base converters | Two panes: input (left) / output (right). A direction switch ⇄ sits in the input pane header. Live conversion (debounced). Output toolbar: Copy, Download |
| **Inspect** | JWT, URL parser, cron, HTTP status, color, subnet | Input on top (single line or small editor), structured result cards below |
| **Generate** | UUID, password, hash, HMAC, QR, lorem | Options panel (left, 320 px) + result (right) with Regenerate and Copy |
| **Compare** | Text diff, request compare | Two inputs (side by side, stacked on mobile), diff result below with inline/side-by-side toggle |
| **Analyze** | Debug Report, secret scanner, regex | Input left, tabbed analysis right |
