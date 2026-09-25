# Architecture

Status: describes the code as built through M2. When code and this document diverge, fix whichever is wrong and say which in the commit.

## 1. Shape of the thing

TabsPack is a browser extension with no server, no network access and no runtime dependencies beyond one polyfill. All state is local. There are four execution contexts and a rule about each.

### Table A1: Execution contexts

| Context | File | Lives for | What belongs here |
|---|---|---|---|
| Service worker (background) | `src/background/sw.ts` | Event to event, terminated when idle | Keyboard commands, badge, opening the manager page. It writes a file directly for an export command, which is bounded work. No long lived state, because the worker is killed |
| Popup | `src/ui/popup/` | While open, closes on focus loss | One click export, tab count, buttons that open the manager page. Never a file dialog, never a long task |
| Manager page (extension page) | `src/ui/manager/` | Until the user closes the tab | Import, preview, selection, restore, snapshot list. All file input and output. This is where the product actually lives |
| Options page | `src/ui/options/` | While open | Every setting, written the moment it changes. No Save button, because a settings page with one invents a state where what you see is not what is in force |
| Placeholder page | `src/ui/placeholder/` | Until the user closes the tab | Lists the addresses a restore could not open, as inert text. Opened by a restore, never by the user |

The single most important placement decision: **import and export do not live in the popup**. A popup closes when the file picker takes focus, which is the most common cause of broken import in the extensions we studied. The popup is a launcher.

## 2. Module layout

As built at the end of M2. Files marked `(M3)` or later are planned, not present.

```
manifest.chrome.json      Chromium, service_worker background
manifest.firefox.json     Gecko, background.scripts, browser_specific_settings
src/
  background/
    sw.ts                 message router, capability report, command listener
    commands.ts           what each keyboard command does
    save-file.ts          writing a file from the background: blob, data URL, page
  core/
    adapter/              the only code allowed to touch browser.*
      types.ts            BrowserAdapter interface, Raw* shapes, Capabilities
      webext.ts           the one import of webextension-polyfill, narrowly typed
      index.ts            the real adapter, plus the message and lifecycle events
    capabilities.ts       capability table and user notices, pure
    collect.ts            browser state to Session
    filters.ts            scheme, pinned, exclude, dedupe, sort, reindex
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
    restore.ts            Session to browser state, throttle and discard policy
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
    popup/                launcher: counts, scope, one primary action
    manager/
      manager.ts          the shell and the export task
      import-panel.ts     file intake, validation display, restore controls
      preview-tree.ts     the virtualised windows, groups and tabs tree
      snapshot-panel.ts   save, list, rename, tag, export and delete snapshots
    placeholder/          the page listing addresses that cannot be opened
    options/              settings, the theme switch and the shortcut list
  types/
    tabspack.ts           the format types, the source of the JSON Schema
    session.ts            the in memory model
    webextension-polyfill.d.ts
_locales/
  en/messages.json        every string the interface shows
assets/
  icon.svg                the mark, rasterised by scripts/gen-assets.mjs
  icons/, store/          generated, never hand edited
schema/
  tabspack.v1.schema.json generated, never hand edited
scripts/                  build, lint, schema, test, fixtures, icons, perf, smoke
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
  -> core/filters.ts        dedupe, scheme, skip pinned, exclude, sort
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
  -> UI preview                windows, groups, search, per tab selection
  -> core/restore.ts           windows.create -> tabs.create (inactive)
                               -> tabs.discard beyond threshold
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

## 7. Messaging contract

The service worker is a router, not a brain. Messages are plain objects with a `type`, and every handler replies with `{ ok: true, ... }` or `{ ok: false, error: string }`. Sender identity is checked against `runtime.id` and anything else is rejected, the pattern Copy All URLs uses.

### Table A2: Message types

| Type | Sender | Purpose |
|---|---|---|
| `OPEN_MANAGER` | popup | Open the manager page |
| `FLASH_BADGE` | any page | Show a count briefly |
| `CAPABILITIES` | any page | The capability probe, for diagnostics |

A handler that is not responsible for a message returns `UNHANDLED` rather than a
response, because every extension context receives every runtime message and the
first responder wins.

Keyboard commands do not use messages at all. The worker runs them itself, in
`src/background/commands.ts`: collect, then either write a file or save a
snapshot. A command that has to open a page to finish, because the pack is too
large to write from the background, opens the manager page at
`manager.html#export=<scope>` and the page performs the export on arrival.

Restore runs in the manager page, not the service worker, because it is long running and the worker can be terminated mid flight.

## 8. Storage layout

`storage.local` only. `storage.sync` is not used, because its roughly 100 KB quota and per item limits cannot hold snapshots and splitting them across the two stores creates a partial sync failure mode.

### Table A3: Storage keys

| Key | Shape | Notes |
|---|---|---|
| `settings` | object | Defaults live in one module, merged on read, so a new setting never requires a migration |
| `snapshots` | array of `{ id, name, tags, createdAt, updatedAt, counts, bytes }` | Metadata only, so listing fifty snapshots reads a few kilobytes. The body is written before the entry that names it, because an orphan body can be found and an entry with no body cannot be opened |
| `snapshot:<uuid>` | The pack as text, exactly as exporting it would write | One key per snapshot so a large snapshot never blocks reading the list |
| `placeholder:<uuid>` | `{ createdAt, tabs }` | The addresses a restore could not open, handed to the placeholder page. A pack can hold hundreds, which is more than a URL can carry. Pruned to the five most recent whenever that page opens |
| `schemaVersion` | integer | Of the stored data, not of the file format |

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

No server. No network calls. No analytics. No message passing to other extensions. No content scripts, because nothing needs to run inside a page. No `<all_urls>`. No remote code, which is also a hard store policy requirement.
