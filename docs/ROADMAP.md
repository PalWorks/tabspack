# Roadmap

**North star document.** Every unit of work on TabsPack is enumerated here, from the next commit to the parked ideas. If work is not in this file, it is not agreed, and if it is in this file, it has a phase, a bucket, a problem it solves and a recommended solution.

| Field | Value |
|---|---|
| Version | 1.6 |
| Date | 2026-09-26 |
| Scope and requirement ids | [../PLAN.md](../PLAN.md) |
| Decisions behind these choices | [DECISIONS.md](DECISIONS.md) |
| Procedures for doing the work | [PLAYBOOK.md](PLAYBOOK.md) |
| Supersedes | `docs/TASKS.md`, now removed. A separate task file would drift against this one |

No calendar dates anywhere. A solo build with agent assistance has no measured velocity yet, and inventing dates would make this document dishonest by the second week. Phases ship in order, and each has an exit test that must pass before the next begins.

## 1. Master backlog

Every task and backlog item, in one place and in order. Read the phase detail
sections below for constraints and acceptance criteria.

The split is by state: **Table R1 is what is left**, and Table R1b is
everything already closed, kept because a roadmap that deletes its history
stops being able to answer "why is it like this".

Table R1 is sorted by rank, cheapest win first. Table R1b is sorted by id,
because a closed row is history and history reads in order.

### How an id is made

There is no cleverness in the number. The letter is the only part that carries
meaning, and it answers one question: has this been agreed into the build?

| Prefix | Means | Where it lives | Example |
|---|---|---|---|
| `T-` | **Task.** Agreed work on a numbered milestone. It has a phase, acceptance criteria in section 3, and a test or a check that proves it | Phases `M0` to `M8` | `T-509` Store submissions |
| `B-` | **Backlog.** An idea for after v1. Not agreed, no acceptance criteria yet. Sequencing rule 5 says it cannot enter the build until somebody writes both | Releases `v1.1` to `v5`, or `Parked` | `B-101` Scheduled snapshots |

The digits are a serial, allocated in the order the row was written down, and
they are **not** a phase number. `T-717` was the seventeenth row of the T-7
series and belongs to phase M5; `T-511` was written into a gap in the T-5
series and belongs to M7. The Phase column is the authority on when a row
happens, and the Rank column on what to pick up first. The `B-` hundreds do
follow the release, from `B-1xx` in v1.1 to `B-6xx` parked, but that is a
convenience, not a rule to lean on.

**A promoted row keeps its id.** When a `B-` row is agreed into the build it
gains a phase and acceptance criteria, and it does not become a `T-`. `B-202`
shipped in M5 and is still `B-202`, because renumbering it would break every
reference for the sake of a letter. The prefix then records where the row came
from, which is worth knowing: it says this started as an idea rather than as
planned work.

The prefixes stay because they are load bearing. Measured on 2026-09-26, the
ids appear **472 times across 83 files**: in code comments next to the line
that implements them, in test names, in ADRs, in the pull request template, and
in fourteen commit subjects that can never be rewritten on a published branch.
Renumbering would buy a shorter id and cost every one of those references, with
git history left pointing at numbers that no longer exist. The count only ever
goes up, which is the argument rather than the number. ADR-042.

### Table R1: Open work

10 rows. Status values: `next` the immediate work, `todo` agreed
and queued, `doing` in progress, `for a person` blocked on a human rather than
on effort, `parked` deliberately not now.

**Effort** is engineering time for one person with agent assistance, and it is
a size not a date: `Small` under a day, `Medium` a few days, `Large` a week or
more, `Extra large` a milestone of its own. **Impact** is how much the row changes what a user
actually gets: `Critical` blocks the release, `High` is a reason somebody would
install or keep it, `Medium` is a real improvement to something that already
works, `Low` is worth doing and nobody would miss it.

Both are judgements, written down so they can be argued with a row at a time
rather than in the abstract. Rows closed before they were ever estimated carry
`--`: inventing an estimate after the fact is hindsight dressed as planning.
Rows that were estimated keep the estimate when they close.

**Date raised** is the day the row entered this document, not the day the
problem started existing. Most of the backlog arrived with the roadmap on
2026-09-24; the M6 rows came out of the first real export on 2026-09-25, and
the M7 and M8 rows out of the maintainer's own session on 2026-09-26. A row
that has been open a long time is worth a second look, which is the only
reason the column is here.

**Rank** is the pick up order, and it puts the low hanging fruit at the top.
It is computed, not chosen: `impact / effort`, with `Critical 4, High 3,
Medium 2, Low 1` over `Small 1, Medium 2, Large 4, Extra large 8`. A tie goes to the higher impact,
then to the lower id. So rank 1 is the largest return for the least work
currently on the board, and rank 15 is the most work for the least return.

The arithmetic is deliberately dumb, because that makes it arguable. To move a
row up the list, change its Effort or its Impact and say why in the same
commit. Nobody gets to promote a row by preferring it. Two things the rank
does not know: a dependency, which sequencing rule 1 and the Problem column
carry instead, and who can do the work, which is what `for a person` in Status
means. Rank 1 is a human's twenty minutes, not an agent's.

Problem and solution are the last two columns because they are the long ones.
Everything you scan for, a rank, an id, a size and a state, is to the left of
them and stays readable without scrolling.

