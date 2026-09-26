# Architecture

Status: describes the code as built through M2. When code and this document diverge, fix whichever is wrong and say which in the commit.

## 1. Shape of the thing

TabsPack is a browser extension with no runtime dependencies beyond one polyfill, and no network access except one request the user grants at the point of use: the Support pane's Send button, which posts to the relay in `server/support-worker/` and nothing else. ADR-039. All other state is local. There are four execution contexts and a rule about each.

### Table A1: Execution contexts

| Context | File | Lives for | What belongs here |
|---|---|---|---|
| Service worker (background) | `src/background/sw.ts` | Event to event, terminated when idle | Keyboard commands, badge, opening the manager page. It writes a file directly for an export command, which is bounded work. No long lived state, because the worker is killed |
| Popup | `src/ui/popup/` | While open, closes on focus loss | One click export, tab count, an import button that hands off to the manager page and a gear that opens settings. Never a file dialog, never a long task |
| Manager page (extension page) | `src/ui/manager/` | Until the user closes the tab | Import, preview, selection, restore, snapshot list. All file input and output. This is where the product actually lives |
| Settings and About | `src/ui/manager/settings-panel.ts` | While open | Two panes of the manager page, not a page of their own: a setting that belongs to a task lives with that task, and these hold what belongs to none. Written the moment it changes, no Save button, because a settings page with one invents a state where what you see is not what is in force. ADR-028 |
| Support | `src/ui/manager/support-panel.ts` | While open | A pane of the manager page. Composes a message in `core/support.ts`, shows it in full, and sends it through `core/relay.ts` or hands it to the user's own mail client. The only surface that can make a request, and only after the browser has granted the relay's host: ADR-035, ADR-039 |
| Placeholder page | `src/ui/placeholder/` | Until the user closes the tab | Lists the addresses a restore could not open, as inert text. Opened by a restore, never by the user |

The single most important placement decision: **import and export do not live in the popup**. A popup closes when the file picker takes focus, which is the most common cause of broken import in the extensions we studied. The popup is a launcher.

## 2. Module layout

As built at the end of M2. Files marked `(M3)` or later are planned, not present.

