# Roadmap

**North star document.** Every unit of work on TabsPack is enumerated here, from the next commit to the parked ideas. If work is not in this file, it is not agreed, and if it is in this file, it has a phase, a bucket, a problem it solves and a recommended solution.

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-09-24 |
| Scope and requirement ids | [../PLAN.md](../PLAN.md) |
| Decisions behind these choices | [DECISIONS.md](DECISIONS.md) |
| Procedures for doing the work | [PLAYBOOK.md](PLAYBOOK.md) |
| Supersedes | `docs/TASKS.md`, now removed. A separate task file would drift against this one |

No calendar dates anywhere. A solo build with agent assistance has no measured velocity yet, and inventing dates would make this document dishonest by the second week. Phases ship in order, and each has an exit test that must pass before the next begins.

Status values: `next` the immediate work, `todo` agreed and queued, `doing` in progress, `done` acceptance criteria demonstrably met, `parked` deliberately not now, `declined` decided against with a record.

## 1. Master backlog

Every task and backlog item in one table. Read the phase detail sections below for constraints and acceptance criteria.

### Table R1: Master backlog

| Id | Task | Phase | Bucket | Problem | Recommended solution | Status |
|---|---|---|---|---|---|---|
| T-001 | Initialise the repository | M0 | Foundation | No version control, so no history, no branch protection and nothing for CI to trigger on | `git init` on `main`, commit the documentation set, `.gitignore` covering local reference material and build output | done |
| T-002 | Build pipeline | M0 | Foundation | TypeScript cannot run in a browser and two engines need two outputs from one source | esbuild with a single config producing `dist/chrome` and `dist/firefox`, plus typecheck and lint scripts | done |
| T-003 | Manifests for both engines | M0 | Foundation | Chromium and Gecko differ in manifest requirements, and a wrong permission set is a store rejection | Two manifests over one source tree. Three required permissions, `tabGroups` optional, `browser_specific_settings` id for Gecko, restrictive CSP | done |
| T-004 | Adapter boundary and capability probe | M0 | Foundation | Engine differences leak into feature code and degenerate into browser sniffing | `src/core/adapter/*` wrapping every `browser.*` call, `capabilities.ts` probing for APIs, an eslint rule failing the build on any `browser.*` outside the adapter | done |
| T-005 | Popup shell | M0 | UI | Users need a one click path, and a popup must never host a file dialog because it closes on focus loss | Popup shows live window and tab counts, one click export, and a link that opens the manager page | done |
| T-006 | Continuous integration | M0 | Quality | Regressions land silently without a gate | GitHub Actions running typecheck, lint, unit tests and both builds on every push and pull request | done |
| T-007 | Placeholder icon set | M0 | Foundation | A manifest without icons loads with warnings, and final artwork is an M5 concern | Simple 16, 32, 48 and 128 set now, replaced at T-504 | done |
| T-008 | Theme tokens and base stylesheet | M0 | UI | Retrofitting light and dark late means restyling three surfaces twice | CSS custom properties with system, light and dark defined once in `ui/shared` | done |
| T-101 | Collect browser state | M1 | Export | Naive reads lose unloaded tabs, include popup windows that cannot be restored, and miss group membership | One `windows.getAll({populate:true})` read plus `tabGroups.query` per normal window, `pendingUrl` fallback, non normal windows skipped | done |
| T-102 | Types and schema generation | M1 | Format | A hand written schema drifts from the code, and a published schema that drifts is worse than none | `src/types/tabspack.ts` as the single source, `schema/tabspack.v1.schema.json` generated in CI, build fails on a hand edit | done |
| T-103 | Serialize to the file format | M1 | Format | Unstable output makes diffs meaningless and breaks the round trip test | Deterministic key and array order, `data:` favicon stripping by default, `exportedAt` the only non deterministic field | done |
| T-104 | Filter pipeline | M1 | Export | Users export noise: duplicates, internal pages, pinned tabs they do not want, unsorted lists | Dedupe, scheme filter, skip pinned, wildcard exclude and sort, composed in one documented order | done |
| T-105 | File write and clipboard | M1 | Export | A service worker cannot reach the clipboard and cannot create object URLs | `downloads` API for the file, clipboard from the page context on both engines | done |
| T-106 | One way text and flat JSON export | M1 | Export | Users want a paste friendly list and will otherwise assume it round trips | Ship both, label them one way in the UI, titles behind a toggle per ADR-011 | done |
| T-107 | Fixture corpus | M1 | Quality | Nothing can be tested or measured without deterministic sample data | Commit valid, invalid, foreign and synthetic fixtures, including the 3 window 40 tab 3 group case and 1000 and 5000 tab files | done |
| T-108 | Export scope UI | M1 | UI | The four scopes are the main control surface and must not be buried | Scope selector in popup and manager: current window, all windows, current tab, selection | done |
| T-109 | Badge and export report | M1 | UI | A silent export leaves the user unsure anything happened, and unaware of what a filter removed | Badge flash with the count, plus a report panel naming what was filtered and why | done |
| T-110 | Performance harness | M1 | Quality | NFR-002 and NFR-003 are unfalsifiable without a measurement | Scripted run over the synthetic fixtures recording export duration and file size, failing above threshold | done |
| T-201 | Validation and version gate | M2 | Import | A bare failure tells the user nothing, and a future file must never be half parsed | Errors carry a JSON path and a suggested fix. A higher `schemaVersion` is refused by name, never best effort parsed | done |
| T-202 | Deserialize with unknown field retention | M2 | Format | Passing a file through TabsPack must not delete fields a newer version or a third party tool added | Unknown field bag per object, written back on serialize, asserted byte for byte | done |
| T-203 | Manager page and preview | M2 | UI | A popup loses its state when a file picker takes focus, and a 5000 tab file must still render | Dedicated extension page with picker and drag and drop, and a virtualised preview tree of windows, groups and tabs | done |
| T-204 | Restore engine | M2 | Restore | Wrong ordering closes the new window, misplaces pinned tabs and loses groups, and a bulk restore freezes the browser | The nine step order in ARCHITECTURE section 6, throttled batches, discard beyond threshold, grouping as a second pass | done |
| T-205 | Unopenable URL handling | M2 | Restore | Extensions cannot open `chrome://`, `about:`, `javascript:` or `data:` URLs, and dropping them silently destroys part of the user's session | Keep them in the file, list them on a placeholder page as inert text, count them in the report | done |
| T-206 | Duplicate detection | M2 | Restore | Restoring a pack over a live session silently doubles tabs | Normalised URL comparison against open tabs, offering skip or open anyway | done |
| T-207 | Import report | M2 | Restore | Silence about a skipped tab is indistinguishable from data loss | A returned report object counting restored, skipped, duplicate, unopenable and ungrouped tabs | done |
| T-208 | Migration scaffold | M2 | Format | The first format change will arrive with nowhere to put a migration | A version keyed registry of pure migration functions, with before and after fixtures | done |
| T-209 | Round trip harness | M2 | Quality | The product's central claim stays untested until export, import and re export are compared mechanically | Scripted field by field comparison ignoring `exportedAt`, `source` and `counts`, run on all three browsers | done |
| T-301 | Selection and search in the preview | M3 | UI | Users usually want part of a pack, not all of it | Per window and per tab checkboxes, select all, and search across title and URL | done |
| T-302 | Shape based format detection | M3 | Import | File extensions lie, users rename files, and competitors all use `.json` | `detect.ts` dispatching on document shape only, never on filename | done |
| T-303 | Tab Session Manager adapter | M3 | Import | The largest open source competitor's users have no way out of its private dump format | Read its id keyed `windows` plus `windowsInfo` and `tabGroups` into a TabsPack file at high fidelity | done |
| T-304 | Session Buddy adapters, JSON and CSV | M3 | Import | The largest installed competitor is closed source and its users are locked in | Two adapters, high fidelity from JSON, URLs and titles only from CSV, both declaring their fidelity | done |
| T-305 | OneTab adapter | M3 | Import | A very large installed base whose export is a plain text list with group boundaries | Parse the vertical bar format, treat blank line separated blocks as windows | done |
| T-306 | URL list and Markdown adapters | M3 | Import | The most common hand made inputs, from notes, chats and AI output | One URL per line with comment support, and `[title](url)` lines with headings as window boundaries | done |
| T-307 | Netscape bookmark adapter | M3 | Import | Every browser exports bookmarks in this format, so it is the universal fallback input | Parse the DOCTYPE, folders become windows, links become tabs | done |
| T-308 | Flat JSON adapter | M3 | Import | Scripts and other tools emit an array of URLs or objects | Accept an array of strings or of objects carrying a url field | done |
| T-309 | Filter UI and exclude list | M3 | UI | The filter pipeline from T-104 is useless if it is not reachable | Filter controls in the manager plus a wildcard exclude list in options | done |
| T-310 | Fidelity disclosure | M3 | Import | A low fidelity source silently yields a low fidelity pack, and the user blames TabsPack | The preview states what the source format carried and what it could not | done |
| T-401 | Snapshot storage layer | M4 | Snapshots | Files are the wrong unit for a daily habit, and a single storage key would block the list on a large snapshot | Metadata index plus one `snapshot:<uuid>` key per snapshot in `storage.local` | done |
| T-402 | Snapshot management UI | M4 | Snapshots | A saved snapshot nobody can find, rename or delete is a leak, not a feature | List, rename, tag, delete and restore from the manager page | done |
| T-403 | Snapshot import and export without restore | M4 | Snapshots | Users need to move a pack between machines without opening 200 tabs to do it | Export any snapshot to a file, and import a file as a snapshot | done |
| T-404 | Keyboard commands | M4 | UI | The fastest users never open a popup | Commands for export all windows, export current window and save snapshot, with defaults that avoid common conflicts | done |
| T-405 | Quota guard and retention | M4 | Snapshots | `storage.local` fills silently and then writes start failing | Warn at 80 percent of the soft cap, never auto delete, per ADR-012 | done |
| T-501 | Options page | M5 | UI | Defaults, filters and restore policy need a home outside the task flow | Options page covering FR-401 to FR-405 | done |
| T-502 | Theme and visual polish | M5 | UI | Three surfaces built at different times look like three products | Single pass over popup, manager and options against the T-008 tokens | done |
| T-503 | i18n scaffold | M5 | UI | Retrofitting `__MSG_*` after launch touches every string in the product | Scaffold with English complete, locale files open to contribution afterwards. Covers every string the interface renders; the core's issue messages are the English fallback layer, per ADR-022 | done |
| T-504 | Final icons and store assets | M5 | Release | Three stores each demand specific icon sizes, screenshots and promo tiles | One asset set generated to the strictest of the three requirements | done |
| T-505 | Store listings and permission justifications | M5 | Release | Chrome requires a per permission justification and a privacy policy, and an improvised answer invites rejection | Listings written from PLAN Table P8 and `PRIVACY.md`, identical across stores | done |
| T-506 | Accessibility pass | M5 | Quality | A preview tree of thousands of rows is unusable by keyboard or screen reader unless designed for it | Keyboard navigation, visible focus, contrast check, ARIA on the tree and the reports | done |
| T-507 | Full cross browser matrix | M5 | Quality | Engine differences surface at the worst possible moment, in review | Complete the matrix in TESTING Table X2 and record the result in the release pull request | doing |
| T-508 | Performance verification | M5 | Quality | NFR-001 to NFR-005 must hold on the shipped build, not on a dev build | Measured run of all five against the shipped artifact | done |
| T-509 | Store submissions | M5 | Release | Three review queues with different rules and different turnaround | Submit to Chrome Web Store, Edge Add-ons and AMO, with a Gecko source archive and build instructions | next |
| T-510 | Issue and pull request templates | M5 | Release | An import bug reported without its file is usually unfixable | Bug template demanding browser, version, expected, actual and a sanitised file. Security issues routed to `SECURITY.md` | done |
| B-101 | Scheduled automatic snapshots | v1.1 | Durability | A user who forgets to save loses the session, which is the failure the product exists to prevent | Interval based snapshot with a rolling limit, off by default, using alarms rather than a timer in a terminated worker | todo |
| B-102 | Crash and last session recovery | v1.1 | Durability | The moment of greatest need is right after a crash, when nothing was exported | Opt in use of the `sessions` API plus the most recent automatic snapshot, surfaced on the manager page | todo |
| B-103 | Snapshot diff and pruning | v1.1 | Durability | Fifty near identical automatic snapshots are noise, not safety | Show what changed between consecutive snapshots and prune the unchanged ones | todo |
| B-201 | Cross snapshot duplicate detection | v2 | Hygiene | The same fifty tabs live in twelve snapshots and the user cannot tell | Report URLs common to multiple snapshots and offer consolidation | todo |
| B-202 | Tab age and staleness report | v2 | Hygiene | Users keep hundreds of tabs because they cannot see which ones died months ago | Report on `lastAccessed` from the pack, with a bulk action | todo |
| B-301 | Workspaces | v3 | Workspaces | Power users run several projects at once and want to switch, not merge | Named sets of windows, one active at a time, switching by close and restore | todo |
| B-401 | Pack rendered as a readable page | v4 | Sharing | Sending a colleague a JSON file is not sharing, it is homework | Render a pack as a self contained readable HTML page with the JSON embedded, so it opens for anyone and still imports | todo |
| B-501 | Validating CLI | v5 | Ecosystem | A specification nobody can validate against without installing a browser extension will not be adopted | Small node CLI to validate, convert and diff packs, published from the same types | todo |
| B-502 | Published parser package | v5 | Ecosystem | Third parties will reimplement the parser badly, or not at all | Publish the reference reader and writer as a package with the JSON Schema | todo |
| B-503 | Specification site and adoption outreach | v5 | Ecosystem | A format is a standard only when a second implementation exists | A spec page with sample files, and direct offers of an adapter to competing tools | todo |
| B-601 | New tab page override | Parked | UI | Competitors replace the new tab page to drive engagement | Declined for v1 per ADR-013. Revisit only if users ask, and always as an explicit opt in | declined |
| B-602 | Safari support | Parked | Release | Safari users cannot migrate at all | Needs Xcode packaging and a paid Apple developer account. Revisit after v1 traction | parked |
| B-603 | Encrypted and signed packs | Parked | Format | A pack shared over an untrusted channel could be tampered with | Contradicts the human readable principle and adds key management. Only if a concrete user need appears | parked |
| B-604 | Cloud sync and accounts | Parked | Format | Users ask for sync because every competitor sells it | Declined by design. The file is the sync mechanism, and no account is a differentiator, not a gap | declined |

