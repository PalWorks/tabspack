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

### Notes

- The `tabspack` v1 format is frozen as of M1. A field change now follows [docs/PLAYBOOK.md](docs/PLAYBOOK.md) section 4
- Import and restore arrive at M2. The manager page ships without an import affordance rather than with a disabled one
- Measured: 1000 tabs export in 4 ms and 279 KB, against budgets of 2000 ms and 400 KB
- Not yet verified by a human at a browser: the manual cross browser matrix in [docs/TESTING.md](docs/TESTING.md), and NFR-001, the 150 ms popup
- The original product document is preserved at `docs/history/TabPack_BRD_PRD_v0.9.md` and is superseded, not current
