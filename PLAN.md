# TabsPack: Plan of Record

| Field | Value |
|---|---|
| Version | 0.4 |
| Date | 2026-09-26 |
| Status | M0 to M9 built and verified. 1.0.0 live on the Chrome Web Store; 1.1.0, with the export preview, M9 durability and recent sessions, uploaded there as a draft update on 2026-09-28 |
| Supersedes | `docs/history/TabPack_BRD_PRD_v0.9.md` (BRD and PRD v0.9, 2026-07-14) |
| Normative format spec | [docs/SPEC.md](docs/SPEC.md) |
| Sequencing and exit tests | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Decision log | [docs/DECISIONS.md](docs/DECISIONS.md) |

This document is the single source of truth for why TabsPack exists, who it is for, and what v1 must do. It merges the strategy from BRD and PRD v0.9 with the engineering plan derived from reading the source of four existing extensions. Where the two disagreed, the resolution and its reason are recorded in `docs/DECISIONS.md`.

## 1. Vision

TabsPack moves browser sessions between browsers.

> Export, move, share and restore browser tabs across browsers using an open, offline first format.

The product is four things, in order of what gets built first:

1. A cross browser extension, the reference implementation.
2. An open `.tabspack.json` specification.
3. A published JSON Schema plus sample files.
4. Later, a validating CLI so third parties can implement the format without reading extension code.

The long term asset is the specification. The short term priority is the extension, because a format becomes a standard only after its reference implementation has users.

## 2. Problem

Existing tools optimise for tab reduction, memory saving and bookmarking. The unsolved problems are movement and durability:

- Migrating a working set from one browser to another.
- Backing up a research session before reinstalling an operating system.
- Sharing a workspace with a colleague.
- Recovering after a crash or a profile reset.
- Preserving tab organisation, not just the list of URLs.

There is no widely adopted open interchange format for browser sessions comparable to CSV for tables, OPML for feeds or ICS for calendars. Every incumbent stores sessions in a private shape, so leaving the tool means losing the data.

## 3. Positioning

Not a tab manager. Not a bookmark manager. Not a memory saver.

A browser migration tool, a session exchange tool, a workspace packaging tool.

## 4. Design principles

1. Offline first. No network call is made by the extension in v1.
2. Privacy first. No cookies, no tokens, no form data, no telemetry.
3. Open specification, versioned and published.
4. Human readable files. A person with a text editor can read and hand edit an export.
5. Zero vendor lock in. Import from competitors, export to a format competitors can read.
6. One codebase across browsers, with capability detection rather than browser sniffing.
7. No account required, ever, for core function.

## 5. Browsers

### Table P1: Browser targets

| Browser | Engine | v1 build | v1 store submission |
|---|---|---|---|
| Google Chrome | Chromium | Yes | Chrome Web Store |
| Microsoft Edge | Chromium | Same build as Chrome | Edge Add-ons |
| Mozilla Firefox | Gecko | Second manifest, same source | Firefox Add-ons (AMO) |
| Brave, Opera, Opera GX, Vivaldi, Arc | Chromium | Works from the Chrome build, supported best effort | None in v1 |
| Zen, Floorp | Gecko | Works from the Firefox build, supported best effort | None in v1 |
| Safari | WebKit | Excluded | Excluded. Needs Xcode packaging and a paid Apple developer account |

The v1 effort is two engines, not seven browsers.

## 6. Users and user stories

Primary persona: a heavy tab user who treats open tabs as working memory. Researchers, developers, students, analysts, anyone who runs 50 to 300 tabs and fears losing them.

- US-1: I want to move 150 tabs from Chrome to Firefox without losing my window layout or my tab groups.
- US-2: I want to back up my research before reinstalling my machine, as a file I can read in five years.
- US-3: I want to send a colleague every tab I used during today's meeting.
- US-4: I want to restore only the tabs I select from a file, not all of them.
- US-5: I want to leave Session Buddy or OneTab and keep my saved sessions.
- US-6: I want to save today's session without deciding where a file goes.

US-5 and US-6 were absent from v0.9 and are now in scope. US-5 is the migration path that makes US-1 reachable for people who already store sessions elsewhere. US-6 is the everyday habit that keeps the extension installed between migrations.

## 7. Scope