```
manifest.chrome.json      Chromium, service_worker background
manifest.firefox.json     Gecko, background.scripts, browser_specific_settings
src/
  background/
    sw.ts                 capability report on install, keyboard commands
    commands.ts           what each keyboard command does
    save-file.ts          writing a file from the background: blob, data URL, page
  core/
    adapter/              the only code allowed to touch browser.*
      types.ts            BrowserAdapter interface, Raw* shapes, Capabilities
      webext.ts           the one import of webextension-polyfill, narrowly typed
      index.ts            the real adapter, plus the lifecycle and command events
    capabilities.ts       capability table and user notices, pure
    collect.ts            browser state to Session
    filters.ts            scheme, pinned, stale, exclude, dedupe, sort, reindex
    staleness.ts          how old the tabs are, in bands. Unknown is its own
                          band and is never called old: ADR-044
    serialize.ts          Session to TabsPackFile, deterministic output
    exporters.ts          the two one way formats, URL list and flat JSON
    export.ts             collect, filter, render: the pipeline both surfaces use
    naming.ts             filenames and ISO timestamps with a local offset
    report.ts             export and import report objects
    settings.ts           defaults, merge on read, storage round trip
    snapshots.ts          the metadata index, one body per snapshot, quota
    issues.ts             one shape for every validation, migration and read note
    schema.ts             structural validation and the version gate
    migrate.ts            the version step registry, empty until the format changes
    deserialize.ts        TabsPackFile to Session, unknown field retention
    import.ts             parse, migrate, validate, read: the one import entry point
    urls.ts               which addresses an extension may open, and why not
    rating.ts             when to ask for a rating, and when to stop: ADR-036
    restore.ts            Session to browser state, throttle and discard policy
    relay.ts              the only file permitted to make a request: ADR-039
    support.ts            composes the support message, and carries no tab data
    unsuspend.ts          a suspender's wrapper read back to the real page: ADR-023
    adapters/             foreign format readers, one file per source
      types.ts            the adapter contract and the envelope builder
      detect.ts           the registry, in order from specific to general
      tsm.ts              Tab Session Manager, read from its own source
      session-buddy.ts    Session Buddy JSON
      csv.ts              any CSV with a URL column, including Session Buddy's
      onetab.ts           OneTab text, one list per window
      text.ts             lists of addresses, and Markdown links
      netscape.ts         browser bookmark files
      flat-json.ts        an array of addresses or of objects
  ui/
    shared/
      theme.css           tokens, light and dark
      base.css            components
      dom.ts              element helpers, inline SVG icons, no innerHTML
      segmented.ts        radio group behaviour with arrow keys
      tabs.ts             the ARIA tab pattern, for the manager's three tasks
      i18n.ts             every string the interface shows, from _locales
      wording.ts          where a report's numbers become sentences
      theme.ts            light, dark or the system's choice, as one attribute
      report-view.ts      renders a report and an issue list into a live region
      save.ts             Blob plus downloads API, anchor fallback, clipboard
      notify.ts           the toolbar badge and tooltip, from any surface: ADR-033
      groups-callout.ts   the tabGroups permission offer, where it is lost: ADR-030
    popup/
      popup.ts            launcher: counts, scope, one primary action
      popup.css
    manager/
      manager.ts          the shell and the export task
      import-panel.ts     file intake, validation display, restore controls
      preview-tree.ts     the virtualised windows, groups and tabs tree
      snapshot-panel.ts   save, list, rename, tag, export and delete snapshots
      settings-panel.ts   the Settings and About panes: ADR-028
      support-panel.ts    compose, send through the relay, fall back: ADR-039
      rating-panel.ts     the ask, built once per pane, never a modal: ADR-036
      manager.css         the manager's own styles, on top of shared/base.css
    placeholder/
      placeholder.ts      renders the addresses a restore could not open
      placeholder.css
  types/
    tabspack.ts           the format types, the source of the JSON Schema
    session.ts            the in memory model
    webextension-polyfill.d.ts
_locales/
  en/messages.json        every string the interface shows
assets/
  icon.png                the mark, 512 px, rendered down by scripts/gen-assets.mjs
  icons/, store/          generated, never hand edited
schema/
  tabspack.v1.schema.json generated, never hand edited, and published by
                          gen-site.mjs at the address its own $id names
scripts/                  build, lint, schema, test, fixtures, icons, perf, smoke,
                          the site renderer and the relay deploy
  site/                   the site's source: one layout, one file per page
website/                  the rendered site, committed, served by GitHub Pages
server/support-worker/    the Cloudflare Worker that carries a support message
test/
  tools/                  fake browser, scenarios, fixture generator, bench,
                          the round trip harness
  unit/                   the node test suite
  fixtures/valid|invalid|edge|foreign|migration|synthetic
```

## 3. Two models, deliberately

`TabsPackFile` is the wire format described in [SPEC.md](SPEC.md). Stable, versioned, public, boring.

`Session` is the in memory model the UI and restore engine use. It may change freely between releases because nothing outside the process sees it.

`serialize.ts` and `deserialize.ts` are the only bridge between them. No UI code and no restore code ever reads a raw file object. This is what keeps the published format from being dragged around by UI convenience, and it is the mistake Tab Session Manager made by persisting its internal session object as its export.

`Session` keeps two things that look redundant and are not: the text of every timestamp exactly as an imported file spelled it, alongside the parsed value. A pack read in one timezone and written out again must be byte identical, and re deriving `2026-09-24T13:59:40+05:30` from an epoch in another timezone would quietly restamp a field the user never touched.

## 4. The adapter rule

Nothing outside `src/core/adapter/` may reference `browser.*` or `chrome.*`. Enforced by lint rule and by review.