| Rank | Id | Date raised | Task | Phase | Bucket | Effort | Impact | Status | Problem | Recommended solution |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | T-507 | 2026-09-24 | Full cross browser matrix | M5 | Quality | Small | High | for a person | Engine differences surface at the worst possible moment, in review | Automated in `npm run matrix`. Re-run 2026-09-26 against the tree as it ships, headed on a virtual display with a window manager and with `--grant-groups --keys`: **Chrome 27/27, Edge 27/27, Firefox 26 of 28 with 2 skipped, nothing failed**. Re-run 2026-09-28 against 1.1.0 the same way: **Chrome 30/30, Edge 30/30, Firefox 26 of 28 with 2 skipped, nothing failed**, the new rows being the three recovery rows. Four rows are left that only a person can do, and the twenty minute checklist for them is [MANUAL-CHECKS.md](MANUAL-CHECKS.md). **2026-09-28**: the checklist grew by the export preview and a killed browser recovery check, about thirty minutes |
| 2 | T-509 | 2026-09-24 | Store submissions | M5 | Release | Medium | Critical | next | Three review queues with different rules and different turnaround | Submit to Chrome Web Store, Edge Add-ons and AMO, with a Gecko source archive and build instructions. **Staged 2026-09-26**: version at 1.0.0, four audited packages in `dist/artifacts/`, the Chrome credentials verified read only, and the exact upload call written down in [store/submission.md](store/submission.md) Table T6. Blocked on three things a person has to do: the maintainer's go for a public listing under their own account, an Edge account, and an AMO account. **2026-09-28**: Chrome 1.0.0 resubmitted after a keyword spam rejection (Yellow Argon, other products named in the description), and in review. By the maintainer's decision the next release, 1.1.0, carries the export preview and M9 together, and is the first version Edge and AMO receive. The Firefox manifest now declares Mozilla's data consent, which AMO requires of new extensions |
| 3 | B-204 | 2026-09-26 | Archive the stale tabs, then close them | v2 | Hygiene | Medium | High | todo | Seeing which tabs died is only half of it. The user still closes three hundred tabs by hand, which is the work they came to avoid, and the obvious shortcut is the one destructive thing TabsPack would ever do | Export the tabs the age filter selects, and only once the file is on disk, close exactly those. Needs a confirmation naming the count, a guarantee that no tab closes before its bytes are written, and an undo that is the file itself. Blocked on nothing but care. B-202, ADR-044 |
| 4 | B-401 | 2026-09-24 | Pack rendered as a readable page | v4 | Sharing | Medium | High | todo | Sending a colleague a JSON file is not sharing, it is homework | Explored 2026-09-26: [proposals/web-surface.md](proposals/web-surface.md). Splits into a `/viewer/` on the site, which needs no store review and is also a free format converter, and an HTML export in the extension, which is the weaker half. The viewer reuses `src/core/` unchanged: one parser, two surfaces |
| 5 | B-503 | 2026-09-24 | Specification site and adoption outreach | v5 | Ecosystem | Medium | Medium | todo | A format is a standard only when a second implementation exists | Explored 2026-09-26: [proposals/web-surface.md](proposals/web-surface.md). `/spec/` generated from `docs/SPEC.md` so the two cannot drift, plus a resolvable schema URL, the example corpus and the conformance fixtures. The outreach half waits until there is a published extension to point at |
| 6 | B-301 | 2026-09-24 | Workspaces | v3 | Workspaces | Large | Medium | todo | Power users run several projects at once and want to switch, not merge | Named sets of windows, one active at a time, switching by close and restore |
| 7 | B-501 | 2026-09-24 | Validating CLI | v5 | Ecosystem | Medium | Low | todo | A specification nobody can validate against without installing a browser extension will not be adopted | Small node CLI to validate, convert and diff packs, published from the same types |
| 8 | B-602 | 2026-09-24 | Safari support | Parked | Release | Extra large | Medium | parked | Safari users cannot migrate at all | Needs Xcode packaging and a paid Apple developer account. Revisit after v1 traction |
| 9 | B-603 | 2026-09-24 | Encrypted and signed packs | Parked | Format | Large | Low | parked | A pack shared over an untrusted channel could be tampered with | Contradicts the human readable principle and adds key management. Only if a concrete user need appears |

### Table R1b: Closed

87 rows. `done` means the acceptance criteria were demonstrably
met; `declined` means decided against, with a record in
[DECISIONS.md](DECISIONS.md).