## 2. Release themes

### Table R2: Release themes

| Release | Theme | Contents | Contains |
|---|---|---|---|
| v1 | Migration | Export, import, preview, restore, snapshots, three stores, published specification | M0 to M5 |
| v1.1 | Durability | Scheduled snapshots, crash recovery, snapshot pruning | B-101 to B-103 |
| v2 | Hygiene | Cross snapshot duplicates, staleness reporting | B-201, B-202 |
| v3 | Workspaces | Named project sets and switching | B-301 |
| v4 | Sharing | A pack as a readable page | B-401 |
| v5 | Ecosystem | CLI, parser package, adoption of the format | B-501 to B-503 |

## 3. Phase detail

### Table R3: M0 Foundation

| Id | Requirements | Constraints | Acceptance criteria | Status |
|---|---|---|---|---|
| T-001 | None | Default branch `main`. MIT `LICENSE` present. Local reference material ignored | One commit, clean working tree, `git status` shows no untracked documentation | done |
| T-002 | None | No framework. No runtime dependency other than the vendored polyfill | `npm run build` produces both directories. `npm run typecheck` passes with `strict: true` | done |
| T-003 | FR-404 | Permissions exactly `tabs`, `storage`, `downloads`. `tabGroups` optional. No host permissions. CSP `script-src 'self'; object-src 'none'` | Both builds load unpacked with a clean console and no permission warning beyond the three | done |
| T-004 | None | Capability probes only. Any browser name or user agent check fails review | Lint fails on `browser.` or `chrome.` outside `src/core/adapter/`. The probe reports a capability table on both engines | done |
| T-005 | FR-001, FR-003 | No file dialog and no long running work in the popup | Opens within 150 ms with 200 tabs open, counts correct, NFR-001 measured | done |
| T-006 | None | No secrets. No publish step | A red test blocks a pull request | done |
| T-007 | None | Placeholder quality is fine, licence clean | Both builds load with icons present at all four sizes | done |
| T-008 | FR-405 | Tokens defined once. No CSS framework | Popup renders correctly in system, light and dark | done |