Reasons: Firefox and Chromium differ in promise support, in `tabGroups` availability, in `discarded` on create, in containers, and in window title handling. Capability differences are resolved once, in `capabilities.ts`, by probing for the API rather than testing the browser name. User agent sniffing is forbidden; an API either exists or it does not.

`webextension-polyfill` is vendored so `browser.*` returns promises on Chromium. It is the only runtime dependency.

## 5. Data flow

Export:

```
UI intent (scope, filters)
  -> core/collect.ts        adapter/windows.getAll(populate), adapter/groups.query
  -> core/unsuspend.ts      a suspender's wrapper -> the page it stands for
  -> core/staleness.ts      how old the scope is, measured before any filter
  -> core/filters.ts        scheme, pinned, stale, exclude, dedupe, sort
  -> core/serialize.ts      Session -> TabsPackFile, strip data favicons
  -> adapter/downloads.ts   write tabspack-YYYYMMDD-HHmm.tabspack.json
  -> core/report.ts         counts shown in UI, badge flashed by sw
```

Import and restore:

```
File (picker or drag and drop)
  -> core/adapters/detect.ts   shape based, never extension based
  -> the matching adapter      foreign -> TabsPackFile
  -> core/schema.ts            validate, migrate to current version
  -> core/deserialize.ts       TabsPackFile -> Session (unknown fields retained)
  -> core/unsuspend.ts         the same recovery, for files written before it
  -> UI preview                windows, groups, search, per tab selection
  -> core/restore.ts           windows.create -> tabs.create (inactive)
                               -> wait for the address, then tabs.discard,
                                  following the new id Chromium hands back
                               -> tabs.group + tabGroups.update
                               -> placeholder page for unopenable URLs
  -> core/report.ts            restored, skipped, duplicate, unopenable, ungrouped
```

## 6. Restore engine, the part that has to be right

Order of operations per window, because every one of these has a failure mode found in existing extensions:

1. Create the window with `bounds` and `state`. If `windows.create` rejects, retry once at 800 by 600 at the origin. This is a real Chromium failure on some window managers and Tab Session Manager carries the same workaround.
2. Sort tabs: pinned first, then by `index`.
3. Create tabs with `active: false`. Track the mapping from file index to created tab id.
4. Beyond the discard threshold, default 20, call `tabs.discard` on the created tab. On Gecko, pass `discarded: true` at creation instead, which is cheaper.
5. Remove the placeholder tab the new window opened with, only after the first real tab exists, otherwise the window closes.
6. Group tabs: one `tabs.group` call per group with all its tab ids, then `tabGroups.update` for title and colour. Grouping after creation is required because `tabs.create` cannot assign a group.
7. Activate the tab marked `active`, or the first tab.
8. Collapse the groups that were collapsed, and focus the window that was focused.
9. Open the placeholder page listing unopenable URLs, if any, and emit the report.

Four refinements the browsers forced, all of them found by running the engine rather than by reading documentation:

- **Bounds and state are mutually exclusive.** `windows.create` refuses a `state` such as maximized together with `left`, `top`, `width` or `height`. A window whose state is not normal is created plain and its state applied afterwards, so its bounds come from the window manager rather than from the file.
- **Collapsing happens after activating.** A browser refuses to collapse the group that holds the active tab, so every collapse is queued until step 8. A refusal is reported, not swallowed.
- **Focus is applied once, at the end.** Every window created after the focused one takes the focus away, so the window the pack says was focused is focused after the last one exists.
- **`title` travels only with `discarded`.** Both are Gecko only. Chromium rejects an unrecognised property on `tabs.create` outright, which is exactly what makes the single probe in step 4 reliable, and it is why nothing else is ever sent speculatively.

Throttling: creation is awaited in batches, with a small delay between batches, so the browser stays responsive. NFR-004 in [../PLAN.md](../PLAN.md) is the target this exists to meet.

What a restore cannot carry back, and why, is listed in [LIMITATIONS.md](LIMITATIONS.md) Table L2 and asserted as the exception list of the round trip harness in `test/tools/roundtrip.ts`.

