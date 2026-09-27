# Signal — Design Notes

`competitor_intel.html` is Signal, a single-file, offline-first web app for YouTube competitor intelligence. This version redesigns the whole interface around Apple's Human Interface Guidelines (HIG). **Every feature, view, shortcut, export and storage guarantee of the previous version is unchanged.** Only the UI and UX changed.

It is a **desktop web app**. Nothing in it targets phones or tablets. The only layout adaptation is the one the previous version already had: in a browser window narrower than 980px, the sidebar slides over the content.

---

## 1. What stayed exactly the same

The data and logic layer carried over line for line. The new UI calls the same functions through the same `data-*` hooks.

| Area | Status |
|---|---|
| All 15 views (Dashboard, Competitor Feed, Calendar, Swipe File, Outlier Radar, Momentum, Opportunities, Thumbnail Board, Trending, Compare Channels, Channels, Analytics, Comment Mining, Export & Briefing, Settings) | Same ids, same order, same content |
| Storage engine (verified localStorage writes, IndexedDB mirror, 12-revision recovery ring, cross-tab sync, reconcile/repair) | Untouched |
| Sync engine (incremental and deep sync, backfill to depth, daily snapshots, profile-bound syncs, quota accounting) | Untouched |
| Analytics (outlier baselines, momentum, breakout score, 30-day projection, topics, title anatomy, n-grams, calendar insights, quiet channels) | Untouched |
| Profiles, swipe file, categories, notes, swipe packs, drafts with Save/Discard | Untouched |
| Every export: CSV, JSON, TXT, MD, ZIP, full backup, AI briefing packs | Same file names and contents |
| Every keyboard shortcut: `S D R F T C W K ⇧K A / ? [ ] 1–9 0 ↑ ↓ Esc` | Same bindings |

An automated audit compares the two files. No `data-act` action, `data-*` hook, export (kind × format), top-level function or view id was lost. 24 functions were added and none were removed.

---

## 2. Apple's design principles and how each one is applied

Apple's HIG names eight foundational principles. Each one is listed below with the changes it drove.

### Purpose — *make something meaningful*
- Content leads. KPI tiles, charts and thumbnails get the visual weight. Chrome recedes into translucent material.
- Views are distinguished by purpose-specific icons. Before, Momentum and Opportunities shared one icon, and so did Analytics and Compare. Now each has its own: gauge, light bulb, bar chart and split view.

### Agency — *let people do things their own way*
- **Help people recover from mistakes.** Un-starring a video used to delete it, with its note and category, and there was no way back. The toast now has an **Undo** that restores the entry at its original position with its note and category intact. "Unstar all" on a selection can be undone the same way.
- **Freedom to explore.** The ⌘K command palette reaches every view, action, channel, profile, date range, appearance setting and cached video from one field. Nothing is locked into a flow.
- **Stay out of the way.** The sidebar can be hidden (⌘\\, or the sidebar button) and stays hidden across reloads. A reload also returns you to the view you were on.

### Responsibility — *act in people's best interest*
- The browser's `confirm()` and `prompt()` are replaced by HIG alerts. Each alert has a specific title, a one-line consequence and a verb on the button ("Delete Profile", "Trim Now", "Wipe Data"). Destructive buttons are red. Destructive alerts put focus on **Cancel**, so pressing Return is always the safe choice. Alerts never close on a stray backdrop click.
- Storage health, recovery points and "Scan & repair" are still shown openly in Settings.

### Familiarity — *build on what people know*
- The layout is the standard macOS shape: a sidebar source list, a toolbar with a large title, segmented controls, pop-up buttons, pull-down menus, toggle switches, sheets and alerts.
- Date ranges read like the Apple Stocks range picker: `24H 3D 7D 30D 3M 6M 1Y All`.
- The command palette behaves like Spotlight: type, use ↑↓ to move, Return to open.
- Consistency: one menu material, one focus ring, one control height and one corner-radius scale across the whole app.

