# Design System and UX Specification

| Field | Value |
|---|---|
| Version | 1.2 |
| Date | 2026-09-25 |
| Owns | Visual tokens, component behaviour, layout, interaction states, accessibility rules for every TabsPack surface |
| Implemented by | T-008 tokens, T-005 popup, T-108 and T-109 export UI, T-203 manager page, T-501 options, T-502 polish, T-506 accessibility |

Read this before writing a line of CSS or markup. A surface that does not follow it is a defect.

What is verified rather than asserted: `npm run smoke` drives the built
extension in a real Chromium and checks the popup's live counts, the primary
button label carrying the count, the segmented control responding to arrow keys
as a radio group, the report wording after an export, the disabled private
windows control carrying a visible reason, the import task's preview counts and
flags, the tree responding to arrow keys and space, the restore report, the
placeholder page carrying no links, and a 5000 tab pack previewing in about a
second with only a screenful of rows in the document. Computed styles for the
selected and unselected segment states were read from the running browser, not
eyeballed.

## 1. Design principles

1. **The popup is a launcher, not an application.** One primary action, reachable in one click with zero configuration. Anything that needs thought belongs on the manager page.
2. **Progressive disclosure.** Default path first, secondary controls next to it, everything else one click away. A first time user should not see a filter.
3. **Every action states its outcome.** Not "done", but "saved 37 tabs to tabspack-20260924-0930.tabspack.json". A count the user can check against reality is the whole trust model of this product.
4. **Nothing silent.** Filtered, skipped and deduplicated tabs are named in the report. A product about not losing tabs cannot be vague about tabs it dropped.
5. **Trust is a visible feature.** The offline, no account, no telemetry promise appears in the interface, not only in the store listing.
6. **Density with air.** This is a power tool used with 200 tabs open. Compact rows, but a 4 px grid and real breathing room, never a wall of controls.
7. **Accessible by construction.** Keyboard first, 4.5 to 1 contrast minimum, visible focus, live regions for outcomes, reduced motion respected. Retrofitting accessibility at T-506 should find nothing.
8. **No remote anything.** No web font, no icon CDN, no image host. System font stack and inline SVG only. This is a hard rule from NFR-006, and it also happens to make the UI instant.

## 2. Tokens

Defined once in `src/ui/shared/theme.css` as custom properties on `:root`, redefined under `@media (prefers-color-scheme: dark)` and again under `[data-theme="dark"]` so the M5 theme switch needs no new tokens. No component may hardcode a colour, radius, duration or font size.

### Table DS1: Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#16181c` | Page background |
| `--surface` | `#f7f8fa` | `#1e2127` | Recessed areas, inputs, code blocks |
| `--surface-raised` | `#ffffff` | `#24282f` | Cards on the manager page |
| `--border` | `#e3e5e8` | `#313640` | Hairlines and control borders |
| `--border-strong` | `#878d97` | `#767d8a` | A control's own border, hover borders, dividers that must read. At least 3 to 1 against every surface it sits on, because a border is often the only thing that marks a field: WCAG 1.4.11, checked by `npm run a11y` |
| `--text` | `#16181c` | `#e8eaed` | Primary text |
| `--text-muted` | `#5b616e` | `#9aa1ad` | Secondary text, both above 5 to 1 on their background |
| `--accent` | `#2563eb` | `#60a5fa` | Primary action, selected state, focus |
| `--accent-hover` | `#1d4ed8` | `#93c5fd` | Hover and active |
| `--accent-text` | `#ffffff` | `#0b1220` | Text on an accent fill |
| `--accent-soft` | `#eff4ff` | `#1e293b` | Selected segment background, subtle emphasis |
| `--success` | `#15803d` | `#4ade80` | Successful outcome |
| `--warn` | `#b45309` | `#fbbf24` | Something was dropped or skipped |
| `--danger` | `#b91c1c` | `#f87171` | Failure |
| `--focus` | `#2563eb` | `#93c5fd` | Focus ring, always 2 px with 2 px offset |

### Table DS2: Dimension and motion tokens