## 7. Contexts talking to each other, and why they do not

The background is a command handler, not a router. It registers **no message
listener at all**, and nothing in TabsPack sends a runtime message.

That is worth stating, because the obvious design is the opposite. Every TabsPack
page is an extension page with the whole extension API available to it, so a page
that wants to read tabs reads tabs. Routing the same call through the background
would add a second way to do what the first way already does, a listener that has
to check who is calling it, and a context that can be terminated mid flight.

What each context does instead:

- A **page** does its own work, including the long running work, because it is
  not terminated while it is open. Restore and import live on the manager page
  for that reason.
- The **background** runs the keyboard commands, which arrive as browser events
  rather than as messages, and reports the capability table on install. Its work
  is bounded, so being terminated afterwards costs nothing.
- Pages that need to know about each other's work watch `storage.onChanged`. That
  is how the snapshot list follows a snapshot saved by a keyboard command, and how
  an open manager page follows a setting changed in another tab of it. The data is
  the message, and it is already the thing that had to be written.
- The **toolbar icon** is the one surface every context can write to, so it is
  how a background command, a popup and a manager page all report the same
  outcome the same way: a badge tone for whether it worked and a tooltip
  sentence for what happened. One module, `ui/shared/notify.ts`: ADR-033.

The one case where a page cannot finish the job is a keyboard export of a pack too
large to write from the background: the background opens `manager.html#export=<scope>`
and the page performs the export on arrival, with the intent in the URL.

## 8. Storage layout

`storage.local` only. `storage.sync` is not used, because its roughly 100 KB quota and per item limits cannot hold snapshots and splitting them across the two stores creates a partial sync failure mode.

### Table A3: Storage keys

| Key | Shape | Notes |
|---|---|---|
| `settings` | object | Defaults live in one module, merged on read, so a new setting never requires a migration |
| `snapshots` | array of `{ id, name, tags, createdAt, updatedAt, counts, bytes }` | Metadata only, so listing fifty snapshots reads a few kilobytes. The body is written before the entry that names it, because an orphan body can be found and an entry with no body cannot be opened |
| `snapshot:<uuid>` | The pack as text, exactly as exporting it would write | One key per snapshot so a large snapshot never blocks reading the list |
| `placeholder:<uuid>` | `{ createdAt, tabs }` | The addresses a restore could not open, handed to the placeholder page. A pack can hold hundreds, which is more than a URL can carry. Pruned to the five most recent whenever that page opens |

## 9. Build

TypeScript compiled by esbuild. Bundles are classic scripts rather than ES
modules, which is the most compatible choice across a Chromium service worker
and a Gecko event page, and it keeps the manifests free of `"type": "module"`.
No framework, no runtime bundler, no CSS preprocessor. Two manifests, one source
tree. Output per target under `dist/chrome/` and `dist/firefox/`.

Project rules are enforced by `scripts/lint.mjs` rather than an eslint plugin:
the adapter boundary, no `innerHTML`, no network call or remote resource, no
unexplained `any`, and the manifest permission set. See ADR-014.

Why TypeScript: the published JSON Schema is generated from `src/types/tabspack.ts`, so the types are the specification's machine readable source. Migrations between schema versions are the other place where types prevent silent data loss.

## 10. What is deliberately absent

One server, `server/support-worker/`, which exists to hold a mail key the extension must not ship, receives only what a user typed into the Support pane, and stores nothing. No analytics. No message passing to other extensions. No content scripts, because nothing needs to run inside a page. No `<all_urls>`, and no host permission at all until a user grants one. No remote code, which is also a hard store policy requirement.

Exactly one file in `src/` may make a request, `src/core/relay.ts`, and only with `fetch`. `scripts/lint.mjs` fails the build on any transport anywhere else, and on `XMLHttpRequest`, `EventSource`, `WebSocket` or `importScripts` even there. The relay's address is written in four places, and a lint rule fails the build if they disagree.
