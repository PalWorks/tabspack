# TabsPack

**Export, move, share and restore browser tabs across browsers, using an open, offline first format.**

[![Status](https://img.shields.io/badge/status-1.0.0%20in%20review%2C%201.1.0%20built-yellow)](docs/ROADMAP.md)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![Spec](https://img.shields.io/badge/format-tabspack%20v1%20draft-lightgrey)](docs/SPEC.md)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-informational)](PLAN.md#5-browsers)

> **Project status: 1.0.0 is in review at the Chrome Web Store, and 1.1.0 is built and verified.** Milestones M0 to M9 are done. 1.1.0 adds the export preview, automatic snapshots, crash recovery and the snapshot tools, and is the first version Edge and AMO will receive. The extension exports your tabs to `.tabspack.json`, a URL list or the clipboard, imports a pack back, reads the export files of seven other tab tools, restores 200 tabs without taking the browser down, saves named snapshots, and has keyboard commands, settings, a theme and a translation layer. The cross browser matrix is green on Chrome, Edge and Firefox, there is a public site with the legal pages, and a support form that reaches us without a mail client.
>
> What is left is what a machine cannot do: [the manual checks](docs/MANUAL-CHECKS.md), the store submissions, which each need a developer account, and publishing the `tabspack` npm package. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
- **Filters** for duplicates, non web pages, pinned tabs, tab age, a wildcard exclude list and sorting, with every dropped tab named in the report.
- **See which tabs died months ago.** The export pane groups your open tabs by when you last looked at them, and can leave out anything untouched for a month, three months, six months or a year. It never guesses: a pinned tab is never called old, and a tab the browser gives no date for is counted separately and never dropped.
**Website:** <https://palworks.github.io/tabspack/> &nbsp;·&nbsp; **Privacy:** <https://palworks.github.io/tabspack/privacy/>

- **Your tabs never leave your machine.** No account, no sync, no telemetry, and no host permission at install, so out of the box TabsPack cannot reach any address. The one request it can make is a support message you write and press Send on, which the browser asks your permission for; `npm run lint` enforces that there is exactly one place in the source that can make it.
- **Import and preview** a pack before anything opens: a tree of windows, groups and tabs, with per row selection, that stays responsive at 5000 tabs.
- **Restore without freezing the browser.** Tabs are created inactive, in throttled batches, and unloaded by default, so a 200 tab pack costs almost nothing until you open a tab. The one tab you land on in each window loads, and the rest wait for you.
- **Suspended tabs come back as pages, not as placeholders.** A tab parked by The Great Suspender, Tiny Suspender, Auto Tab Discard or a fork of any of them is read back to the address it stands for, on export and on import, and the count is reported. Without this, a session full of suspended tabs exports as a list of pages no browser will reopen.
- **Told, never guessed.** Every validation failure carries the path into the file and a suggested fix, and every restore reports what was skipped, already open, ungrouped or impossible to open. Addresses no extension may open are listed on a page of their own instead of vanishing.

- **Import from other tools.** Tab Session Manager, Session Buddy JSON and CSV, OneTab, Markdown link lists, browser bookmark exports, flat JSON and plain lists of addresses, all detected by what is in the file rather than by its name. Each import states what the source format could not carry.
- **Search and select** in the preview, for taking part of a pack rather than all of it.

- **Snapshots**, saved locally, named and tagged, for the days when you do not want to think about where a file went. Export one to a file, or add a file as a snapshot without opening a single tab. Compare any snapshot with the one before it, tidy runs of identical ones, find the addresses that keep turning up, and combine several into one.
- **Automatic protection**, off until you turn it on. A recovery copy of your open tabs means a crash, or a browser that starts without your tabs, ends with TabsPack showing you what is missing and restoring it from the preview. Automatic snapshots run hourly, every four hours or daily, skip the times nothing changed, and keep the newest ten.
- **Preview what you export.** The export pane shows the tabs the file will hold, as the same tree the import preview uses, and a tab you untick is left out.
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

The JSON Schema has a canonical address, and it resolves:

<https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json>

The site serves the same bytes as `schema/` in this repository, and the build fails if the two disagree or if the schema's `$id` stops matching the path it is published at.

To read or write the format from code, the reference reader and writer are an npm package, [`packages/tabspack`](packages/tabspack/README.md), compiled from the extension's own source so the two cannot disagree:

```js
import { read, write, validate } from "tabspack";
```

## Architecture

One source tree, two manifests, no server, no network, one runtime dependency.

```
popup            launcher: counts, one click export, import hands off to the manager
manager page     everything else, on one rail: export, import and preview and
                 restore, snapshots, settings, support, about. All file work
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
| `npm run lint` | The project rules: adapter boundary, no `innerHTML`, no network outside one file, no unexplained `any`, exact manifest permissions, no deploy ids in a committed config, and the schema's `$id` matching the address the site publishes it at |
| `npm test` | Unit suite plus schema conformance over the fixture corpus |
| `npm run schema:check` | Fails if the generated schema no longer matches the types |
| `npm run perf` | The performance budgets in `test/tools/bench.ts` |
| `npm run smoke` | Loads the build into a real Chromium and drives both surfaces. Local only |
| `npm run fixtures`, `npm run assets` | Regenerate fixtures, the extension icons and Edge's store logo |
| `npm run store-art` | Photograph the built extension and compose the Chrome Web Store screenshots, tiles and store icon. `npm run store-art:compose` recomposes from the committed captures without a browser |
| `npm run pack` | Every store archive into `dist/artifacts/`: Chrome, Edge, the Firefox `.xpi` and the source zip AMO asks for |
| `npm run package:build`, `npm run package:test` | Build the `tabspack` npm package from the extension's own reader and writer, and prove the packed tarball works installed outside the repository |
| `npm run video` | Render the 30 second promo video and its YouTube thumbnail from the explainer and the store screens |
| `npm run icons:compare` | Renders every candidate in `assets/candidates/` at 16, 32, 48 and 128 in both themes. A mark is chosen at 16 px in a toolbar, not at 128 on a slide |

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
  MANUAL-CHECKS.md      the four checks a machine cannot do, and how to do them
  store/                the listing text and every answer a store asks for
  proposals/            explored but not yet agreed work
  history/              superseded documents, kept for provenance
store_listing.md        the store dashboard fields, SEO, GEO and AEO tuned
src/                    core, adapter, ui, background: see ARCHITECTURE.md
_locales/en/            every string the interface shows
assets/                 the mark, the generated icons and the store tiles
scripts/                build, lint, schema, tests, fixtures, assets, contrast,
                        budgets, and the real browser runs
schema/                 tabspack.v1.schema.json, generated from the types, and
                        published at the address it declares as its own $id
website/                the public site, rendered by scripts/gen-site.mjs and
                        committed, so what is served is what is in the repository
server/support-worker/  the Cloudflare Worker that carries a support message
test/                   unit suite, fake browser, fixtures and the bench
manifest.chrome.json    Chromium manifest
manifest.firefox.json   Gecko manifest
```

## Testing

Three properties get the test budget: a file round trips without loss, a malformed file fails with a message you can act on, and an old file still opens. The round trip test is defined precisely in [docs/TESTING.md](docs/TESTING.md), and passing it on Chrome, Edge and Firefox is what makes the product's central claim true.

```bash
npm run verify        # typecheck, lint, schema, site, 303 tests, contrast, budgets, both builds, AMO's linter, the npm package
npm run smoke         # 126 checks against the built extension in a real Chromium
npm run matrix -- --target=chrome|edge --headed --grant-groups --keys
                      # the cross browser matrix against the Chrome or Edge on this machine
npm run matrix:firefox -- --headed --grant-groups
                      # the same rows against the installed Firefox, through geckodriver
npm run smoke:firefox # installs the Firefox package in a real Firefox
npm run perf:browser  # NFR-001, NFR-004 and NFR-005 on the built package
```

Matrix totals, run headed on a virtual display with a window manager on 2026-09-26: **Chrome 27 of 27, Edge 27 of 27, Firefox 26 of 28 with 2 skipped, nothing failed.** The configuration is part of that result; the same tree headless and without the flags reports three failures that are all the rig rather than the product, and [docs/TESTING.md](docs/TESTING.md) says so beside the number.

Four things no run reaches, because they need a person: answering the browser's own permission prompt, a real suspender's parked page, a keystroke Firefox actually acts on, and whether it looks any good. They are written up with the keys to press in [docs/MANUAL-CHECKS.md](docs/MANUAL-CHECKS.md).

## Roadmap

| Milestone | Contents | State |
|---|---|---|
| M0 | Skeleton, build, both manifests, capability probe, CI | Done |
| M1 | Export, serialization, file naming, schema frozen | Done |
| M2 | Import, validation, preview, restore engine, import report | Done |
| M3 | Search in the preview, filters, foreign format adapters | Done |
| M4 | Local snapshots, hotkeys, badge | Done |
| M5 | Options, theme, i18n, packaging | Done, except the store submissions |
| M6 | Suspended tab recovery, and a restore that survives 200 tabs | Done |
| M7 | Everything a real user's first session found | Done |
| M8 | A support relay, and a public site with the legal pages | Done |

Release themes beyond v1, and the exit test for each milestone, are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation map

New here? Read in this order: this file, then [PLAN.md](PLAN.md), then [docs/DOMAIN.md](docs/DOMAIN.md), then [docs/SPEC.md](docs/SPEC.md), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/DESIGN.md](docs/DESIGN.md) before touching any interface. If you are an agent, [AGENTS.md](AGENTS.md) is mandatory. [docs/CONTEXT_MAP.md](docs/CONTEXT_MAP.md) says which file owns which question.

## Privacy

TabsPack sends nothing about your tabs anywhere. It has no account, no sync and no telemetry, it requests no host permission at install, and an export never contains cookies, tokens, form data or storage contents. The single exception is the Support pane's Send button, which sends the message you wrote after your browser has asked you. See [PRIVACY.md](PRIVACY.md), which is also the privacy policy the stores require.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Vulnerability reports go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Licence

MIT. See [LICENSE](LICENSE). The specification is covered by the same licence, deliberately, so that anyone can implement it.

## Acknowledgements

This plan exists because other people published their work. Tab Session Manager by sienori set the fidelity bar and contributed the window creation fallback, the optional `tabGroups` permission trick and favicon compression. Copy All URLs contributed the filter pipeline, the wildcard exclude list and the `pendingUrl` fallback for unloaded tabs. TabsDump and Export Tabs showed, by their absence of an importer, exactly what was missing. Session Buddy set the expectation for restore speed.