| Token | Value | Note |
|---|---|---|
| `--space-1` to `--space-6` | 4, 8, 12, 16, 24, 32 px | 4 px base grid, no other spacing values |
| `--radius-control` | 6 px | Buttons, inputs, selects |
| `--radius-card` | 10 px | Cards and panels |
| `--radius-pill` | 999 px | Segmented control, badges |
| `--font` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif` | System stack. No web font, ever |
| `--font-mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` | Output preview only |
| `--text-micro` to `--text-title` | 11, 12, 13, 14, 16, 20 px | Six sizes. Adding a seventh needs a reason |
| `--control-h` | 32 px | Dense control height. Primary action is 40 px |
| `--dur-fast` | 120 ms | Hover, press, colour change |
| `--dur-slow` | 200 ms | Panel reveal only |
| `--ease` | `cubic-bezier(0.2, 0, 0.2, 1)` | Single easing curve |

All motion sits inside `@media (prefers-reduced-motion: no-preference)`. With reduced motion, states change instantly.

## 3. Popup

360 px wide, height driven by content, never scrolls in the default state.

```
┌────────────────────────────────────────────┐
│ ▣  TabsPack                        [⚙]     │  40px  wordmark, settings
├────────────────────────────────────────────┤
│                                            │
│  2 windows · 37 tabs · 3 groups            │  12px muted, live
│                                            │
│  ┌──────────┬──────────────┬────────────┐  │
│  │ All      │ This window  │ Selection  │  │  segmented, 32px
│  └──────────┴──────────────┴────────────┘  │
│                                            │
│  ┌───────────────────────────┐ ┌────────┐  │
│  │      Export 37 tabs       │ │ Import │  │  primary 40px, secondary 40px
│  └───────────────────────────┘ └────────┘  │
│                                            │
│  Format [ TabsPack file      ▾ ]  [Copy]   │  32px controls
│                                            │
│  ✓ Saved 37 tabs to                        │  aria-live polite
│    tabspack-20260924-0930.tabspack.json    │
├────────────────────────────────────────────┤
│ Nothing leaves your device                 │  11px muted footer
└────────────────────────────────────────────┘
```

Decisions behind that layout:

- **Export and import sit in the same row.** They are the two reasons the popup is opened, so both are one click from the browser toolbar. Export takes the width, because it is the action that happens here; import is sized to its word, because it is a handoff. A popup cannot host a file picker at all, ADR-009, so import opens the manager page already on the import task with the file button focused. What the popup must never do is hide import behind an icon and let a first time user conclude the product only exports.
- **The gear is settings, and only settings.** An icon in that corner is read as settings before it is read as anything else, so it opens the options page rather than the manager. The manager is still one click away through import, and its tab list carries export and snapshots from there.
- **Segmented scope control rather than a split button.** The scope changes the primary button's label, so the user reads what will happen before clicking. A split button hides the second half of its own behaviour behind a caret.
- **The primary button carries the count.** "Export 37 tabs" is the confirmation and the action in one place, and it makes a filtered count visible before the click rather than after.
- **Native `<select>` for format.** A custom menu would cost keyboard and screen reader work and buy nothing. The format list is short and dull by design.
- **One way formats are labelled in the option text**, so nobody discovers the limitation after trusting a file as a backup.
- **The report is a live region below the action**, so a screen reader announces the outcome without moving focus.
- **The trust line is permanent furniture**, not a toast.

### Table DS3: Popup states

| State | Appearance | Why |
|---|---|---|
| Loading counts | Summary shows a skeleton dash, primary button disabled and labelled "Export" | Counts arrive in milliseconds, so a spinner would flash |
| Ready | As drawn above | |
| Working | Primary button keeps its width, label becomes "Working…", `aria-busy="true"` | Fixed width prevents layout jump |
| Success | Report line with a check in `--success`, filename on a second line, filename is selectable text | The filename is the thing a user needs to find the file |
| Filtered something | Report adds a muted second line, "3 duplicates and 2 pinned tabs skipped" | Rule 4, nothing silent |
| Nothing to export | Primary button and copy disabled, report explains which filter emptied the set. Import and the gear stay enabled | A disabled control without a reason is a dead end, and nothing about an empty window makes importing a pack any less possible |
| Failure | Report line in `--danger` with the actionable message from the core layer | |

## 4. Manager page

Single column, `max-width: 1120px`, 24 px gutters, cards on `--bg`. Two tasks behind a tab list, Export and Import, because a person is doing one of them and stacking both would put half the page's controls out of reach of the task in hand. The tab list is the ARIA tab pattern: arrow keys move, Home and End jump, selection follows focus.

```
  TabsPack                                    Nothing leaves your device
  ─────────────────────────────────────────────────────────────────────
  ┌─ Export ──────────────────────────────────────────────────────────┐
  │  Scope    [ All windows | This window | Selection ]               │
  │  Format   [ TabsPack file ▾ ]                                     │
  │                                                                   │
  │  Include    ☐ Titles in text export   ☑ Favicon URLs              │
  │             ☐ Private windows                                     │
  │  Filters    ☑ Remove duplicates  ☐ Web pages only  ☐ Skip pinned  │
  │                                                                   │
  │  [ Export 37 tabs ]  [ Copy ]                        1 window      │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ Output ──────────────────────────────────────────────────────────┐
  │  37 tabs · 12.4 KB                                                │
  │  ┌───────────────────────────────────────────────────────────────┐ │
  │  │ {  "format": "tabspack",                                     │ │
  │  │    "schemaVersion": 1,                            monospace   │ │
  │  └───────────────────────────────────────────────────────────────┘ │
  └───────────────────────────────────────────────────────────────────┘
```

Rules for this page:

- Controls are grouped by what they change: scope and format change what is captured, Include changes what is written, Filters change what is removed. Three labelled rows, never one long list of checkboxes.
- The output panel is the honesty mechanism: the user sees the exact bytes before trusting them. It is read only and monospace, and it never truncates without saying so.
- A checkbox that cannot apply, for example private windows without the browser level permission, is disabled with a one line reason beside it, not hidden.
- The task tabs carry only what has shipped. Disabled UI advertising an unbuilt feature is worse than its absence.

### The import task

```
  [ Export | Import ]
  ┌─ Import ──────────────────────────────────────────────────────────┐
  │  ┌─────────────────────────────────────────────────────────────┐  │
  │  │            Drop a pack here      [ Choose a file ]          │  │
  │  │       A .tabspack.json file. Nothing is opened until        │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  │  pack.tabspack.json · 2 windows · 6 tabs · 1 group · 1.4 KB       │
  │  TabsPack file: everything in it can be restored.                 │
  │  ⚠ 2 things to know about this file            (folded away)      │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ Preview ─────────────────────────────────────────────────────────┐
  │  [ Search titles and addresses ] [Select all] [Select none]        │
  │                               6 of 6 selected · 1 cannot be opened │
  │  ┌─────────────────────────────────────────────────────────────┐  │
  │  │ ▾ ☑ Window 1   5 tabs · 1 group · 1 pinned                  │  │
  │  │   ☑ Pinned reference        example.com/pinned              │  │
  │  │   ▾ ☑ ● Reading   2 tabs                                     │  │
  │  │     ☑ Grouped A           example.com/grouped-a             │  │
  │  │   ☑ Settings   chrome://settings/        [cannot be opened]  │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  │  This pack has 1 tab group ...            [ Allow tab groups ]    │
  │  Restore into [ New windows ▾ ]                                   │
  │  Policy  ☑ Skip tabs already open   Leave unloaded after [20] tabs │
  │  [ Restore 5 tabs ]   Nothing opens until you press this.          │
  │  ✓ Restored 5 tabs · 2 windows · 1 group · 1 cannot be opened      │
  │  ⚠ 3 notes about this restore                  (folded away)      │
  └───────────────────────────────────────────────────────────────────┘
```

Decisions behind that layout:

- **The file, then the preview, then the restore, then the outcome.** The page is in the order of the decisions a person makes, and each card answers one question: what is in this file, what shall I take from it, what happens when I press the button.
- **The button counts what will actually open**, while the line above the tree counts what is selected. A tab whose address no extension may open stays selected and flagged rather than being quietly deselected, so the restore can report it: ADR-018.
- **Search filters the tree, and "all" means what is shown.** With a search running, Select all and Select none act on the matches, because in a filtered list that is the only reading of "all" that does not surprise. The count line says how many are shown.
- **The fidelity line is two clauses**: what came through, and what the source format has no way to hold. It turns amber for a source that cannot carry everything, so a low fidelity import is visible before the restore rather than discovered after it.
- **Notes are folded away, never hidden.** A warning is a summary line with a count, openable in place. An error is never folded.
- **Restore notes sit with the restore**, not with the file. Two regions, each next to the thing it describes.
- **Nothing opens until the primary button is pressed**, and the sentence beside the button says so.

### Table DS5: The preview tree

| Rule | Detail |
|---|---|
| Structure | `role="tree"`, rows are `role="treeitem"` with `aria-level` and `aria-expanded`. Selection is `aria-checked` on the row, `true`, `false` or `mixed`, not a nested checkbox input, so a row is announced as one thing |
| Keyboard | One tab stop. Up and down move, right expands or descends, left collapses or goes to the parent, Home and End jump, space or enter toggles the row and everything under it |
| Rendering | Fixed 28 px rows, absolutely positioned inside a spacer of the full height, only the visible rows plus six either side in the document. A 5000 tab pack keeps about 30 rows in the document |
| Height | Grows with the content between 120 and 480 px, so a small pack is not a tall empty box and a large one does not push the restore controls off the screen |
| Group rows | Carry the group's colour as an 8 px dot in the browser's own palette, its title, and its tab count |
| Flags | A tab that cannot be opened carries a right aligned pill in `--warn`. The flag is text, never colour alone |
| Search | Filters to matching tabs and the windows and groups that hold them, and opens collapsed rows while it runs. Matching is on title and address together |

## 5. Components

### Table DS4: Component inventory

| Component | Rules |
|---|---|
| Button, primary | Accent fill, `--accent-text`, 40 px in the popup, 36 px on the manager page, weight 500. Hover `--accent-hover`, active shifts 1 px down, disabled at 45 percent opacity with `cursor: not-allowed` |
| Button, secondary | Transparent fill, 1 px `--border`, `--text`. Hover borrows `--surface` |
| Segmented control | Pill container on `--surface`, selected segment gets `--surface-raised` plus `--accent` text and a subtle shadow. `role="radiogroup"`, arrow keys move selection, `aria-checked` on each option |
| Select | Native, 32 px, `--surface` background, `--border` border. Never restyled to hide the platform caret |
| Checkbox | Native input with a 13 px label, 8 px gap, whole label clickable |
| Card | `--surface-raised`, 1 px `--border`, `--radius-card`, 16 px padding, a 13 px weight 600 legend |
| Report line | Leading 14 px status glyph as inline SVG, text at 13 px, filename on its own line at 12 px in `--text-muted`, container is `aria-live="polite"` |
| Output preview | Monospace 12 px, `--surface`, 1.5 line height, fixed height with vertical scroll, `readonly`, `spellcheck="false"` |
| Footer trust line | 11 px `--text-muted`, above a 1 px `--border` rule |

## 6. Accessibility contract

- Every interactive element is reachable and operable by keyboard in DOM order. Tab order matches visual order on every surface.
- `:focus-visible` shows a 2 px `--focus` outline at 2 px offset. Focus is never removed, and never replaced by a colour change alone.
- Contrast: body text at 4.5 to 1 or better, large text, glyphs and the borders that identify a control at 3 to 1 or better, in both themes. `npm run a11y` computes all 38 pairs from the tokens themselves and fails the build on a regression, which is how the `--border-strong` of the first draft was found at 1.58 to 1 and fixed.
- Status output uses `aria-live="polite"`, never an alert, and never steals focus.
- The segmented control is a radio group, so a screen reader announces "All windows, selected, 1 of 3".
- Disabled controls carry a visible textual reason, because `aria-disabled` alone tells a sighted user nothing.
- Icons are inline SVG with `aria-hidden="true"` when decorative, and a text label otherwise. No icon carries meaning alone.
- The interface is legible and usable at 200 percent browser zoom, which the popup's fixed 360 px width must tolerate by wrapping rather than clipping.

## 7. Settings

The options page is one column of cards in the order a person would ask the
questions: what should the defaults be, what should be left out, what should a
restore do, how should it look, and what is this thing anyway.

- **No Save button.** Every control writes its setting when it changes. A
  settings page with a Save button invents a state where what you see is not what
  is in force, and then has to defend it with a dialog on the way out.
- **A number outside its range falls back to the default**, and the field
  repaints to show what was actually stored rather than leaving a value that is
  not in effect on screen.
- **The keyboard shortcuts are read from the browser**, not restated here, because
  the browser owns them and the user may have changed them. A command the browser
  refused a key for says "not set" rather than lying about a key that does nothing.
- **The theme is three choices, System first.** It writes one attribute on the
  root element, which the tokens already answer to: no new colour is defined for
  a theme switch, ever.

## 8. Copy style

Sentence case everywhere, including buttons. Verbs for actions, "Export 37 tabs" rather than "Export tabs (37)". Numbers before nouns. Never "oops", never an exclamation mark, never an emoji. Failures state what happened and what to do, in that order, in one sentence. Counts are always exact; the interface never says "some tabs".