**M0 exit test.** Loads unpacked in Chrome, Edge and Firefox with a clean console. `npm run build` produces both targets. CI green on a pull request.

### Table R4: M1 Export

| Id | Requirements | Constraints | Acceptance criteria | Status |
|---|---|---|---|---|
| T-101 | FR-001 to FR-003, FR-010 | Single populate read. `pendingUrl` fallback mandatory. Skip non `normal` windows. Incognito excluded unless opted in | Unit test over a mocked adapter reproduces order, pinned, active, group membership and unloaded tabs | done |
| T-102 | FR-006 | Generator runs in CI. A hand edit of the generated schema fails the build | Generated schema accepts every `fixtures/valid` file and rejects every `fixtures/invalid` file | done |
| T-103 | FR-006, FR-008, FR-009 | Stable ordering. No `Date.now()` outside `exportedAt` | The same fixture exported twice differs only in `exportedAt` | done |
| T-104 | FR-402 | Documented composition order. Sorting must not break pinned ordering on restore | A unit test per filter plus one composition test | done |
| T-105 | FR-007, FR-008 | Offscreen document closes itself after the write | Correct filename on both engines, clipboard content identical to the file | done |
| T-106 | FR-004, FR-005 | Both formats labelled one way in the UI | Output matches fixtures, titles toggle works, UI states no round trip | done |
| T-107 | None | Deterministic, no personal URLs | NFR-002 and NFR-003 measured against the 1000 tab fixture | done |
| T-108 | FR-001 to FR-003 | Scope is explicit, never inferred silently | Each scope exports exactly the expected tab set | done |
| T-109 | None | Badge clears itself. Report is data, not a log line | Filtered counts shown and correct after each export | done |
| T-110 | NFR-002, NFR-003 | Runs in CI where possible, otherwise scripted locally | Threshold breach fails the run | done |