| Rank | Id | Date raised | Task | Phase | Bucket | Effort | Impact | Status | Problem | Recommended solution |
|---|---|---|---|---|---|---|---|---|---|---|
| -- | B-202 | 2026-09-24 | Tab age and staleness report | M5 | Hygiene | -- | -- | done | Users keep hundreds of tabs because they cannot see which ones died months ago, and `lastAccessed` was collected, serialized and in the schema but read by nothing | Promoted from v2 into M5 under sequencing rule 5, keeping its id. `src/core/staleness.ts` bands the scope by last use, the export pane states them before anything is written, and one filter drops tabs outside a chosen window. Off by default. A pinned tab and a tab with no timestamp are never stale. ADR-044 |
| -- | B-601 | 2026-09-24 | New tab page override | Parked | UI | -- | -- | declined | Competitors replace the new tab page to drive engagement | Declined for v1 per ADR-013. Revisit only if users ask, and always as an explicit opt in |
| -- | B-604 | 2026-09-24 | Cloud sync and accounts | Parked | Format | -- | -- | declined | Users ask for sync because every competitor sells it | Declined by design. The file is the sync mechanism, and no account is a differentiator, not a gap |
| -- | T-001 | 2026-09-24 | Initialise the repository | M0 | Foundation | -- | -- | done | No version control, so no history, no branch protection and nothing for CI to trigger on | `git init` on `main`, commit the documentation set, `.gitignore` covering local reference material and build output |
| -- | T-002 | 2026-09-24 | Build pipeline | M0 | Foundation | -- | -- | done | TypeScript cannot run in a browser and two engines need two outputs from one source | esbuild with a single config producing `dist/chrome` and `dist/firefox`, plus typecheck and lint scripts |
| -- | T-003 | 2026-09-24 | Manifests for both engines | M0 | Foundation | -- | -- | done | Chromium and Gecko differ in manifest requirements, and a wrong permission set is a store rejection | Two manifests over one source tree. Three required permissions, `tabGroups` optional, `browser_specific_settings` id for Gecko, restrictive CSP |
| -- | T-004 | 2026-09-24 | Adapter boundary and capability probe | M0 | Foundation | -- | -- | done | Engine differences leak into feature code and degenerate into browser sniffing | `src/core/adapter/*` wrapping every `browser.*` call, `capabilities.ts` probing for APIs, an eslint rule failing the build on any `browser.*` outside the adapter |
| -- | T-005 | 2026-09-24 | Popup shell | M0 | UI | -- | -- | done | Users need a one click path, and a popup must never host a file dialog because it closes on focus loss | Popup shows live window and tab counts, one click export, an import button that opens the manager on the import task, and a gear that opens settings |
| -- | T-006 | 2026-09-24 | Continuous integration | M0 | Quality | -- | -- | done | Regressions land silently without a gate | GitHub Actions running typecheck, lint, unit tests and both builds on every push and pull request |
| -- | T-007 | 2026-09-24 | Placeholder icon set | M0 | Foundation | -- | -- | done | A manifest without icons loads with warnings, and final artwork is an M5 concern | Simple 16, 32, 48 and 128 set now, replaced at T-504 |
| -- | T-008 | 2026-09-24 | Theme tokens and base stylesheet | M0 | UI | -- | -- | done | Retrofitting light and dark late means restyling three surfaces twice | CSS custom properties with system, light and dark defined once in `ui/shared` |
| -- | T-101 | 2026-09-24 | Collect browser state | M1 | Export | -- | -- | done | Naive reads lose unloaded tabs, include popup windows that cannot be restored, and miss group membership | One `windows.getAll({populate:true})` read plus `tabGroups.query` per normal window, `pendingUrl` fallback, non normal windows skipped |
| -- | T-102 | 2026-09-24 | Types and schema generation | M1 | Format | -- | -- | done | A hand written schema drifts from the code, and a published schema that drifts is worse than none | `src/types/tabspack.ts` as the single source, `schema/tabspack.v1.schema.json` generated in CI, build fails on a hand edit |
| -- | T-103 | 2026-09-24 | Serialize to the file format | M1 | Format | -- | -- | done | Unstable output makes diffs meaningless and breaks the round trip test | Deterministic key and array order, `data:` favicon stripping by default, `exportedAt` the only non deterministic field |
| -- | T-104 | 2026-09-24 | Filter pipeline | M1 | Export | -- | -- | done | Users export noise: duplicates, internal pages, pinned tabs they do not want, unsorted lists | Dedupe, scheme filter, skip pinned, wildcard exclude and sort, composed in one documented order |
| -- | T-105 | 2026-09-24 | File write and clipboard | M1 | Export | -- | -- | done | A service worker cannot reach the clipboard and cannot create object URLs | `downloads` API for the file, clipboard from the page context on both engines |
| -- | T-106 | 2026-09-24 | One way text and flat JSON export | M1 | Export | -- | -- | done | Users want a paste friendly list and will otherwise assume it round trips | Ship both, label them one way in the UI, titles behind a toggle per ADR-011 |
| -- | T-107 | 2026-09-24 | Fixture corpus | M1 | Quality | -- | -- | done | Nothing can be tested or measured without deterministic sample data | Commit valid, invalid, foreign and synthetic fixtures, including the 3 window 40 tab 3 group case and 1000 and 5000 tab files |
| -- | T-108 | 2026-09-24 | Export scope UI | M1 | UI | -- | -- | done | The four scopes are the main control surface and must not be buried | Scope selector in popup and manager: current window, all windows, current tab, selection |
| -- | T-109 | 2026-09-24 | Badge and export report | M1 | UI | -- | -- | done | A silent export leaves the user unsure anything happened, and unaware of what a filter removed | Badge flash with the count, plus a report panel naming what was filtered and why |
| -- | T-110 | 2026-09-24 | Performance harness | M1 | Quality | -- | -- | done | NFR-002 and NFR-003 are unfalsifiable without a measurement | Scripted run over the synthetic fixtures recording export duration and file size, failing above threshold |
| -- | T-201 | 2026-09-24 | Validation and version gate | M2 | Import | -- | -- | done | A bare failure tells the user nothing, and a future file must never be half parsed | Errors carry a JSON path and a suggested fix. A higher `schemaVersion` is refused by name, never best effort parsed |
| -- | T-202 | 2026-09-24 | Deserialize with unknown field retention | M2 | Format | -- | -- | done | Passing a file through TabsPack must not delete fields a newer version or a third party tool added | Unknown field bag per object, written back on serialize, asserted byte for byte |
| -- | T-203 | 2026-09-24 | Manager page and preview | M2 | UI | -- | -- | done | A popup loses its state when a file picker takes focus, and a 5000 tab file must still render | Dedicated extension page with picker and drag and drop, and a virtualised preview tree of windows, groups and tabs |
| -- | T-204 | 2026-09-24 | Restore engine | M2 | Restore | -- | -- | done | Wrong ordering closes the new window, misplaces pinned tabs and loses groups, and a bulk restore freezes the browser | The nine step order in ARCHITECTURE section 6, throttled batches, discard beyond threshold, grouping as a second pass |
| -- | T-205 | 2026-09-24 | Unopenable URL handling | M2 | Restore | -- | -- | done | Extensions cannot open `chrome://`, `about:`, `javascript:` or `data:` URLs, and dropping them silently destroys part of the user's session | Keep them in the file, list them on a placeholder page as inert text, count them in the report |
| -- | T-206 | 2026-09-24 | Duplicate detection | M2 | Restore | -- | -- | done | Restoring a pack over a live session silently doubles tabs | Normalised URL comparison against open tabs, offering skip or open anyway |
| -- | T-207 | 2026-09-24 | Import report | M2 | Restore | -- | -- | done | Silence about a skipped tab is indistinguishable from data loss | A returned report object counting restored, skipped, duplicate, unopenable and ungrouped tabs |
| -- | T-208 | 2026-09-24 | Migration scaffold | M2 | Format | -- | -- | done | The first format change will arrive with nowhere to put a migration | A version keyed registry of pure migration functions, with before and after fixtures |
| -- | T-209 | 2026-09-24 | Round trip harness | M2 | Quality | -- | -- | done | The product's central claim stays untested until export, import and re export are compared mechanically | Scripted field by field comparison ignoring `exportedAt`, `source` and `counts`, run on all three browsers |
| -- | T-301 | 2026-09-24 | Selection and search in the preview | M3 | UI | -- | -- | done | Users usually want part of a pack, not all of it | Per window and per tab checkboxes, select all, and search across title and URL |
| -- | T-302 | 2026-09-24 | Shape based format detection | M3 | Import | -- | -- | done | File extensions lie, users rename files, and competitors all use `.json` | `detect.ts` dispatching on document shape only, never on filename |
| -- | T-303 | 2026-09-24 | Tab Session Manager adapter | M3 | Import | -- | -- | done | The largest open source competitor's users have no way out of its private dump format | Read its id keyed `windows` plus `windowsInfo` and `tabGroups` into a TabsPack file at high fidelity |
| -- | T-304 | 2026-09-24 | Session Buddy adapters, JSON and CSV | M3 | Import | -- | -- | done | The largest installed competitor is closed source and its users are locked in | Two adapters, high fidelity from JSON, URLs and titles only from CSV, both declaring their fidelity |
| -- | T-305 | 2026-09-24 | OneTab adapter | M3 | Import | -- | -- | done | A very large installed base whose export is a plain text list with group boundaries | Parse the vertical bar format, treat blank line separated blocks as windows |
| -- | T-306 | 2026-09-24 | URL list and Markdown adapters | M3 | Import | -- | -- | done | The most common hand made inputs, from notes, chats and AI output | One URL per line with comment support, and `[title](url)` lines with headings as window boundaries |
| -- | T-307 | 2026-09-24 | Netscape bookmark adapter | M3 | Import | -- | -- | done | Every browser exports bookmarks in this format, so it is the universal fallback input | Parse the DOCTYPE, folders become windows, links become tabs |
| -- | T-308 | 2026-09-24 | Flat JSON adapter | M3 | Import | -- | -- | done | Scripts and other tools emit an array of URLs or objects | Accept an array of strings or of objects carrying a url field |
| -- | T-309 | 2026-09-24 | Filter UI and exclude list | M3 | UI | -- | -- | done | The filter pipeline from T-104 is useless if it is not reachable | Filter controls in the manager plus a wildcard exclude list in options |
| -- | T-310 | 2026-09-24 | Fidelity disclosure | M3 | Import | -- | -- | done | A low fidelity source silently yields a low fidelity pack, and the user blames TabsPack | The preview states what the source format carried and what it could not |
| -- | T-401 | 2026-09-24 | Snapshot storage layer | M4 | Snapshots | -- | -- | done | Files are the wrong unit for a daily habit, and a single storage key would block the list on a large snapshot | Metadata index plus one `snapshot:<uuid>` key per snapshot in `storage.local` |
| -- | T-402 | 2026-09-24 | Snapshot management UI | M4 | Snapshots | -- | -- | done | A saved snapshot nobody can find, rename or delete is a leak, not a feature | List, rename, tag, delete and restore from the manager page |
| -- | T-403 | 2026-09-24 | Snapshot import and export without restore | M4 | Snapshots | -- | -- | done | Users need to move a pack between machines without opening 200 tabs to do it | Export any snapshot to a file, and import a file as a snapshot |
| -- | T-404 | 2026-09-24 | Keyboard commands | M4 | UI | -- | -- | done | The fastest users never open a popup | Commands for export all windows, export current window and save snapshot, with defaults that avoid common conflicts |
| -- | T-405 | 2026-09-24 | Quota guard and retention | M4 | Snapshots | -- | -- | done | `storage.local` fills silently and then writes start failing | Warn at 80 percent of the soft cap, never auto delete, per ADR-012 |
| -- | T-501 | 2026-09-24 | Options page | M5 | UI | -- | -- | done | Defaults, filters and restore policy need a home outside the task flow | Options page covering FR-401 to FR-405 |
| -- | T-502 | 2026-09-24 | Theme and visual polish | M5 | UI | -- | -- | done | Three surfaces built at different times look like three products | Single pass over popup, manager and options against the T-008 tokens |
| -- | T-503 | 2026-09-24 | i18n scaffold | M5 | UI | -- | -- | done | Retrofitting `__MSG_*` after launch touches every string in the product | Scaffold with English complete, locale files open to contribution afterwards. Covers every string the interface renders; the core's issue messages are the English fallback layer, per ADR-022 |
| -- | T-504 | 2026-09-24 | Final icons and store assets | M5 | Release | -- | -- | done | Three stores each demand specific icon sizes, screenshots and promo tiles | One asset set generated to the strictest of the three requirements |
| -- | T-505 | 2026-09-24 | Store listings and permission justifications | M5 | Release | -- | -- | done | Chrome requires a per permission justification and a privacy policy, and an improvised answer invites rejection | Listings written from PLAN Table P8 and `PRIVACY.md`, identical across stores |
| -- | T-506 | 2026-09-24 | Accessibility pass | M5 | Quality | -- | -- | done | A preview tree of thousands of rows is unusable by keyboard or screen reader unless designed for it | Keyboard navigation, visible focus, contrast check, ARIA on the tree and the reports |
| -- | T-508 | 2026-09-24 | Performance verification | M5 | Quality | -- | -- | done | NFR-001 to NFR-005 must hold on the shipped build, not on a dev build | Measured run of all five against the shipped artifact |
| -- | T-510 | 2026-09-24 | Issue and pull request templates | M5 | Release | -- | -- | done | An import bug reported without its file is usually unfixable | Bug template demanding browser, version, expected, actual and a sanitised file. Security issues routed to `SECURITY.md` |
| -- | T-511 | 2026-09-26 | One page, not two | M7 | UI | -- | -- | done | A settings page of its own held a second widget for fifteen settings that already existed on Export and Import and wrote the same stored values. A user asked why there were two pages | One document, a rail of five: Export, Import, Snapshots, then Settings and About. Each setting lives once, with the task that uses it. ADR-028 |
| -- | T-601 | 2026-09-25 | `src/core/unsuspend.ts` | M6 | Core | -- | -- | done | A suspended tab reads as an extension page, so it is unopenable, dedupes against nothing and sorts under the suspender | Four rules read from the suspenders' own source, then a generic rule by shape. ADR-023 |
| -- | T-602 | 2026-09-25 | Two call sites | M6 | Core | -- | -- | done | A new export and a file already on disk are both wrong in the same way | Recovery before the filters on export, and at the import boundary for every format |
| -- | T-603 | 2026-09-25 | Counting and copy | M6 | UI | -- | -- | done | A rewritten address must never be silent | The export report and the file line both name the count |
| -- | T-604 | 2026-09-25 | The setting | M6 | UI | -- | -- | done | A rule that judges a shape needs an off switch | `recoverSuspended`, on by default, in Settings |
| -- | T-605 | 2026-09-25 | Preview | M6 | UI | -- | -- | done | The preview has to show what will open | The tree shows the recovered address, proven in the browser run |
| -- | T-606 | 2026-09-25 | Tests | M6 | Test | -- | -- | done | A rewrite of a user's session cannot be trusted to a reading of the code | 30 cases: every family, both legacy forms, the raw `uri=`, double wrapping, and twelve negatives |
| -- | T-607 | 2026-09-25 | Fixture | M6 | Test | -- | -- | done | The conformance corpus had no suspended pack | `test/fixtures/valid/suspended.tabspack.json`, five tabs, three of them recovered |
| -- | T-608 | 2026-09-25 | Browser proof | M6 | Test | -- | -- | done | Recovery has to survive the real thing | The smoke pack carries a suspended tab, and the restored window holds the page it stood for |
| -- | T-609 | 2026-09-25 | Unloaded restores | M6 | Core, UI | -- | -- | done | 50 to 200 pages loading at once is the moment the browser stops answering | `unloadRestored` on by default, flushed per batch with one batch of lag. ADR-024 |
| -- | T-610 | 2026-09-25 | The cross browser matrix, automated | M6 | Test | -- | -- | done | Table X2 was a list of things nobody had done, and the one row about unloading hid two defects | `scripts/matrix.mjs` and `scripts/matrix-firefox.mjs` drive real Chrome, Edge and Firefox. 26 rows on the Chromium family, 25 on Firefox |
| -- | T-611 | 2026-09-25 | What the matrix found | M6 | Core | -- | -- | done | A tab unloaded before its address commits loses it, and Chromium changes the id when it unloads | Wait for the address, follow the new id, recount the report from the browser. ADR-025 |
| -- | T-612 | 2026-09-25 | What the matrix still missed | M6 | Core, Test | -- | -- | done | `pendingUrl` was accepted as proof that a navigation had committed, which it disproves. On a real 50 tab session 47 of 48 tabs came back blank; every matrix row pointed at a refused local port, where the difference cannot show | Only a committed `url` counts, and a tab that has not committed is left loaded rather than unloaded. A slow server row in the matrix, and `commitReads` in the fake browser. ADR-026 |
| -- | T-613 | 2026-09-25 | The same defect on the other engine | M6 | Core, Test | -- | -- | done | Firefox refuses to create a pinned tab unloaded, and the capability probe read that one refusal as a verdict about the browser, so one pinned tab downgraded every tab after it. Those tabs then reported `about:blank` while navigating, which the new guard counted as a committed address | A pinned tab never asks to be created unloaded, and `about:blank` counts only for a tab that asked for it. Two matrix rows at 40 and 200 tabs, and a `gecko` mode in the fake browser. ADR-027 |
| -- | T-701 | 2026-09-26 | A success looks like a warning | M7 | UI | -- | -- | done | Any filter removing anything made the export report amber with a warning triangle, and dedupe is on by default, so a normal successful export looked like a problem | A written file is a success. Filters are detail. ADR-029 |
| -- | T-702 | 2026-09-26 | Group names lost on export | M7 | Core, UI | -- | -- | done | Without the optional permission the `browser.tabGroups` namespace does not exist, so the collector writes bare membership and the file loses every group name. The offer to grant it only ever existed on the import side | The callout on the export pane too, before the file is written, and a count of unnamed groups in the report. ADR-030 |
| -- | T-703 | 2026-09-26 | The permission notice was invisible | M7 | UI | -- | -- | done | An inline row at the bottom of a card below fifty rows of tree | A callout at the top of the pane: coloured bar, glyph, sentence, action. ADR-031 |
| -- | T-704 | 2026-09-26 | Export defaults, and a switch that lied | M7 | Core | -- | -- | done | Titles off made the text export unreadable. Favicons on cost 7 to 9 percent for something nothing reads. And clearing the favicon box removed only embedded icons, not the remote ones its label named | Titles on, favicons off, and off now means none. ADR-032 |
| -- | T-705 | 2026-09-26 | The drop target never got out of the way | M7 | UI | -- | -- | done | A poster sized dropzone above the thing the user came to look at | The intake folds to its summary line once a pack is loaded. ADR-031 |
| -- | T-706 | 2026-09-26 | An import that showed no list | M7 | UI | -- | -- | done, cause not confirmed | Reported once, not reproduced in 15 consecutive attempts on three real packs | Two causes removed: the preview is revealed before the tree measures itself, and a throw in the read reaches the screen instead of becoming an unhandled rejection. ADR-031 |
| -- | T-707 | 2026-09-26 | The toolbar said almost nothing | M7 | UI | -- | -- | done | A bare count in one colour, only for an export from the popup. An import set nothing, so a restore could finish behind three windows with no sign | A badge tone and a tooltip sentence, from every surface, through one module. ADR-033 |
| -- | T-708 | 2026-09-26 | "Unloaded" is the browser's word | M7 | UI | -- | -- | done | Users say suspended or asleep, not unloaded | "Asleep". Not "suspended", which already means a third party suspender's wrapper two panes away. ADR-033 |
| -- | T-709 | 2026-09-26 | Firefox refuses an unsigned build | M7 | Release | -- | -- | done | `about:addons` says "appears to be corrupt", which is about signing and does not say so | `npm run pack` builds every archive including the `.xpi` and the source zip, and the two routes that work are documented. ADR-034 |
| -- | T-710 | 2026-09-26 | Support and feedback | M7 | UI, Release | -- | -- | done | No way to reach us from inside the product | A Support pane. Composed in core, shown in full, handed to the user's mail client: no request, no key. ADR-035 |
| -- | T-711 | 2026-09-26 | A rating ask | M7 | UI | -- | -- | done | Nothing asks, and the obvious version of asking is the thing that makes people uninstall | Earned by use, three times in a lifetime, three answers, two of which end it. ADR-036 |
| -- | T-713 | 2026-09-26 | A mark that is not generic | M7 | Design | -- | -- | done | Three bars and a download arrow is the most generic possible extension icon | Chosen 2026-09-26: the maintainer's own illustration, a fan of tabs behind a window with a restore arrow. Two vector redraws were tried and both came out worse, so the raster is the master and `scripts/gen-assets.mjs` renders it down with a sharpening pass. ADR-041 |
| -- | T-714 | 2026-09-26 | Who made it | M7 | UI | -- | -- | done | Nothing on any surface says who is behind it | One quiet line at the foot of About, under the privacy paragraph. ADR-037 |
| -- | T-715 | 2026-09-26 | Send without a mail client | M7 | UI, Release | -- | -- | done | The Support pane's only route assumed a configured mail client, and a large share of people have none: pressing Send opened nothing | The relay in `server/support-worker/` holds the key; the extension asks for its host at the moment Send is pressed and falls back to the mail client on every failure. ADR-039 |
| -- | T-716 | 2026-09-26 | A public site | M7 | Release, Design | -- | -- | done | Nowhere to link a store listing to, and the privacy policy and terms had no stable public address | Ten pages on GitHub Pages, rendered from one layout by `scripts/gen-site.mjs` and committed, with two checkers and no third party requests. ADR-040 |
| -- | T-717 | 2026-09-26 | The format's canonical URL points nowhere | M5 | Format | -- | -- | done | `schema/tabspack.v1.schema.json` declared `$id: https://tabspack.dev/...` and tabspack.dev was never registered. A second implementer following the canonical address of the format found nothing, and anybody could have bought it | The `$id` is now `https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json`, the site publishes the schema at exactly that path, and `ruleSchemaId` fails the build on any of three drifts. The Gecko id moved to `tabspack@palworks.ai` in the same change. ADR-043 |
| -- | B-101 | 2026-09-24 | Scheduled automatic snapshots | M9 | Durability | Medium | High | done | A user who forgets to save loses the session, which is the failure the product exists to prevent | Interval based snapshot with a rolling limit, off by default, using alarms rather than a timer in a terminated worker. **Built 2026-09-28 in M9**, Table R14: off by default, hourly, four hourly or daily, an unchanged session writes nothing, and the newest N automatic snapshots are kept while older automatic ones are removed, ADR-047. Manual snapshots are never removed |
| -- | B-102 | 2026-09-24 | Crash and last session recovery | M9 | Durability | Large | High | done | The moment of greatest need is right after a crash, when nothing was exported | Opt in use of the `sessions` API plus the most recent automatic snapshot, surfaced on the manager page. **Built 2026-09-28 in M9**, Table R14 and ADR-048: a rolling recovery copy, set aside on each browser start and compared with what came back once the browser's own restore settles. A real loss is offered on the toolbar, in the popup and on the manager, and opens the preview. Proved in the matrix against a killed and relaunched browser, both ways |
| -- | B-103 | 2026-09-24 | Snapshot diff and pruning | M9 | Durability | Medium | Low | done | Fifty near identical automatic snapshots are noise, not safety | Show what changed between consecutive snapshots and prune the unchanged ones. **Built 2026-09-28 in M9**, Table R14: compare any snapshot with the one before, open the added or removed tabs in the preview, and tidy runs of unchanged snapshots after a confirmation that names them |
| -- | B-104 | 2026-09-28 | Recent sessions | M9 | Durability | Small | High | done | A user who wants yesterday's tabs back has one previous session, or a snapshot they remembered to take | Keep the last five browser sessions automatically, as an older tab suspender's session page does. **Built 2026-09-28 in M9**, Table R14 and ADR-049: each browser start adds the session that ended, a session with no change is not a new entry, and each can be previewed, exported, deleted or kept as a snapshot. With it, the recovery copy is on from install with no prompt, D2 as revised by the maintainer |
| -- | B-201 | 2026-09-24 | Cross snapshot duplicate detection | M9 | Hygiene | Medium | Low | done | The same fifty tabs live in twelve snapshots and the user cannot tell | Report URLs common to multiple snapshots and offer consolidation. **Built 2026-09-28 in M9**, Table R14: addresses in three or more snapshots, and combine selected snapshots into one with every address once. The originals are deleted only by a separate, confirmed action |
| -- | B-502 | 2026-09-24 | Published parser package | M9 | Ecosystem | Small | Low | done | Third parties will reimplement the parser badly, or not at all | Publish the reference reader and writer as a package with the JSON Schema. **Built 2026-09-28 in M9**, Table R14: `packages/tabspack`, compiled from the extension's own reader and writer, proved by `npm run package:test` from an installed tarball. **Published 2026-09-28** as [`tabspack` 1.0.0](https://www.npmjs.com/package/tabspack) by the company account `palworks`, with two factor approved in the browser. Checked after publishing: `npm install tabspack` in an empty project reads, writes and validates |


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

