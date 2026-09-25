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

### Fixed

- Four defects a real browser found and no unit test could: `tabs.create` rejects the `title` property on Chromium, a `display: flex` rule defeated the `hidden` attribute, `tabs.group` needs no permission although its titles and colours do, and the preview silently deselected the tabs it was supposed to report

### Notes

- The `tabspack` v1 format is frozen as of M1. A field change now follows [docs/PLAYBOOK.md](docs/PLAYBOOK.md) section 4
- Measured in a real Chromium: a 5000 tab pack previews in about a second with roughly 30 rows in the document, which is NFR-005
- Measured: 1000 tabs export in 4 ms and 279 KB, against budgets of 2000 ms and 400 KB
- Not yet verified by a human at a browser: the manual cross browser matrix in [docs/TESTING.md](docs/TESTING.md), and NFR-001, the 150 ms popup
- The original product document is preserved at `docs/history/TabPack_BRD_PRD_v0.9.md` and is superseded, not current