### Flexibility — *adapt to diverse contexts and needs*
- **Appearance: Light, Dark or Auto.** Auto follows the system setting live. The theme is painted before the first frame, so there is no flash of the wrong theme.
- **Text size S / M / L / XL** scales the entire type ramp from one multiplier, the web equivalent of Dynamic Type. Previously it only changed some text.
- The system's **Increase Contrast**, **Reduce Motion** and **Reduce Transparency** settings are each honoured.
- Keyboard: every control is reachable. Sortable headers and channel cards respond to Return and Space. Sheets trap Tab and return focus to whatever opened them.

### Simplicity — *be clear and direct*
- Rows of four or five export-format buttons (CSV · JSON · TXT · MD · All) on every header were replaced by a single **Export** pull-down. The same formats are still one click further in.
- Swipe-pack save, save-shown and import were grouped into one **Swipe pack** menu.
- Emoji tab labels were replaced by SF-style symbols. All-caps micro-labels became sentence-case section titles.

### Craft — *care about every detail*
- Every number in the system is taken from the HIG or traceable to it (see §3).
- Tabular numerals are used in all metric columns. Big numbers use SF Pro Rounded, as Apple's Health and Fitness apps do. Tracking tightens on display sizes.
- Bugs fixed along the way:
  - On Settings, clicking **Save** or **Discard** while the text box was focused rebuilt the button during blur, so the first click was lost. It now repaints only when the markup changes.
  - KPI values no longer sit at different heights when one label wraps.
  - Tile grids no longer leave a single orphan tile (6 tiles lay out as 6 or 3 + 3; 8 as 8 or 4 + 4).
  - The selection bar now centres on the content column instead of sliding under the sidebar.
  - A `.divider` element referenced by the code but never styled now has a style.

### Delight — *make it human*
- Motion comes from springs that settle rather than linear tweens: toggles snap, sheets pop in, toasts rise, and each view change has one short entrance. All of it drops to near-zero under Reduce Motion.
- The toolbar is clear at rest and turns into glass once content scrolls under it, the scroll-edge behaviour of every Apple navigation bar.
- Today's date on the calendar is red, as in Apple Calendar.

---

## 3. Specifications

### 3.1 Typography

**Source: HIG › Typography, Accessibility.**

| HIG requirement | Value from the HIG | Applied in Signal |
|---|---|---|
| Default text size, macOS | 13 pt | Body `13px` |
| Minimum text size | macOS 10 pt, iOS 11 pt | Floor of `11px` for all text at the default size |
| Avoid light weights | "prefer Regular, Medium, Semibold, Bold; avoid Ultralight, Thin, Light" | Weights 400 / 500 / 600 / 700 only (the old 800 is gone) |
| Minimise typefaces | — | One family (SF Pro via the system stack) plus SF Pro Rounded for big numbers and SF Mono for code |
| Keep hierarchy when size changes | — | One `--ts` multiplier scales every step together |

macOS built-in text styles (HIG table) and the Signal type ramp:

| macOS style | pt | Signal token | px at M |
|---|---|---|---|
| Large Title | 26 | `--f-2xl` / KPI numbers `--f-num` | 28 / 26 |
| Title 1 | 22 | `--f-xl` (page title, sheet hero) | 22 |
| Title 2 | 17 | `--f-lg` (brand, palette input) | 17 |
| Title 3 | 15 | `--f-md` (panel and sheet headers) | 15 |
| Headline / Body | 13 | `--f-sm` (body, tables, nav) | 13 |
| Callout / Subheadline | 12 / 11 | `--f-xs` (secondary text, chips) | 12 |
| Footnote / Captions | 10 | `--f-2xs` (metadata; raised to the 11px floor) | 11 |

Text size S / M / L / XL = ×0.92 / ×1 / ×1.10 / ×1.22 on every step. At S the smallest text is 10.1px, which is the macOS minimum.

**Measured result.** The same headless-browser check was run on both versions: the old version rendered 22–244 text elements below 10.5px on each view, and this version renders none.

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text"…`, then Segoe UI Variable, Inter and Roboto as fallbacks. There is no webfont download, so the file still works offline.

### 3.2 Colour and contrast

**Source: HIG › Color, Accessibility.** WCAG AA minimums: **4.5:1** for text up to 17pt, **3:1** for text 18pt and larger or bold, and 3:1 for UI glyphs.

The palette uses Apple system colours. Where a colour carries text, the HIG's *accessible* variant is used.