Phases are in order. **Table numbers are stable identifiers, not an order**: they
are cited from DECISIONS.md, TESTING.md and the changelog, so a table keeps its
number for life and a new one takes the next free number rather than pushing
everyone else along.

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
| T-507 | None | TESTING Table X2 green on real Chrome 154, Edge 153 and Firefox 156, by `npm run matrix` and `npm run matrix:firefox`, which drive the installed browsers rather than a downloaded one. Four rows remain for a person: the permission prompt, a real suspender, a Firefox keyboard command, and how it all looks | done |
| T-508 | NFR-001 to NFR-005 | All five hold on the shipped artifact | done |
| T-509 | None | Accepted by Chrome Web Store, Edge Add-ons and AMO, and the three listing URLs written into `LISTINGS` in `src/core/rating.ts` and the lint allowlist, which is what turns the rating ask on. Blocked on three developer accounts, which is not something an agent can hold | next |
| T-510 | None | A bug report cannot be filed without browser, version and reproduction detail | done |

**M5 exit test.** Review packages accepted by all three stores, and the cross browser matrix fully green.

### Table R11: M6 Recovery, after the first real session went through the product

Added 2026-09-25, from a real export: 34 tabs, of which 30 were parked by a tab
suspender and one was an `edge://` page, leaving 3 that would open anywhere.