In scope for v1: export current window, selected tabs or all windows. Export to `.tabspack.json`, plain text URL list, and clipboard. Import `.tabspack.json`, plain text, generic JSON, and the foreign formats in Table P4. Validate, preview, select, restore into the current window or new windows. Named snapshots stored locally. Settings, filters, keyboard shortcuts, light and dark theme, i18n scaffold with English shipped.

Out of scope for v1, in roughly the order it might arrive later: automatic scheduled saves, crash and last session recovery, duplicate detection across snapshots, workspace management, sharing links, cloud sync, accounts, encryption, digital signatures, a native app, a CLI, editor and chat integrations, AI features of any kind.

Out of scope permanently: cookies, session tokens, form state, local storage or anything else that would make an export file a credential.

## 8. Competitive landscape

### Table P2: Reference extensions read for this plan

| Extension | Reality | Technique adopted |
|---|---|---|
| TabsDump | MV3 popup, clipboard only, JSON or plain text, field picker, settings not persisted | Field projection, clipboard fallback through a hidden textarea |
| Export Tabs | Textarea plus HTML download plus Gmail handoff. Its import is a regular expression over free text, so order, pinned state, groups and window boundaries are lost. Requests `<all_urls>` needlessly | `windows.getAll({populate:true})` as a single read |
| Copy All URLs | The mature one: service worker, offscreen document for clipboard, feature registry over `storage.sync`, 13 output formats, 30 plus locales, hotkeys, badge, punycode host decoding, wildcard exclude list, dedupe, sort, `pendingUrl` fallback. Clipboard only, ships minified | Offscreen clipboard pattern, filter pipeline, `pendingUrl` fallback, i18n through `__MSG_*` |
| Tab Session Manager (open source, Chrome and Firefox) | The fidelity bar. Session keyed by window then tab, separate `windowsInfo` for geometry, `tabGroups` array, uuid ids, import de duplicated on id plus `lastEditedTime`, `windows.create` retried at 800 by 600 on rejection, favicon data URL compression, `tabGroups` declared optional so Chrome shows no update warning | All of the above. Its weakness is that its export is an internal dump rather than a documented interchange format, which is precisely the gap TabsPack fills |
| Session Buddy | Closed source, Chrome only, largest install base | Sets the bar for restore speed on large sessions and for crash recovery |

Every one of the first three is an exporter. None of them round trips. That is the opening.

## 9. Differentiators

1. A published, versioned, human readable specification, so a file is an interchange artifact and not a private dump.
2. True round trip: window count, geometry and state, tab order, pinned tabs, active tab, tab groups with title, colour and collapsed state.
3. An importer that reads competitors' files.
4. Restore that does not freeze the browser at 200 plus tabs.
5. One source tree for Chromium and Gecko, with capability detection.

## 10. Functional requirements

Requirement ids are stable and are referenced by task rows in `docs/ROADMAP.md` and by test names.

### Table P3: Export and clipboard

| Id | Requirement |
|---|---|
| FR-001 | Export the current window |
| FR-002 | Export a user selected subset of tabs |
| FR-003 | Export all windows |
| FR-004 | Export a plain text URL list, with an optional titles toggle per ADR-011 |
| FR-005 | Export a flat JSON array of url and title |
| FR-006 | Export `.tabspack.json` per `docs/SPEC.md` |
| FR-007 | Copy any export to the clipboard |
| FR-008 | Default filename `tabspack-YYYYMMDD-HHmm.tabspack.json` |
| FR-009 | Strip `data:` favicon URLs by default, with a setting to keep them compressed |
| FR-010 | Exclude incognito windows by default, opt in through settings |

### Table P4: Import

| Id | Requirement |
|---|---|
| FR-101 | Import `.tabspack.json`, any supported `schemaVersion` |
| FR-102 | Import a plain text URL list, one URL per line, ignoring blank lines and comments |
| FR-103 | Import a flat JSON array of URLs or of objects carrying a url field |
| FR-104 | Validate against the schema and report errors with a path and a fix, never a bare failure |
| FR-105 | Preview before restore: counts, windows, groups, search, select all, per tab checkbox |
| FR-106 | Detect and normalise foreign formats: Tab Session Manager JSON, Session Buddy JSON and CSV, OneTab text, Markdown link lists, Netscape HTML bookmark files |
| FR-107 | Accept files by picker and by drag and drop |
| FR-108 | Preserve unknown fields when rewriting a file, while ignoring them for behaviour |
| FR-109 | Migrate older `schemaVersion` values forward, with one migration function per version step |

### Table P5: Restore

