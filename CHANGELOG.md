# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The file format has its own version, `schemaVersion` in [docs/SPEC.md](docs/SPEC.md), which moves independently of the extension version. Format changes are listed here under a Format heading.

## [Unreleased]

### Added

- Plan of record, `PLAN.md` v0.2, merging the BRD and PRD v0.9 with the engineering plan derived from reading the source of TabsDump, Export Tabs, Copy All URLs and Tab Session Manager
- `docs/SPEC.md`, the draft `tabspack` v1 format specification
- `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/DECISIONS.md`, `docs/LIMITATIONS.md`, `docs/PLAYBOOK.md`, `docs/TESTING.md`, `docs/CONTEXT_MAP.md`
- `docs/ROADMAP.md` as the north star document: a master backlog of 66 rows, 52 tasks across M0 to M5 and 14 backlog items with phase, bucket, problem and recommended solution, phase detail tables, exit tests and sequencing rules
- `.gitignore`, excluding local reference material and build output
- `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`, `LICENSE`
- Decision records ADR-001 to ADR-013, closing every open question in the plan

### Changed

- Product name fixed as TabsPack, and the file extension as `.tabspack.json`, superseding TabPack and `.tabpack` from v0.9

- `docs/DESIGN.md`, the design system and UX specification: tokens, component rules, popup and manager layouts, accessibility contract and copy style
- **M0 Foundation (T-001 to T-008).** TypeScript and esbuild build producing `dist/chrome` and `dist/firefox` from one source tree. Both MV3 manifests. The adapter boundary, with `scripts/lint.mjs` failing the build on any `browser.*` outside it. Capability probing with no browser name checks. Popup shell. Generated placeholder icons. Theme tokens for light and dark. CI on node 20 and 22
- **M1 Export (T-101 to T-110).** Collect windows, tabs and groups, honouring `pendingUrl` and skipping windows that cannot be restored. Deterministic serialization to `.tabspack.json`. The filter pipeline: scheme, pinned, wildcard exclude, dedupe and sort, with reindexing and opener remapping. File write through the downloads API with an anchor fallback, and clipboard copy. URL list and flat JSON one way exports. Export scope selector, badge and report on both surfaces. The fixture corpus and the performance harness
- `schema/tabspack.v1.schema.json`, generated from `src/types/tabspack.ts`. `npm run schema:check` fails the build if it is edited by hand
- 55 unit tests, 19 conformance fixtures, 2 performance budgets, and `npm run smoke` for a 13 check pass against a real Chromium
- Decision records ADR-014 to ADR-016: a purpose built lint script rather than eslint, the `offscreen` permission deferred until something uses it, and group membership preserved when the tab groups API is absent

- **M2 Import and restore (T-201 to T-209).** Validation with a JSON path and a suggested fix on every failure, and a version gate that refuses a future file by name. Unknown field retention proved byte for byte. The manager page gains an import task: drag and drop or a picker, a virtualised preview tree of windows, groups and tabs with per row selection, and the restore controls. The restore engine: throttled creation, discarding beyond a threshold, pinned ordering, groups as a second pass, window bounds with a retry, the active tab last, and a report counting restored, skipped, duplicate, unopenable and ungrouped tabs. Addresses no extension may open are listed on a placeholder page as inert text. A migration registry, empty by design, with a fixture pair driving it
- The round trip harness, `test/tools/roundtrip.ts`: export, import, restore into a writable fake browser, export again, compare field by field. The documented exceptions are in `docs/TESTING.md` Table X3
- Decision records ADR-017 to ADR-019: a hand written reader rather than a bundled validator, tabs that cannot be opened stay selected so the restore can report them, and the tab groups permission requested by a visible button

- **M3 Selection and foreign formats (T-301 to T-310).** Eight readers for other tools' files, detected by document shape and never by file name: Tab Session Manager, Session Buddy JSON, any CSV with a URL column, OneTab, lists of addresses, Markdown link lists, browser bookmark files and flat JSON arrays. Each declares what it could not carry, and the preview says so before anything is restored. Search across title and address in the preview, with select all and select none acting on what the search shows. The filter controls reach the interface: order, reverse and a wildcard exclude list, all persisted
- Decision record ADR-020: one file imports as one pack, and a file holding several saved sessions says so