| Id | What | Bucket | Problem | Solution | Status |
|---|---|---|---|---|---|
| T-601 | `src/core/unsuspend.ts` | Core | A suspended tab reads as an extension page, so it is unopenable, dedupes against nothing and sorts under the suspender | Four rules read from the suspenders' own source, then a generic rule by shape. ADR-023 | done |
| T-602 | Two call sites | Core | A new export and a file already on disk are both wrong in the same way | Recovery before the filters on export, and at the import boundary for every format | done |
| T-603 | Counting and copy | UI | A rewritten address must never be silent | The export report and the file line both name the count | done |
| T-604 | The setting | UI | A rule that judges a shape needs an off switch | `recoverSuspended`, on by default, in Settings | done |
| T-605 | Preview | UI | The preview has to show what will open | The tree shows the recovered address, proven in the browser run | done |
| T-606 | Tests | Test | A rewrite of a user's session cannot be trusted to a reading of the code | 30 cases: every family, both legacy forms, the raw `uri=`, double wrapping, and twelve negatives | done |
| T-607 | Fixture | Test | The conformance corpus had no suspended pack | `test/fixtures/valid/suspended.tabspack.json`, five tabs, three of them recovered | done |
| T-608 | Browser proof | Test | Recovery has to survive the real thing | The smoke pack carries a suspended tab, and the restored window holds the page it stood for | done |
| T-609 | Unloaded restores | Core, UI | 50 to 200 pages loading at once is the moment the browser stops answering | `unloadRestored` on by default, flushed per batch with one batch of lag. ADR-024 | done |