| Id | Requirement |
|---|---|
| FR-201 | Restore only the selected tabs |
| FR-202 | Restore into the current window |
| FR-203 | Restore into new windows, one per window in the file |
| FR-204 | Handle URLs that cannot be opened programmatically by listing them on a placeholder page, never by silent dropping |
| FR-205 | Detect duplicates against already open tabs and offer skip or open anyway |
| FR-206 | Reproduce tab order, pinned tabs and the active tab |
| FR-207 | Reproduce tab groups with title, colour and collapsed state where the browser supports it, and degrade to ungrouped tabs with a single notice where it does not |
| FR-208 | Throttle tab creation and discard tabs beyond a configurable threshold, default 20 |
| FR-209 | Show an import report: restored, skipped, duplicated, unopenable, ungrouped |
| FR-210 | Restore window position, size and state where the browser allows, retrying at a safe size if the window manager rejects the bounds |

### Table P6: Snapshots and settings

| Id | Requirement |
|---|---|
| FR-301 | Save a named snapshot of the current session to local storage |
| FR-302 | List, rename, tag and delete snapshots |
| FR-303 | Export any snapshot to a file, and import a file as a snapshot without restoring it |
| FR-304 | Keyboard shortcuts for export all windows, export current window and save snapshot |
| FR-305 | Badge showing the tab count captured by the last action |
| FR-401 | Settings for default export scope, default format and default restore target |
| FR-402 | Filters: dedupe by URL, http and https only, skip pinned, skip tabs not opened within a chosen window, wildcard exclude list, sort by title, URL or domain |
| FR-407 | Report how old the tabs in the scope are, from `lastAccessed`, measured before any filter runs. A pinned tab and a tab with no timestamp are never called old. B-202, ADR-044 |
| FR-403 | Restore policy: throttle delay, discard threshold, placeholder behaviour |
| FR-404 | Incognito opt in, gated by the browser level permission |
| FR-405 | Light, dark and system theme |
| FR-406 | i18n through `__MSG_*` with English complete, other locales community contributed |

## 11. Non functional requirements

Each is measurable and each becomes a test. The v0.9 targets for startup and memory were removed because an MV3 service worker has no meaningful startup time, it is event driven and terminated when idle, and extension memory is not assertable from inside the extension.

### Table P7: Non functional requirements

| Id | Requirement | How it is measured |
|---|---|---|
| NFR-001 | Popup interactive within 150 ms | Click to rendered tab count, median of 10 runs, 200 tabs open |
| NFR-002 | Export 1000 tabs in under 2 seconds, including file write | Synthetic fixture, wall clock in the manager page |
| NFR-003 | A 1000 tab file stays under 400 KB with favicons stripped | Byte size of the fixture export |
| NFR-004 | Restore 200 tabs with no single UI block longer than 200 ms | Long task observation during restore, throttled creation plus discard enabled |
| NFR-005 | The manager page opens a 5000 tab file without crashing | Fixture load and preview render |
| NFR-006 | Zero network requests from the extension | Automated check that no fetch, XHR or remote resource appears in the built bundle, plus manual devtools verification |
| NFR-007 | Zero host permissions at install, four required permissions (`alarms` added in M9, ADR-048) | Manifest assertion in CI |
| NFR-008 | Works fully offline | Airplane mode run of the full export and import path |
| NFR-009 | No telemetry, no analytics, no remote logging | Code review gate, stated in `PRIVACY.md` |

## 12. Permissions

### Table P8: Permission policy

| Permission | Required or optional | Justification given to reviewers |
|---|---|---|
| `tabs` | Required | Read the url and title of open tabs. Without it the product cannot function |
| `storage` | Required | Settings, snapshots, and, when turned on, automatic snapshots and the recovery copy |
| `alarms` | Required since 1.1.0 | Wakes the worker for the recovery copy and automatic snapshots, only when the user turned them on. No install warning: ADR-048 |
| `downloads` | Required | Write the export file |
| `tabGroups` | Optional, requested on first use | Chrome shows an update warning for newly added required permissions. Requesting at first use avoids it |
| `offscreen` | Never | Not needed. The background writes a file through a data URL on Chromium and a blob URL on Gecko, and the clipboard is only ever written from a page: ADR-021 supersedes ADR-015 |
| `sessions` | Optional, requested from the Show recently closed button, since 1.1.0 | The browser's recently closed list, and reopening an entry with its history |
| Host permissions | None | Never needed. Export Tabs asking for `<all_urls>` is a review risk we will not repeat |