| Role | Light | Dark | Apple source |
|---|---|---|---|
| Canvas | `#f5f5f7` | `#000000` | apple.com / systemBackground |
| Card | `#ffffff` | `#1c1c1e` | secondarySystemGroupedBackground |
| Well | `#f2f2f7` | `#2c2c2e` | systemGray6 / tertiarySystemBackground |
| Label → quaternary | `#1d1d1f` `#333336` `#515154` `#6e6e73` | `#f5f5f7` `#e5e5ea` `#aeaeb2` `#98989d` | label / secondaryLabel family |
| Tint (text, icons) | `#0066cc` | `#409cff` | systemBlue, accessible |
| Filled button | `#0071e3` | `#0071e3` | apple.com action blue |
| Green / Orange / Red text | `#1a7f37` `#c93400` `#d70015` | `#30d158` `#ff9f0a` `#ff6961` | system + accessible variants |
| Switch "on" | `#34c759` | `#30d158` | systemGreen (iOS switch) |
| Favourite star | `#d17a00` | `#ffd60a` | systemOrange / systemYellow |

Measured contrast ratios (computed with the WCAG relative-luminance formula; every text pair passes AA):

| Pair | Light | Dark |
|---|---|---|
| Primary text on card | 16.83 | 15.63 |
| Secondary text on card | 7.91 | 7.69 |
| Tertiary text on card | 5.07 | 5.93 |
| Tertiary text on canvas | 4.66 | 7.31 |
| Tint text on card | 5.57 | 6.01 |
| Badge text on its own tint (blue / green / orange / red) | 4.86 / 4.58 / 4.75 / 4.63 | 4.89 / 6.36 / 6.22 / 5.03 |
| White on filled button | 4.70 | 4.70 |
| Day number on the darkest calendar tile | 5.26 | 4.93 |
| Star glyph on card (non-text, needs 3:1) | 3.23 | 12.05 |

The previous version used light-mode badges with pale pastel text (for example `#4ade80` green on white), which fell far below these minimums.

**Increase Contrast** (`prefers-contrast: more`) darkens separators and every secondary label step.

The HIG also says to convey information with more than colour alone. Trends therefore carry ▲/▼ as well as green/red, and switches show the knob position as well as the colour.

### 3.3 Controls and spacing

**Source: HIG › Accessibility › Mobility (control sizes); macOS control sizes.**

| HIG value | Signal |
|---|---|
| macOS default control size 28×28 pt, minimum 20×20 | Regular controls 30px, small 26px; row actions 22–26px; compact density 28/24px |
| About 12 pt of padding around bezelled elements | 8–12px gaps between buttons, 16px card padding |
| About 24 pt around elements without a bezel | 20px page gutters; list rows have hairline separators and 10–12px cell padding |

Spacing follows a 4-pt grid. Corner radii are concentric: 6 / 8 / 10 / 14 / 18 / 24 and capsule. Buttons, segmented controls, chips and search fields are capsules, as in macOS 26.

### 3.4 Materials — Liquid Glass

**Source: HIG › Materials; Liquid Glass (2025).** Glass belongs to the navigation layer, never to content.

- **Glass:** the sidebar, the toolbar (once scrolled), menus and popovers, the ⌘K palette, the selection bar, toasts and alerts. Each uses `backdrop-filter: blur(30–50px) saturate(190%)` with a specular top highlight.
- **Opaque:** cards, tables, thumbnails and sheets, which is where the data lives.
- A faint ambient light behind the canvas gives the glass something to refract. It sits on its own fixed layer, so scrolling never repaints it.
- **Reduce Transparency** replaces every glass surface with an opaque one.
- The blur is drawn on a `::before` pseudo-element. If it were on the element itself, `backdrop-filter` would make that element the containing block for fixed-position menus and misplace them.

### 3.5 Motion

**Source: HIG › Motion; Accessibility › Reduce Motion.**

| Motion | Timing |
|---|---|
| Easing | `cubic-bezier(.22,.9,.3,1)`, a fast-out settle |
| Springs | `cubic-bezier(.32,1.28,.52,1)`, a gentle overshoot for switches, sheets and toasts |
| Duration | 120–340ms; the view entrance is 300ms |