| T-610 | The cross browser matrix, automated | Test | Table X2 was a list of things nobody had done, and the one row about unloading hid two defects | `scripts/matrix.mjs` and `scripts/matrix-firefox.mjs` drive real Chrome, Edge and Firefox. 26 rows on the Chromium family, 25 on Firefox | done |
| T-611 | What the matrix found | Core | A tab unloaded before its address commits loses it, and Chromium changes the id when it unloads | Wait for the address, follow the new id, recount the report from the browser. ADR-025 | done |
| T-612 | What the matrix still missed | Core, Test | `pendingUrl` was accepted as proof that a navigation had committed, which it disproves. On a real 50 tab session 47 of 48 tabs came back blank; every matrix row pointed at a refused local port, where the difference cannot show | Only a committed `url` counts, and a tab that has not committed is left loaded rather than unloaded. A slow server row in the matrix, and `commitReads` in the fake browser. ADR-026 | done |
| T-511 | One page, not two | UI | A settings page of its own held a second widget for fifteen settings that already existed on Export and Import and wrote the same stored values. A user asked why there were two pages | One document, a rail of five: Export, Import, Snapshots, then Settings and About. Each setting lives once, with the task that uses it. ADR-028 | done |
| T-613 | The same defect on the other engine | Core, Test | Firefox refuses to create a pinned tab unloaded, and the capability probe read that one refusal as a verdict about the browser, so one pinned tab downgraded every tab after it. Those tabs then reported `about:blank` while navigating, which the new guard counted as a committed address | A pinned tab never asks to be created unloaded, and `about:blank` counts only for a tab that asked for it. Two matrix rows at 40 and 200 tabs, and a `gecko` mode in the fake browser. ADR-027 | done |

**M6 exit test.** The user's own export imports with 30 addresses recovered and
33 of its 34 tabs openable, the last being an `edge://` page no extension may
open. Met on 2026-09-25.

**M6 second exit test**, added the same day after T-612. A real 50 tab session
restores with every address intact: 48 opened, 0 blank, the 2 left being
extension pages no browser will let any extension open. Measured in Chrome 154
and Edge 153, not in a fake browser and not against a local port. Any pack whose
pages are real is the test; a pack whose pages resolve instantly is not.

### Table R13: M8 Reachable and public

Added 2026-09-26. Two things the product needed before it could be submitted to
a store: a support channel that works for people with no mail client, and a
public address for the listing, the privacy policy and the terms.