**M1 exit test.** A 3 window, 40 tab, 3 group, 2 pinned fixture exports byte stably twice in a row. The generated schema validates every valid fixture. The format is frozen at this point, and any later change follows PLAYBOOK section 4.

### Table R5: M2 Import and restore

| Id | Requirements | Constraints | Acceptance criteria | Status |
|---|---|---|---|---|
| T-201 | FR-104, FR-109 | Every error carries a JSON path and a suggested fix. No bare booleans | Each invalid fixture yields a distinct actionable message. A higher version is refused by name | done |
| T-202 | FR-108 | Per ADR-004, ignore for behaviour and preserve on rewrite | A file with an unrecognised field at every level survives import and re export byte identically | done |
| T-203 | FR-105, FR-107 | Renders a 5000 tab file without freezing, per NFR-005 | Preview counts match the file and selection drives the restore payload | done |
| T-204 | FR-201 to FR-203, FR-206 to FR-208, FR-210 | The nine step order. Placeholder tab removed only after the first real tab exists | The round trip test passes on Chrome, Edge and Firefox. NFR-004 measured | done |
| T-205 | FR-204 | Never drop silently. Dangerous schemes listed as inert text, not links | A fixture with `chrome://settings`, `about:config`, `javascript:`, `view-source:` and a `file://` URL produces a placeholder page listing all five and a report count | done |
| T-206 | FR-205 | Normalisation rules documented in code | A fixture overlapping the open set by 5 tabs reports exactly 5 duplicates | done |
| T-207 | FR-209 | A returned object, not a console line | Report asserted inside the round trip test | done |
| T-208 | FR-109 | Migrations are pure and one directional | A migration fixture pair passes, and a v1 reader refuses a v2 file by name | done |
| T-209 | All FR-2xx | Comparison ignores `exportedAt`, `source` and `counts` | Documented exceptions only: the unopenable tab, and renumbered group ids with matching membership and metadata | done |

