# The four checks a machine cannot do

| Field | Value |
|---|---|
| Version | 1.1 |
| Date | 2026-09-28 |
| Task | `T-507`, the last four rows of [TESTING.md](TESTING.md) Table X2 |
| Time needed | About thirty minutes |
| Needed before | `T-509`, the first store submission |

Everything else in the matrix is automated and green. These four are not
automated because they cannot be: a driver cannot answer a browser's own
prompt, a suspender has to be a real installed extension, a keystroke on a
virtual display does not always arrive, and nothing automated has an opinion
about how something looks.

This page exists so the sitting is twenty minutes with one document open, not
an afternoon with the roadmap, the testing doc and the source beside each other.

**Before you start.** `npm run build`, then load `dist/chrome` at
`chrome://extensions` with developer mode on, and `dist/firefox` at
`about:debugging#/runtime/this-firefox` with Load Temporary Add-on, pointing at
the `manifest.json` inside the folder.

Write the result of each check in the last column of Table M1 at the bottom and
commit it. A blank column is the honest state until then.

## 1. Grant the `tabGroups` permission at the prompt

**Why a person.** No driver can answer a browser's own permission dialogue.
`npm run matrix -- --grant-groups` grants it programmatically and exercises
everything behind it, which leaves exactly one thing untested: the dialogue.

**Chrome or Edge.**

1. Open three tabs, select two of them, right click and group them. Name the
   group `Reading`, and give it a colour that is not the default.
2. Open the TabsPack manager. The Export pane should show a callout offering
   the tab groups permission, because a group is in scope.
3. Press the button in the callout. **The browser's own prompt appears.**
   Accept it.
4. The callout goes away without a reload.
5. Export. Open the file. The group must carry `"title": "Reading"` and the
   colour you chose, not a bare membership number.

**What failure looks like.** The prompt does not appear at all, which means the
request was made outside the click that caused it. Or the callout stays after
accepting, which means nothing re-read the permission. Or the file has groups
with no `title`, which means the permission was granted but the collector did
not notice.

**Then do it the other way.** Remove the permission at `chrome://extensions`,
Details, Permissions. Export again. The file should carry bare group membership
and the report should say, in words, that groups came out with no names. A
silent loss here is the defect ADR-030 exists to prevent.

## 2. A recovered suspended tab, against the suspender that made it

**Why a person.** The suspender has to be installed, and its parked pages exist
only inside a real profile. A fixture proves the parser; only the real thing
proves the parser is parsing what the suspender actually writes.

1. Install **The Great Suspender Original**, **Auto Tab Discard** or **Tabby**
   from the store, whichever you already use.
2. Open five ordinary pages. Let the suspender park at least three of them: use
   its own "suspend this tab" menu item rather than waiting.
3. Export with TabsPack, `Recover suspended tabs` on, which is the default.
4. In the file, every suspended tab must carry **the real address of the page**,
   not the suspender's extension URL. The export report must say how many were
   recovered.
5. Restore the file into new windows. The real pages must open. No tab may land
   on a suspender page.

**What failure looks like.** An address beginning `chrome-extension://` in the
file. A recovered count of zero when three were parked. A restored tab showing
the suspender's holding page rather than the site.

**The version matters.** Note which suspender and which version in Table M1.
These extensions change their URL format between releases, and a row that does
not say what it tested tells nobody anything later.

## 3. A keyboard command in Firefox

**Why a person.** The key arrives and the command does not fire on a virtual
display. The same key fires the same command in Chrome and Edge, and rebinding
to `Ctrl+Shift+U` ruled out the `Alt` modifier, so the product is not what is in
doubt. It is the display.

1. In Firefox, with the add-on loaded, open several tabs.
2. Press **`Alt+Shift+E`**. A `.tabspack.json` file must be written to your
   downloads, and the toolbar badge must report the count.
3. Press **`Alt+Shift+S`**. A snapshot must appear on the Snapshots pane.
4. Check the shortcuts the browser reports: the About pane lists them, and they
   must match the keys that just worked.

**What failure looks like.** Nothing happens. If so, check
`about:addons`, Manage Extension Shortcuts, for a conflict with another add-on
before recording it as a failure: a clash is a conflict, not a defect.

## 4. Look at it

**Why a person.** Nothing automated has an opinion about how something looks.
The contrast is computed, the layout is measured at five widths and the strings
all come from `_locales`. None of that says whether it is any good.

Go through all five panes in both themes, in a window that is not maximised:

- **Export.** Does the primary button say what it will do? Is the report a
  success when it succeeded? Untick a tab in **What will be exported** and
  export: the file must leave it out, and the report must say so. After the
  export the settings should fold to one line, and **Change settings** should
  open them again. Unticked checkboxes must read as empty boxes in both themes,
  never as filled squares.
- **Import.** Drop a file in. Is the preview readable at a glance with fifty
  rows in it?
- **Snapshots.** With none saved, does the empty state tell you what to do?
  Save a few, then try **Compare with previous**, **Tidy unchanged**, **Find
  repeated addresses** and **Combine selected**. Is each result clear about what
  it found, and does anything delete without asking first?
- **Automatic protection**, on the Snapshots pane. Turn on the recovery copy,
  open a dozen tabs, wait a minute, then quit the browser from a terminal with
  `pkill -9` on its process, and start it again. If the browser does not bring
  the tabs back, TabsPack should offer them: a badge on the toolbar, a line in
  the popup, and a card on the manager that previews them before anything
  opens. Press **Show recently closed** and answer the browser's prompt: the
  list should appear, and **Reopen** should bring a window back with its
  history.
- **Settings** and **About.** Is anything stated twice?
- **The popup**, which is the surface most people see most often.

Then the one thing worth doing deliberately: **make the window narrow**, about
a third of the screen, and look again. The automated check proves nothing
overflows. It has no view on whether the result is usable.

Note anything that looks wrong as a new row in the roadmap rather than fixing it
here. A note is cheap and a half fix during a test pass is not.

## Table M1: Results

Fill the last column in, one line each, and commit it. `not yet` is the honest
state of a check nobody has done.

| # | Check | Browser | Result |
|---|---|---|---|
| 1 | The `tabGroups` prompt is answered and the group keeps its name | Chrome | not yet |
| 1 | The same, and refusing it still exports with a stated loss | Edge | not yet |
| 2 | A real suspender's parked tab is recovered to its true address | Chrome or Edge | not yet |
| 3 | `Alt+Shift+E` and `Alt+Shift+S` fire | Firefox | not yet |
| 4 | Five panes, two themes, one narrow window, the export preview and the snapshot tools | Any | not yet |
| 4 | A killed browser that did not restore its tabs is offered them, and the `sessions` prompt is answered | Chrome or Edge | not yet |