| Id | Requirements | Constraints | Acceptance criteria | Status |
|---|---|---|---|---|
| T-715 | Send a support message from inside the extension | No key may ship in the package. No host permission at install. Every failure must fall back, never dead end | The relay is deployed, the extension reaches it from a real browser, the message arrives with a body identical to what was on screen, and declining the permission still gets the message out | done |
| T-716 | A public site with the legal pages at stable addresses | No third party requests, on a site whose product claims it makes none. Every link relative, so the site can move | Ten pages live on GitHub Pages, every link and image resolving, structured data parsing, no horizontal overflow at 320 px, and zero requests to any other origin measured on the deployed site | done |

**M8 exit test.** A support message written in the shipped extension arrives in
the inbox, and the same message goes to the mail client when the permission is
declined. Every page of the site returns 200 and loads nothing from anywhere
else. Both verified against production on 2026-09-26.

### Table R14: M9 Durability and the format package

Promoted 2026-09-28 under sequencing rule 5, each keeping its id (ADR-042).
The decisions behind this phase are in
[proposals/next-six.md](proposals/next-six.md) Table P3b. It ships as one
release, 1.1.0.

| Id | Requirements | Constraints | Acceptance criteria | Status |
|---|---|---|---|---|
| B-502 | None | Built from the extension's own source files, no copy. Zero runtime dependencies. Nothing in it reaches `core/adapter/`, the interface or the worker | `npm install tabspack` in an empty project exposes `read`, `write`, `validate`, the types and `tabspack/schema.json`, in Node 18 or later. Every fixture behaves through the installed tarball as through the extension. The major version is `schemaVersion`. Proved by `npm run package:test` in CI. Published 2026-09-28 | done |
| B-101 | None | Off by default. `alarms` is the only new required permission. The worker holds no state in memory. Manual snapshots are never deleted by TabsPack | An interval setting of off, hourly, every four hours or daily. When due, a snapshot named for its time and tagged `auto` is written, unless the tabs are unchanged since the last automatic snapshot, when nothing is written. The newest N automatic snapshots are kept, N set by the user, default 10, and older automatic ones are removed, ADR-047. A worker terminated between alarms loses nothing | done |
| B-102 | None | On from install with no prompt, D2 as revised 2026-09-28, ADR-049. Was: off at install, offered after the first export. `sessions` stays optional and is asked for only when the user opens the recently closed list. Never restores on its own: DOMAIN business rule 4 | With the recovery copy on, one rolling record of the current session, at most a minute old, in a single storage key. On browser start, after the browser's own restore goes quiet, a meaningful loss (a whole window, or at least ten tabs and a fifth of the session) is offered on the toolbar, in the popup and on the manager, as a count and a time. Preview and restore opens the missing tabs, in their windows and groups, in the import preview. A clean restart the browser restored itself offers nothing. Proved in the real browser matrix with a killed and relaunched profile | done |
| B-103 | None | Pure comparison in `src/core/compare.ts`. Deleting is a confirmed action that names what it deletes | Any snapshot compares with the one before it: tabs added, removed, moved to another window and regrouped, each list openable in the import preview. Tidy finds runs of snapshots with no difference, keeps the newest of each run, names the rest, and deletes them only on confirmation | done |
| B-201 | None | Combining never deletes the originals on its own | An overlap view lists the addresses found in three or more snapshots, with how many and which. Combine saves the selected snapshots as one new snapshot with every address once: the newest one's windows, plus one window of addresses found only in older ones | done |
| B-104 | None | No new permission or alarm. Shares the recovery copy's checkbox. Never restores on its own: DOMAIN business rule 4 | Each browser start adds the ended session to a list of five, newest first, unless its tabs are the same as the entry before. Preview opens the import preview, Keep as snapshot makes an ordinary snapshot and removes it from the list, Export writes a TabsPack file, Delete asks twice | done |

## 4. Sequencing rules

1. No phase starts while the previous exit test is red.
2. The file format freezes at the end of M1. After that, a field change needs an ADR and a `schemaVersion` decision, per PLAYBOOK section 4.
3. Every phase ends with a CHANGELOG entry under Unreleased. M5 converts it to a version heading.
4. Performance requirements are tested at the phase that introduces the code path, not deferred to M5.
5. A backlog item is only promoted into a phase with a problem statement and acceptance criteria. Nothing enters the build as an idea.
6. Anything not in Table R1 is not agreed work. Add the row first.

## 5. What is left, and who has to do it

### Table R12: M7, from a real user's first proper session

Added 2026-09-26, from a review with the user after they ran the product on
their own tabs in Chrome, Edge and Firefox.

| Id | What | Bucket | Problem | Solution | Status |
|---|---|---|---|---|---|
| T-701 | A success looks like a warning | UI | Any filter removing anything made the export report amber with a warning triangle, and dedupe is on by default, so a normal successful export looked like a problem | A written file is a success. Filters are detail. ADR-029 | done |
| T-702 | Group names lost on export | Core, UI | Without the optional permission the `browser.tabGroups` namespace does not exist, so the collector writes bare membership and the file loses every group name. The offer to grant it only ever existed on the import side | The callout on the export pane too, before the file is written, and a count of unnamed groups in the report. ADR-030 | done |
| T-703 | The permission notice was invisible | UI | An inline row at the bottom of a card below fifty rows of tree | A callout at the top of the pane: coloured bar, glyph, sentence, action. ADR-031 | done |
| T-704 | Export defaults, and a switch that lied | Core | Titles off made the text export unreadable. Favicons on cost 7 to 9 percent for something nothing reads. And clearing the favicon box removed only embedded icons, not the remote ones its label named | Titles on, favicons off, and off now means none. ADR-032 | done |
| T-705 | The drop target never got out of the way | UI | A poster sized dropzone above the thing the user came to look at | The intake folds to its summary line once a pack is loaded. ADR-031 | done |
| T-706 | An import that showed no list | UI | Reported once, not reproduced in 15 consecutive attempts on three real packs | Two causes removed: the preview is revealed before the tree measures itself, and a throw in the read reaches the screen instead of becoming an unhandled rejection. ADR-031 | done, cause not confirmed |
| T-707 | The toolbar said almost nothing | UI | A bare count in one colour, only for an export from the popup. An import set nothing, so a restore could finish behind three windows with no sign | A badge tone and a tooltip sentence, from every surface, through one module. ADR-033 | done |
| T-708 | "Unloaded" is the browser's word | UI | Users say suspended or asleep, not unloaded | "Asleep". Not "suspended", which already means a third party suspender's wrapper two panes away. ADR-033 | done |
| T-709 | Firefox refuses an unsigned build | Release | `about:addons` says "appears to be corrupt", which is about signing and does not say so | `npm run pack` builds every archive including the `.xpi` and the source zip, and the two routes that work are documented. ADR-034 | done |
| T-710 | Support and feedback | UI, Release | No way to reach us from inside the product | A Support pane. Composed in core, shown in full, handed to the user's mail client: no request, no key. ADR-035 | done |
| T-711 | A rating ask | UI | Nothing asks, and the obvious version of asking is the thing that makes people uninstall | Earned by use, three times in a lifetime, three answers, two of which end it. ADR-036 | done |
| T-713 | A mark that is not generic | Design | Three bars and a download arrow is the most generic possible extension icon | The maintainer's own illustration, cleaned and rendered down with a sharpening pass. Two agent vector redraws were tried and both were worse. ADR-041 | done |
| T-714 | Who made it | UI | Nothing on any surface says who is behind it | One quiet line at the foot of About, under the privacy paragraph. ADR-037 | done |
| T-715 | Send without a mail client | UI, Release | The Support pane's only route assumed a configured mail client, and a large share of people have none: pressing Send opened nothing | The relay in `server/support-worker/` holds the key; the extension asks for its host at the moment Send is pressed and falls back to the mail client on every failure. ADR-039 | done |
| T-716 | A public site | Release, Design | Nowhere to link a store listing to, and the privacy policy and terms had no stable public address | Ten pages on GitHub Pages, rendered from one layout by `scripts/gen-site.mjs` and committed, with two checkers and no third party requests. ADR-040 | done |