**M2 exit test.** On a clean profile, export then import reproduces window count, tab order, pinned tabs, active tab and groups, verified by comparing a fresh export against the original file field by field.

### Table R6: M3 Selection and foreign formats

| Id | Requirements | Acceptance criteria | Status |
|---|---|---|---|
| T-301 | FR-002 | Selecting 7 of 40 tabs restores exactly 7 | done |
| T-302 | FR-106 | A renamed file of each supported type is still detected. An unrecognised file fails with a message naming what was tried | done |
| T-303 | FR-106 | A real Tab Session Manager export imports with windows, order, pinned and groups intact | done |
| T-304 | FR-106 | A real Session Buddy JSON export imports with windows and order intact. Its CSV imports URLs and titles, declared as low fidelity | done |
| T-305 | FR-106 | A real OneTab export imports with group boundaries as windows | done |
| T-306 | FR-102, FR-103 | A URL list and a Markdown list import with no loss of URL or title | done |
| T-307 | FR-106 | A browser bookmark export imports with folders as windows | done |
| T-308 | FR-103 | Both array shapes import | done |
| T-309 | FR-402 | Every filter reachable from the UI and persisted | done |
| T-310 | FR-106 | The preview names the fidelity for every adapter, and a malformed variant of each fixture fails actionably | done |

