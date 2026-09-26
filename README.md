# TabsPack

**Export, move, share and restore browser tabs across browsers, using an open, offline first format.**

[![Status](https://img.shields.io/badge/status-M5%20built%2C%20not%20yet%20submitted-yellow)](docs/ROADMAP.md)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Spec](https://img.shields.io/badge/format-tabspack%20v1%20draft-lightgrey)](docs/SPEC.md)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-informational)](PLAN.md#5-browsers)

> **Project status: export and import both work; nothing is published yet.** Milestones M0 to M5 are built, so the extension builds for Chromium and Gecko, exports your tabs to `.tabspack.json`, a URL list or the clipboard, imports a pack back, and reads the export files of other tab tools. It saves named snapshots locally, has keyboard commands, settings, a light and dark theme and a translation layer. What is left is the part an agent cannot do: the manual cross browser matrix, and submitting to three stores that each need a developer account. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is built and what is next. Features below marked *planned* are agreed targets, not shipped software.

## Contents

- [Why](#why)
- [What it does](#what-it-does)
- [The format](#the-format)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Documentation map](#documentation-map)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [Licence](#licence)
- [Acknowledgements](#acknowledgements)

## Why

Every tab tool optimises for reducing tabs, saving memory or turning tabs into bookmarks. None of them solves movement. Migrating browsers, backing up a research session, handing a colleague the 40 tabs from a meeting, recovering after a profile reset: all of these need a file you can read, keep and open somewhere else.

We read the source of four existing extensions before writing a line of this plan. Three of them, TabsDump, Export Tabs and Copy All URLs, are exporters with no working import. The fourth, Tab Session Manager, restores faithfully but persists its own internal session object, so its files are a private dump rather than an interchange format. There is no widely adopted open format for browser sessions comparable to CSV for tables, OPML for feeds or ICS for calendars.

TabsPack is that format, plus the reference extension that reads and writes it.

## What it does

Working today:

- **Export** the current window, all windows or the selected tabs, to `.tabspack.json`, a plain URL list or the clipboard.
- **Captured faithfully:** window position and state, tab order, pinned tabs, the active tab, muted and unloaded tabs, opener relationships, and tab groups with title, colour and collapsed state.
- **Filters** for duplicates, non web pages, pinned tabs, a wildcard exclude list and sorting, with every dropped tab named in the report.
- **Nothing leaves your machine.** No account, no sync, no telemetry, and no network request at all, which `npm run lint` enforces rather than promises.
- **Import and preview** a pack before anything opens: a tree of windows, groups and tabs, with per row selection, that stays responsive at 5000 tabs.
- **Restore without freezing the browser.** Tabs are created inactive, in throttled batches, and unloaded by default, so a 200 tab pack costs almost nothing until you open a tab. The one tab you land on in each window loads, and the rest wait for you.
- **Suspended tabs come back as pages, not as placeholders.** A tab parked by The Great Suspender, Tiny Suspender, Auto Tab Discard or a fork of any of them is read back to the address it stands for, on export and on import, and the count is reported. Without this, a session full of suspended tabs exports as a list of pages no browser will reopen.
- **Told, never guessed.** Every validation failure carries the path into the file and a suggested fix, and every restore reports what was skipped, already open, ungrouped or impossible to open. Addresses no extension may open are listed on a page of their own instead of vanishing.

- **Import from other tools.** Tab Session Manager, Session Buddy JSON and CSV, OneTab, Markdown link lists, browser bookmark exports, flat JSON and plain lists of addresses, all detected by what is in the file rather than by its name. Each import states what the source format could not carry.
- **Search and select** in the preview, for taking part of a pack rather than all of it.

- **Snapshots**, saved locally, named and tagged, for the days when you do not want to think about where a file went. Export one to a file, or add a file as a snapshot without opening a single tab.
- **Keyboard commands** for exporting all windows, exporting this window and saving a snapshot, with no page in the way.

- **Settings, a theme and translations.** Every default, filter and restore policy in one place, light or dark or whatever the system says, and every string the interface shows read from `_locales`.

Deliberately not in v1: cloud sync, accounts, encryption, AI features, bookmark management and scheduled saves. See [PLAN.md](PLAN.md) section 7.

## The format

A `.tabspack.json` file is UTF-8 JSON that a person can read and hand edit. Only `url` is mandatory on a tab.

```json
{
  "format": "tabspack",
  "schemaVersion": 1,
  "exportedAt": "2026-09-24T08:29:40+05:30",
  "windows": [
    {
      "id": "w1",
      "name": "Research",
      "state": "maximized",
      "groups": [{ "id": "g1", "title": "AI", "color": "blue", "collapsed": false }],
      "tabs": [
        { "index": 0, "url": "https://example.com/pinned", "title": "Pinned reference", "pinned": true },
        { "index": 1, "url": "https://example.com/a", "title": "Example A", "active": true, "groupId": "g1" }
      ]
    }
  ]
}
```

Two rules make it durable: a reader ignores fields it does not understand, and preserves them when it rewrites the file. The full normative description is in [docs/SPEC.md](docs/SPEC.md). It is MIT licensed and third party implementations are encouraged.

## Architecture

One source tree, two manifests, no server, no network, one runtime dependency.

```
popup            launcher: counts, one click export, import hands off to the manager
manager page     everything else, on one rail: export, import and preview and
                 restore, snapshots, settings, about. All file work
service worker   keyboard commands, badge, and writing a file when asked by one
placeholder page addresses a restore could not open, as inert text
```

Two models, deliberately: `TabsPackFile` is the public wire format, `Session` is the internal model, and only the serializer bridges them. Nothing outside `src/core/adapter/` may touch `browser.*`, which is what makes one codebase serve Chromium and Gecko. Details and the nine step restore order are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` | The published JSON Schema is generated from the types, and schema migrations are type checked |
| Build | esbuild | One config, no framework, no runtime bundler |
| Extension platform | Manifest V3 | Required by Chromium stores, supported by Firefox |
| Cross browser | `webextension-polyfill`, vendored | The only runtime dependency. Promises on Chromium, native on Gecko |
| UI | Plain HTML, CSS and ES modules | The UI is a list, a tree and a few buttons. A framework would be the largest thing in the bundle |
| Storage | `storage.local` | `storage.sync` cannot hold snapshots. See ADR-007 |
| Tests | node unit tests plus a manual cross browser matrix | `core/` is testable without a browser because of the adapter rule |

## Getting started

```bash
npm install
npm run build          # produces dist/chrome and dist/firefox
npm run verify         # typecheck, lint, schema check, tests, budgets, build
```

| Command | What it does |
|---|---|
| `npm run build` | Builds both targets. `--watch` for development |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | The project rules: adapter boundary, no `innerHTML`, no network, no unexplained `any`, exact manifest permissions |
| `npm test` | Unit suite plus schema conformance over the fixture corpus |
| `npm run schema:check` | Fails if the generated schema no longer matches the types |
| `npm run perf` | The performance budgets in `test/tools/bench.ts` |
| `npm run smoke` | Loads the build into a real Chromium and drives both surfaces. Local only |
| `npm run fixtures`, `npm run icons` | Regenerate fixtures and placeholder icons |

Then load it unpacked:

- Chrome or Edge: open `chrome://extensions`, enable Developer mode, Load unpacked, select `dist/chrome`
- Firefox: open `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, select `dist/firefox/manifest.json`

Full procedures, including release and rollback, are in [docs/PLAYBOOK.md](docs/PLAYBOOK.md).

## Project structure

```
PLAN.md                 single source of truth for scope and requirements
AGENTS.md               contract for AI agents and contributors
docs/
  SPEC.md               the .tabspack.json format, normative
  ARCHITECTURE.md       module layout, execution contexts, restore order
  DOMAIN.md             browser tab semantics and glossary
  ROADMAP.md            north star: every task and backlog item, phases and exit tests
  DECISIONS.md          architecture decision records
  LIMITATIONS.md        deliberate limits and browser constraints
  PLAYBOOK.md           how to build, add an adapter, change the format, release
  TESTING.md            test layers, fixtures, cross browser matrix
  CONTEXT_MAP.md        which file answers which question
  store/                the listing text and every answer a store asks for
  history/              superseded documents, kept for provenance
src/                    core, adapter, ui, background: see ARCHITECTURE.md
_locales/en/            every string the interface shows
assets/                 the mark, the generated icons and the store tiles
scripts/                build, lint, schema, tests, fixtures, assets, contrast,
                        budgets, and the real browser runs
schema/                 tabspack.v1.schema.json, generated from the types
test/                   unit suite, fake browser, fixtures and the bench
manifest.chrome.json    Chromium manifest
manifest.firefox.json   Gecko manifest
```

## Testing

Three properties get the test budget: a file round trips without loss, a malformed file fails with a message you can act on, and an old file still opens. The round trip test is defined precisely in [docs/TESTING.md](docs/TESTING.md), and passing it on Chrome, Edge and Firefox is what makes the product's central claim true.

```bash
npm run verify        # typecheck, lint, schema, 223 tests, contrast, budgets, both builds, AMO's linter
npm run smoke         # 70 checks against the built extension in a real Chromium
npm run matrix -- --target=chrome|edge --headed --grant-groups --keys
                      # the cross browser matrix against the Chrome or Edge on this machine
npm run matrix:firefox -- --headed --grant-groups
                      # the same rows against the installed Firefox, through geckodriver
npm run smoke:firefox # installs the Firefox package in a real Firefox
npm run perf:browser  # NFR-001, NFR-004 and NFR-005 on the built package
```

[docs/TESTING.md](docs/TESTING.md) also says plainly what these runs **cannot** reach, which is where the remaining risk is: the interface in Firefox and Edge, a keyboard shortcut actually being pressed, a permission prompt being granted, and a restore with unloading on at scale.

## Roadmap

| Milestone | Contents | State |
|---|---|---|
| M0 | Skeleton, build, both manifests, capability probe, CI | Done |
| M1 | Export, serialization, file naming, schema frozen | Done |
| M2 | Import, validation, preview, restore engine, import report | Done |
| M3 | Search in the preview, filters, foreign format adapters | Next |
| M4 | Local snapshots, hotkeys, badge | Planned |
| M5 | Options, theme, i18n, store submissions | Planned |

Release themes beyond v1, and the exit test for each milestone, are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation map

New here? Read in this order: this file, then [PLAN.md](PLAN.md), then [docs/DOMAIN.md](docs/DOMAIN.md), then [docs/SPEC.md](docs/SPEC.md), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/DESIGN.md](docs/DESIGN.md) before touching any interface. If you are an agent, [AGENTS.md](AGENTS.md) is mandatory. [docs/CONTEXT_MAP.md](docs/CONTEXT_MAP.md) says which file owns which question.

## Privacy

TabsPack makes no network request. It has no account, no sync and no telemetry, and an export never contains cookies, tokens, form data or storage contents. See [PRIVACY.md](PRIVACY.md), which is also the privacy policy the stores require.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Vulnerability reports go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Licence

MIT. See [LICENSE](LICENSE). The specification is covered by the same licence, deliberately, so that anyone can implement it.

## Acknowledgements

This plan exists because other people published their work. Tab Session Manager by sienori set the fidelity bar and contributed the window creation fallback, the optional `tabGroups` permission trick and favicon compression. Copy All URLs contributed the filter pipeline, the wildcard exclude list and the `pendingUrl` fallback for unloaded tabs. TabsDump and Export Tabs showed, by their absence of an importer, exactly what was missing. Session Buddy set the expectation for restore speed.