**M7 exit test.** The user's own three exports import with every group named
once the permission is granted, a successful export reads as a success on every
surface, and the toolbar reports the outcome of an export and a restore started
from any surface. Verified in real Chrome 154, Edge 153 and Firefox 156.

### Table R10: The work an agent cannot finish

Most of this table was emptied on 2026-09-25 by `npm run matrix`, which drives
the installed Chrome, Edge and Firefox rather than a downloaded browser. What is
left is what a machine genuinely cannot do.

| Id | What | Why it needs a person |
|---|---|---|
| T-507 | Grant the `tabGroups` permission at the prompt | No driver can answer a browser's own prompt. `--grant-groups` exercises everything behind it |
| T-507 | Check a recovered suspended tab against the suspender that made it | The suspender has to be installed, and its pages exist only in a real profile |
| T-507 | Press a keyboard command in Firefox | The key arrives and the command does not fire on a virtual display. The same key fires the same command in Chrome and Edge, so the product is not what is in doubt |
| T-507 | Look at it | Nothing automated has an opinion about how it looks |
| T-509 | Submit to three stores | Three developer accounts, and the fee for one of them |

Everything up to those lines is done, and `docs/store/` holds the listing text and
every answer each store asks for, so the submissions are a sitting rather than a
piece of work.

The four `T-507` rows have a page of their own now:
[MANUAL-CHECKS.md](MANUAL-CHECKS.md), written so the sitting is twenty minutes
with one document open rather than an afternoon with three. It ends in Table M1,
where the result of each check goes. Every row of it reads `not yet`, which is
the honest state of a check nobody has done.

## 6. Done

### Table R9: Completed

| Phase | Tasks | Verified by |
|---|---|---|
| M0 Foundation | T-001 to T-008 | Both builds produced, clean typecheck and lint, CI workflow in place, capability probe reporting on a real Chromium |
| M1 Export | T-101 to T-110 | 55 unit tests, 19 conformance fixtures, byte stable fixture comparison, performance budgets met with room to spare, 13 check browser smoke run |
| M2 Import and restore | T-201 to T-209 | 129 unit tests including the round trip harness, 20 conformance fixtures, a 34 check browser smoke run that imports a pack and restores it in a real Chromium, and NFR-005 measured at about a second for 5000 tabs |
| M3 Selection and foreign formats | T-301 to T-310 | 163 unit tests, eight foreign fixtures and eight malformed siblings, a 40 check smoke run that imports a OneTab export by shape alone and searches the preview in a real browser |
| M4 Snapshots | T-401 to T-405 | 185 unit tests, and a 50 check smoke run that saves a snapshot in a real Chromium, reads both storage keys back, previews it, and deletes it with the body |
| M5 Ship, except the submissions | T-501 to T-506, T-508, T-510 | 190 unit tests and a 59 check browser run at the time. An options page driving every setting, a theme switch, 200 translated strings with three lint rules behind them, a generated icon and tile set, a contrast check over 38 token pairs in `npm run verify`, AMO's own linter reporting zero errors on the Firefox package, that package installing in a real Firefox, and NFR-001, NFR-004 and NFR-005 measured on the built package |
| M7 A real user's session | T-511, T-701 to T-714 | 247 unit tests and an 81 check browser run. A success that reads as a success, the tab groups permission offered where it is actually lost, a callout that can be seen, titles on and favicons off, an intake that folds away, a toolbar that reports from every surface, packaging for all three stores, a support form that sends no request, and a rating ask that stops by itself |
| M8 Reachable and public | T-715, T-716 | 260 unit tests and a 97 check browser run, with the matrix green on all three browsers. A support relay deployed at `tabspack-support.palworks.ai` and proven end to end from the shipped extension in a real browser, with the host asked for at the point of use and a fallback for every way it can fail. A ten page site on GitHub Pages, rendered from one layout and committed, loading nothing from any other server |
| M6 Recovery | T-601 to T-609 | 223 unit tests and a 70 check browser run. A suspender's wrapper read back to the page it stands for, on export and on import, from four named families and by shape for the rest, with every recovery counted. Restores create every tab unloaded by default, flushed per batch so a large restore never holds more than a batch loaded at once |
| M5 loose ends, before the first submission | T-717, B-202 | 275 unit tests, a 107 check browser run, and the matrix re-run against the shipping tree: Chrome 27/27, Edge 27/27, Firefox 26 of 28 with 2 skipped, nothing failed. The format's canonical URL points at us and resolves, guarded by a lint rule that was tested by breaking it three ways. Tab age reported from data the pack already carried, with a filter that is off by default and two exemptions: a pinned tab and a tab with no timestamp are never called old |

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

M5 exit test result: **half met, as of 2026-09-26.** The test is "review
packages accepted by all three stores, and the cross browser matrix fully
green".

The matrix half is green: Chrome 30 of 30, Edge 30 of 30, Firefox 26 of 28 with
2 skipped, nothing failed, on 2026-09-28 for 1.1.0, run headed on a display with a window manager and
with `--grant-groups --keys` against the tree that ships. The two skips and four
other rows still need a person, and they are in
[MANUAL-CHECKS.md](MANUAL-CHECKS.md) with the keys to press. Every row of that
page's results table currently reads `not yet`.

The store half is not met and cannot be met from here. Version 1.0.0 is built,
packaged and audited, the Chrome Web Store credentials are verified, and the
exact upload call is written down in [store/submission.md](store/submission.md)
Table T6. What is missing is the maintainer's go for a public listing under
their own account, an Edge Add-ons account and an AMO account. Two of those
three do not exist yet.

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