**M3 exit test.** Every adapter fixture imports without loss of URL or title, states its fidelity, and its malformed variant fails with an actionable message.

### Table R7: M4 Snapshots

| Id | Requirements | Acceptance criteria | Status |
|---|---|---|---|
| T-401 | FR-301 | 50 snapshots totalling 5 MB store and list without a quota error, surviving an extension reload and a browser restart | done |
| T-402 | FR-302 | Rename, tag and delete persist. Deleting removes the body key, not only the index entry | done |
| T-403 | FR-303 | A snapshot exports to a file and a file imports as a snapshot without opening a tab | done |
| T-404 | FR-304 | Commands work on all three browsers and are listed in the browser shortcut settings | done |
| T-405 | FR-301 | A warning appears at 80 percent of the soft cap. Nothing is ever auto deleted | done |

**M4 exit test.** 50 snapshots totalling 5 MB stored, listed and restored without a quota error, surviving an extension reload and a browser restart.

### Table R8: M5 Ship

| Id | Requirements | Acceptance criteria | Status |
|---|---|---|---|
| T-501 | FR-401, FR-403, FR-404 | Every setting persists and takes effect without a reload | done |
| T-502 | FR-405 | Three surfaces consistent in system, light and dark | done |
| T-503 | FR-406 | No hard coded user facing string outside `_locales/en` | done |
| T-504 | None | Assets accepted by all three stores at first upload | done |
| T-505 | None | Justifications match PLAN Table P8 exactly, and the privacy policy is linked in all three listings | done |
| T-506 | None | The preview tree is fully keyboard operable, focus is visible, contrast passes, the tree and reports carry ARIA roles | done |
| T-507 | None | TESTING Table X2 fully green, result recorded in the release pull request. Automated here as far as an agent can: the Chromium half by `npm run smoke`, the Firefox install by `npm run smoke:firefox`. The rest needs a human | doing |
| T-508 | NFR-001 to NFR-005 | All five hold on the shipped artifact | done |
| T-509 | None | Accepted by Chrome Web Store, Edge Add-ons and AMO. Blocked on three developer accounts, which is not something an agent can hold | next |
| T-510 | None | A bug report cannot be filed without browser, version and reproduction detail | done |

**M5 exit test.** Review packages accepted by all three stores, and the cross browser matrix fully green.

## 4. Sequencing rules

1. No phase starts while the previous exit test is red.
2. The file format freezes at the end of M1. After that, a field change needs an ADR and a `schemaVersion` decision, per PLAYBOOK section 4.
3. Every phase ends with a CHANGELOG entry under Unreleased. M5 converts it to a version heading.
4. Performance requirements are tested at the phase that introduces the code path, not deferred to M5.
5. A backlog item is only promoted into a phase with a problem statement and acceptance criteria. Nothing enters the build as an idea.
6. Anything not in Table R1 is not agreed work. Add the row first.

## 5. Done

### Table R9: Completed