## 13. Capability matrix

### Table P9: Capability handling

| Capability | Chromium | Gecko | Fallback |
|---|---|---|---|
| Tab groups read and write | Chrome 89 and later, `tabs.group` needs no permission but `tabGroups` metadata does | Firefox 139 and later | Group membership restored without the permission, titles and colours reported as not applied, user notified once |
| Create a tab already discarded | Not supported on create. Create inactive then `tabs.discard` | `tabs.create({discarded:true})` | Create inactive without discarding |
| Window bounds and state on restore | `windows.create` with bounds, retry at 800 by 600 on rejection | Same | Open at default size |
| Containers, `cookieStoreId` | Absent | Supported | Field carried in the file, ignored on import |
| Window title preface | Absent | Supported | Window `name` shown in the TabsPack UI only |
| File write from the background, for a keyboard command | `data:` URL through the downloads API | Blob URL from the event page | The manager page opens and finishes the export |
| Clipboard | Page context only | Page context only | Nothing in the product copies from the background |
| File write | `downloads` API, or Blob plus object URL from a page | Same | Render JSON in a textarea to copy |

## 14. Risks

### Table P10: Risks, options, decisions

| Risk | Options | Decision |
|---|---|---|
| Large restore freezes the browser | (a) create all at once, (b) throttle plus discard beyond N, (c) lazy placeholder pages that load on click | (b) as default with N at 20, (c) available as a setting for very large files |
| Restricted URLs cannot be reopened | (a) drop silently, (b) keep in file and list on a placeholder page, (c) copy to clipboard | (b), with the count in the import report |
| Store review friction over `tabs` | (a) declare everything up front, (b) minimum required plus optional requests at first use | (b) |
| Format churn breaks other people's files | (a) no version field, (b) `schemaVersion` plus one migration per step, (c) freeze v1 forever | (b), with a published schema and a migration test per version |
| Firefox parity doubles the work | (a) Chrome first, Firefox later, (b) one source tree, two manifests, capability detection from day one | (b). The product name promises cross browser and retrofitting is more expensive |
| Browser APIs change under us | Adapter layer isolating every `browser.*` call, plus a cross browser test matrix | Adopted. All API access goes through `src/core/adapter`, nothing else touches `browser.*` |

## 15. Locked decisions

Full rationale in [docs/DECISIONS.md](docs/DECISIONS.md), now ADR-001 to ADR-022. Summary of ADR-001 to ADR-013: product name TabsPack, file extension `.tabspack.json`, TypeScript with esbuild, unknown fields ignored for behaviour and preserved on rewrite, no telemetry so no funnel metrics in v1, v1 ships to Chrome, Edge and Firefox together, snapshots in `storage.local` only, MIT licence and a public repository, import and export on a full extension page rather than the popup, foreign format adapters in v1 rather than deferred, plain text export with an optional titles toggle, snapshot retention as a soft cap that never auto deletes, and no new tab page override. ADR-014 to ADR-022 came out of building it: a purpose built lint script, the `offscreen` permission first deferred and then dropped entirely once a measurement showed the background can write a file without it, group membership kept when the groups API is absent, a hand written reader rather than a bundled validator, tabs that cannot be opened staying selected so the restore reports them, the tab groups permission requested from a visible button, one file importing as one pack, and the interface translated with the core's messages as its English fallback.

## 16. Success metrics

Constrained by the no telemetry decision, so every metric is either public or opt in.

- Store installs, weekly active users and ratings, from store dashboards.
- Issue reports of failed imports, by source format. Treated as the primary quality signal.
- Number of third party tools that read or write `.tabspack.json`. The only metric that tests the strategy.
- Green cross browser test matrix on every release.

## 17. Open questions

None outstanding. The three questions raised in this section on 2026-09-24 were closed the same day as ADR-011, ADR-012 and ADR-013 in [docs/DECISIONS.md](docs/DECISIONS.md): the plain text export includes titles behind a toggle, snapshot retention uses a soft cap with a warning and never auto deletes, and the new tab page is not overridden.

Earlier questions from plan v0.1 section 11, on distribution targets, snapshot storage, licence and naming, were answered on 2026-09-24 and are recorded as ADR-001, ADR-002, ADR-006, ADR-007 and ADR-008.

New questions are raised here and closed by a decision record. A question that sits here for more than a phase is itself a defect.