- Animations use only `transform` and `opacity`, which run on the compositor and never cause layout.
- **Reduce Motion:** animations and transitions drop to near zero, hover lifts and zooms are removed, and the spinner slows down, following HIG guidance on tightening springs and replacing motion.

### 3.6 Components

| Component | HIG pattern | Notes |
|---|---|---|
| Sidebar | macOS source list | Tinted SF-style symbols, capsule selection, trailing counts, section headers in sentence case |
| Toolbar | Large-title navigation bar | Scroll-edge glass, a single primary action |
| Range picker | Segmented control | Stocks-style short labels; full names in tooltips and aria-labels |
| Channel picker | Pop-up button and menu | Adds a live filter field for long channel lists |
| Export | Pull-down button | Keyboard support: ↑ ↓ Home End Esc |
| Sheets | Modal sheet | `role="dialog"`, focus trap, focus returned on close, Esc to close |
| Alerts | Alert | Specific verbs, red destructive buttons, Return = default, Esc = cancel |
| Toggles | Switch | Real `<button role="switch">` elements; they used to be `<div>`s you could not reach from the keyboard |
| Toasts | Notification-style banner | Live region for VoiceOver, pause while hovered (the HIG asks to minimise time-boxed UI), close button, optional Undo |
| ⌘K palette | Spotlight | Groups: Go to, Actions, Channels, Videos (live title search), Swipe file, View, Date range, Profiles, Appearance |

### 3.7 Icon

**Source: HIG › App icons.** The icon is a single simple glyph (the rising signal line) on a layered blue-to-indigo gradient, with no text and a shape made of simple forms. The same mark is used for the favicon and the sidebar.

---

## 4. Additions (all optional; none replaces an existing path)

- ⌘K / Ctrl K command palette
- ⌘\ / Ctrl \ to hide or show the sidebar; the state persists
- Appearance: Light / Dark / Auto (Settings → Appearance, the sidebar button, or the palette)
- Undo for removing starred videos
- Profile rename with a colour picker, replacing blind colour cycling
- A filter field inside the channel picker
- Reload returns you to the same view
- The keyboard shortcut sheet is reachable from a button in the sidebar footer

---

## 5. Verification

Automated with Playwright and Chromium against a seeded profile (6 channels, 660 videos, snapshots, trending, comments, swipe file). The harness is in `tests/`.

| Check | Result |
|---|---|
| JS errors across all 15 views: dark and light at 1440×900, 1280×800, and a 900px narrow window | 0 |
| Page-level horizontal overflow | none |
| Elements poking outside their panels | 0 |
| Text rendered under 10.5px | 0 (the previous version had 22–244 per view) |
| Sidebar fits all 15 views without scrolling (900px and 800px tall) | yes |
| Render time per view switch | 5–25ms |
| Interaction suite (palette, shortcuts, export menus + downloads, undo, alerts, rename + recolour, picker filter, sheets + focus return, selection bar, sort by keyboard, theme, sidebar persistence, drafts) | 40 / 40 |
| Feature suite (channel teardown and its export, opportunity tabs, calendar drill-down / metric / window / "open this day everywhere", feed thumbnails, board size / sort / star page / paging, swipe views / K cycling / compare / pack export / notes, trending search, briefing packs, export hub, comment mining, storage scan, recovery points, clipboard fallback, channel paste undo, shortcut sheet, profile switch) | 31 / 31 |

To run:

```bash
cd signal-competitor-intel
node tests/views.cjs desktop         # also: light | laptop | narrow
node tests/interactions.cjs
node tests/features.cjs
```

The scripts start their own static server and use Playwright. It is resolved from the project first and then from the global install.

---

## 6. Where things live in the file

| Section (search for the banner) | Contents |
|---|---|
| `SIGNAL — DESIGN SYSTEM` | Tokens for both appearances and the accessibility media queries |
| `MATERIALS` | Liquid Glass surfaces |
| `ICONS` | The single SF-style symbol set used by the chrome and the views |
| `UI KIT` | Menus, alerts, palette, appearance, sidebar, focus management and scroll-edge behaviour |
| everything else | The original app: storage, sync, analytics and views, in the same order as before |