- **M4 Snapshots (T-401 to T-405).** Sessions saved inside the extension, with a metadata index and one body per snapshot so listing fifty of them stays cheap. Rename, tag, export to a file, add a file as a snapshot without opening anything, and a two press delete that removes the body as well as the entry. A snapshot opens in the same preview as a file, so there is one path that opens tabs. Storage use is shown against a ten megabyte soft cap with a warning at eighty percent, and nothing is ever deleted automatically
- **Keyboard commands (T-404).** Export all windows, export this window, save a snapshot. The export commands write the file from the background: a blob URL where the engine has one, a data URL where it does not, and the manager page for a pack too large for either
- Decision record ADR-021, superseding ADR-015: no offscreen document, because a Chromium service worker's downloads API accepts a data URL. That removed a whole execution context, a permission and about 35 KB from each package

- **M5 Ship (T-501 to T-506, T-508, T-510).** An options page that writes every setting as it changes, including the restore policy and a light, dark or system theme. Translation: 200 strings in `_locales/en`, three lint rules holding the promise, and the interface reading every one of them from there. A generated icon set and store tiles from one SVG. Issue and pull request templates that make an unfixable bug report hard to file. Store listings and the permission justifications, written from PLAN Table P8
- `npm run a11y` computes the contrast of 38 token pairs from the tokens themselves and fails the build on a regression. `npm run lint:amo` runs AMO's own linter over the Firefox package. `npm run perf:browser` measures NFR-001, NFR-004 and NFR-005 against the built package. `npm run smoke:firefox` installs that package in a real Firefox
- Decision record ADR-022: the interface is translated, and the core's validation messages are its English fallback, with the boundary visible in `src/ui/shared/wording.ts`

- **The popup, after a first look at it in a real Chrome.** Import now sits beside export in the launcher, so the two things the product does are both one click from the toolbar. It cannot open a file picker there, ADR-009, so it opens the manager already on the import task with the file button focused. The header icon is a settings gear and opens the options page, which is what an icon in that corner is read as

### Fixed

- A file input fired no event when the same file was chosen twice, so fixing a file and picking it again did nothing
- `--border-strong`, the colour that marks the edge of a text field, was 1.58 to 1 against the page in light and 1.99 to 1 in dark, well under the 3 to 1 that WCAG 1.4.11 requires of a control's own boundary. Found by the contrast check on its first run, and fixed in both themes
- The dark screenshots in the browser smoke run were taken inside the 120 ms colour transition, so a button still wore its light text and border and the shot read as a theme bug that was not there. The run waits for the transition now, and asserts a button's own ink and border in dark rather than trusting the page background
- Four defects a real browser found and no unit test could: `tabs.create` rejects the `title` property on Chromium, a `display: flex` rule defeated the `hidden` attribute, `tabs.group` needs no permission although its titles and colours do, and the preview silently deselected the tabs it was supposed to report

### Audited

A sweep of the whole codebase for dead code, gaps, races and claims the code does not keep.

- The runtime message router in the background was dead: every TabsPack page has the extension APIs itself. It is gone, with `sendMessage`, `onMessage` and the `UNHANDLED` sentinel, and `docs/ARCHITECTURE.md` section 7 now explains why contexts do not talk to each other
- Two settings written in the same millisecond lost one of them. Writes are serialised now
- A page that threw while wiring itself looked ready and did nothing. Every surface reports a failed start
- Selecting in a five thousand tab tree counted every descendant of every visible row, on every scroll. Counted once, kept, and the preview renders in about fifty milliseconds
- A refused storage write, which is what a full quota looks like, was an unhandled rejection with nothing on screen
- Bounded what was unbounded: the largest file the importer will read, the number and length of exclude patterns, and the number of issues one file can put on screen. All five limits are in `docs/LIMITATIONS.md` Table L5

### Measured

- NFR-001, on the built package in a real Chromium with 200 tabs open: the popup is interactive in 38 ms, median of ten runs, against a 150 ms budget
- NFR-004, restoring 200 tabs into four windows: no single block of the interface at all, against a 200 ms budget, over a 3.5 second restore
- NFR-005: a 5000 tab pack previews in 70 ms once the page is open, about a second from a cold page load, with roughly thirty rows in the document

### Notes

- The `tabspack` v1 format is frozen as of M1. A field change now follows [docs/PLAYBOOK.md](docs/PLAYBOOK.md) section 4
- Measured in a real Chromium: a 5000 tab pack previews in about a second with roughly 30 rows in the document, which is NFR-005
- Measured: 1000 tabs export in 4 ms and 279 KB, against budgets of 2000 ms and 400 KB
- Not yet verified by a human at a browser: the manual cross browser matrix in [docs/TESTING.md](docs/TESTING.md), and NFR-001, the 150 ms popup
- The original product document is preserved at `docs/history/TabPack_BRD_PRD_v0.9.md` and is superseded, not current