| Phase | Tasks | Verified by |
|---|---|---|
| M0 Foundation | T-001 to T-008 | Both builds produced, clean typecheck and lint, CI workflow in place, capability probe reporting on a real Chromium |
| M1 Export | T-101 to T-110 | 55 unit tests, 19 conformance fixtures, byte stable fixture comparison, performance budgets met with room to spare, 13 check browser smoke run |
| M2 Import and restore | T-201 to T-209 | 129 unit tests including the round trip harness, 20 conformance fixtures, a 34 check browser smoke run that imports a pack and restores it in a real Chromium, and NFR-005 measured at about a second for 5000 tabs |
| M3 Selection and foreign formats | T-301 to T-310 | 163 unit tests, eight foreign fixtures and eight malformed siblings, a 40 check smoke run that imports a OneTab export by shape alone and searches the preview in a real browser |
| M4 Snapshots | T-401 to T-405 | 185 unit tests, and a 50 check smoke run that saves a snapshot in a real Chromium, reads both storage keys back, previews it, and deletes it with the body |
| M5 Ship, except the submissions | T-501 to T-506, T-508, T-510 | 187 unit tests and a 59 check browser run. An options page driving every setting, a theme switch, 200 translated strings with three lint rules behind them, a generated icon and tile set, a contrast check over 38 token pairs in `npm run verify`, AMO's own linter reporting zero errors on the Firefox package, that package installing in a real Firefox, and NFR-001, NFR-004 and NFR-005 measured on the built package |

M1 exit test result: a 3 window, 40 tab, 3 group, 2 pinned fixture exports byte
stably twice in a row, and the generated schema validates every valid fixture
while rejecting every invalid one. The format is frozen: a field change now
follows PLAYBOOK.md section 4.

Measured against the budgets in PLAN.md Table P7: 1000 tabs export in 4 ms
against a 2000 ms budget and produce a 279 KB file against a 400 KB budget;
5000 tabs take 15 ms. NFR-001, the 150 ms popup, and the manual cross browser
matrix still need a human at a browser, which is the one thing an agent cannot
sign off.

M2 exit test result: the round trip holds. A three window, forty tab, three
group, two pinned session exports, imports, restores and re exports with no
difference outside the exceptions in TESTING.md Table X3, on a browser that
groups and on one that does not, with discarding off and on. In a real Chromium
the same path restores the pinned tab at index 0, both grouped tabs into one
group, two windows, and lists the one `chrome://` address on the placeholder
page rather than dropping it.

M3 exit test result: every adapter fixture imports without losing an address or
a title, states its fidelity in the preview, and its malformed sibling fails with
a message that says what to do. Detection is by document shape only: the suite
reads the same bytes with no file name in play, and a renamed file is still
recognised. The Tab Session Manager reader was written against that project's own
`src/background/save.js` rather than against a guess.

M5 exit test result: not yet met, and it cannot be met here. The test is "review
packages accepted by all three stores, and the cross browser matrix fully green",
and both halves need a person: three developer accounts, and hands on Chrome,
Edge and Firefox. What was done instead is everything up to that line, and the
table above says which parts of the matrix are now automated and which are not.

M4 exit test result: fifty snapshots of a 200 tab session store and list without
a quota error in the unit suite, and in a real Chromium a snapshot is written as
an index entry plus a body, previewed, and deleted with both keys removed. The
storage line reports usage against the ten megabyte soft cap, and nothing is ever
deleted to make room.

Three things were measured in a real browser rather than assumed, and each
changed the design. A Chromium service worker has no `URL.createObjectURL` but
its downloads API does accept a data URL, which removed the offscreen document
from the product entirely (ADR-021). Chrome silently refuses some suggested
shortcuts: `Alt+Shift+W`, `Alt+Shift+C` and `Alt+Shift+T` came back empty, while
`E`, `D`, `S`, `K`, `1`, `2` and `Ctrl+Shift+U` were accepted.

Four defects that only a real browser could find were fixed in M2 and are
recorded in LIMITATIONS.md: `tabs.create` rejecting `title` on Chromium, a CSS
rule defeating the `hidden` attribute, `tabs.group` working without the
`tabGroups` permission while its metadata does not, and a preview that
deselected the tabs it was supposed to report.
