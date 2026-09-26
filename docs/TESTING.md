# Testing

As of the end of M7: 247 unit tests, the number `npm test` reports, with 21
conformance fixtures, 16 foreign format fixtures, 38 contrast pairs, 2
performance budgets in node and 3 more measured in a browser, and an 81 check
browser run that covers export, import, restore,
search, snapshots, the settings pane and the theme. The contract below is what
they are for.

## Philosophy

Three properties decide whether this product is trustworthy, so they get the test budget: a file round trips without loss, a malformed file fails with a useful message, and an old file still opens. Everything else is secondary.

The browser APIs are wrapped by `src/core/adapter/*` for exactly this reason: `core/` is testable in node against a mocked adapter, with no browser in the loop. Only the adapter layer and the restore engine need a real browser.

## Layers

### Table X1: Test layers

| Layer | Runs in | Covers | Gate |
|---|---|---|---|
| Unit | node, mocked adapter | collect, serialize, deserialize, schema, migrations, filters, every foreign adapter, report building | Every pull request. A red test blocks the merge |
| Schema conformance | node | The generated schema against `fixtures/valid` and `fixtures/invalid` | Every pull request |
| Round trip | node plus a real browser for the restore half | Export, import, restore, re export, field by field comparison | Every milestone exit, and before every release |
| Cross browser matrix | Chrome, Edge, Firefox, loaded unpacked | Adapter behaviour, capability probes, restore engine, permission prompts | Before every release |
| Performance | Real browser, synthetic fixtures | NFR-001 to NFR-005 | At the milestone that introduces the code path, then before every release |
| Manifest and privacy assertions | node | Exactly three required permissions, no host permissions, no network call in the built bundle | Every pull request |

## The round trip test, defined precisely

1. Build a known browser state from a fixture: 3 windows, 40 tabs, 3 groups with distinct colours and one collapsed, 2 pinned tabs, one active tab per window, one muted tab, one unloaded tab, one `chrome://` tab, one duplicate URL.
2. Export to a file.
3. On a clean profile, import and restore that file.
4. Export again.
5. Compare the two files field by field, ignoring `exportedAt`, `source` and `counts`.

Implemented as `test/tools/roundtrip.ts`, driven by `test/unit/roundtrip.test.ts` against the writable fake browser, and exercised for real by `npm run smoke` in Chromium.

### Table X3: The documented exceptions

Everything else must match exactly. Each exception is a browser fact rather than a TabsPack choice, with one deliberate exception marked below, and each one is named in the harness beside the reason.

| Field | Why it cannot come back |
|---|---|
| `exportedAt`, `source`, `counts` | Written fresh by every export |
| `favIconUrl` | A tab that has not rendered has no icon yet |
| `lastAccessed` | The browser stamps it with the moment of the restore |
| `discarded` | Depends on the restore policy in force, not on the file. Since ADR-024 a restored tab is unloaded whatever the file said |
| `cookieStoreId` | Only Gecko has containers |
| `title` | A title belongs to the loaded page. Chromium's `tabs.create` cannot set one at all; Gecko accepts it for an unloaded tab, which the harness asserts separately |
| `url`, for a tab a suspender had parked | Deliberate, and the only exception that is a TabsPack choice rather than a browser fact. A wrapper goes in, the page it stands for comes out, and it stays that way on every later export. ADR-023 |
| `bounds`, for a window that is not in its normal state | `windows.create` refuses bounds and a state together, so a maximized window is placed by the window manager |
| Group ids | May be renumbered, as long as membership, title, colour and collapsed state match |
| A tab whose address no extension may open | Reported and listed on the placeholder page instead of restored |

This test is the product. If it passes on all three browsers, the central claim holds.

## Fixture layout

```
test/fixtures/
  valid/            conforming files. The schema must accept every one
  invalid/          the schema must reject every one
  edge/             the schema accepts them, but a reader must handle them
                    specially: a future version, a dangling group reference,
                    two active tabs, duplicate indices, restricted URLs
  foreign/          one sample per adapter in SPEC.md Table S5, each with a
                    malformed sibling. They are reconstructions from documented
                    shapes rather than genuine exports, which that folder's
                    README states and LIMITATIONS.md Table L4 tracks as debt
  migration/        before and after pairs, one per schemaVersion step. The pair
                    committed now is a hypothetical 1 to 2 step that drives the
                    machinery, because version 1 is the first released version
  synthetic/        1000 and 5000 tab files, generated by npm run fixtures and
                    not committed, because a deterministic generator is as
                    reproducible as a megabyte of JSON and cheaper to review
  expectations.json what each invalid and edge fixture is for, asserted by
                    scripts/schema-conformance.mjs so a fixture cannot quietly
                    change meaning
```

`valid/three-windows.tabspack.json` is generated by the real pipeline, and a
unit test compares a fresh export against it byte for byte. A deliberate change
to the serializer means regenerating it; an accidental one fails the build.

`valid/canonical-unknown.tabspack.json` is the same session with fields no
version of TabsPack understands attached at every level, plus `notes`, `tags`,
`profile` and `deviceName`. It is imported and written out again in
`test/unit/roundtrip.test.ts`, and the result must be identical byte for byte:
that assertion is the whole of SPEC.md section 7.

Fixtures contain no real personal browsing data. URLs are `example.com` and well known public sites.

## Malformed input cases that must each have a fixture

Missing `format`. Wrong `format` value. Missing `schemaVersion`. `schemaVersion` higher than supported. Missing `windows`. `windows` not an array. A tab with no `url`. A `groupId` referencing a group that does not exist. An unknown group colour. Two tabs marked `active` in one window. A negative or duplicated `index`. Truncated JSON. A 20 MB file. A file containing an unrecognised field at every level, which must succeed and survive re export.

## Foreign formats

Every adapter is held to the same three assertions in `test/unit/adapters.test.ts`, by being listed in the `CASES` and `MALFORMED` arrays there:

1. The fixture is detected by shape, with no file name in play, and imports with every address intact and every title the source carried.
2. The adapter declares what it could not carry, and the preview shows that sentence.
3. The malformed sibling fails with a message longer than a shrug and a suggested fix.

## What an agent can and cannot verify here

Worth stating plainly, because the difference is where the remaining risk lives.

| Automated | How |
|---|---|
| Everything in `src/core/` | 247 unit tests against a writable fake browser that models the awkward parts of the real one |
| The whole interface in Chromium, including import, restore, search, snapshots, the settings pane, the support form and the theme | `npm run smoke`, 81 checks against the built extension in a real Chromium |
| That the Firefox package installs in Firefox | `npm run smoke:firefox`, which is how the Load Temporary Add-on button does it |
| That the Firefox package would pass AMO's linter | `npm run lint:amo`, zero errors required |
| NFR-001, NFR-004, NFR-005 on the built package | `npm run perf:browser` |
| The contrast contract | `npm run a11y`, computed from the tokens |
| The support message, and that nothing about your tabs is in it | 8 unit tests on `core/support.ts`, one of which fails if an address, a title or a count ever reaches the body |
| Every rule of the rating ask | 8 unit tests on `core/rating.ts`, one per rule in ADR-036 plus the whole life of an ask from install to settled |

| Exporting, importing and restoring in real Chrome, Edge and Firefox, including a 200 tab restore with unloading on and a restart | `npm run matrix`, which drives the installed browsers. How it gets in differs by browser and is the whole reason that script exists: see the table below |
| A keyboard command actually being pressed | `npm run matrix -- --target=edge --keys`, which presses it with `xdotool` on a real window. Edge acts on it. Chrome and Firefox do not act on a synthetic key on the virtual display used here, so those two report the row as not run rather than as a failure |

| Not automated | Why |
|---|---|
| The `tabGroups` permission prompt being granted | No driver can answer a browser's own prompt. `--grant-groups` loads a build where the permission is required instead, so everything behind the prompt is exercised; the prompt itself is a line for a person |
| A keyboard command in Chrome and Firefox | As above: the key arrives, the command does not fire, and the same key fires the same command in Edge, so this is the rig rather than the product |
| A tab parked by a real suspender | The suspender has to be installed and its pages exist only in a real profile. The wrapper it writes is covered by fixtures and by the browser run |
| How any of it looks | A person still has to look at it |

### Table X5: What a browser run cannot reach, and what covers it instead

| Not reachable | Why | What covers it |
|---|---|---|
| The browser's own permission dialog | No driver can answer it. Ours is the click that summons it, and that is asserted | A person, ROADMAP Table R10 |
| A rating ask appearing | There is no store listing to link to until something is published, so nothing is shown by design | Unit tests drive the same functions in the same order, from install to settled |
| A `mailto:` reaching a mail client | Headless has no mail client. That the handoff is a real `mailto:` and not one glued to the extension origin **is** asserted | The audit in `.tmp/probe`, and ADR-038 |
| How it looks | Nothing automated has an opinion | A person, and the screenshots `npm run smoke` writes |

### Table X4: How each browser is driven

| Browser | How the extension gets in | Measured |
|---|---|---|
| Chrome 154 | `--load-extension` is ignored entirely since Chrome 137. The CDP command `Extensions.loadUnpacked` is the supported replacement and works | 2026-09-25 |
| Edge 153 | Still honours `--load-extension` | 2026-09-25 |
| Firefox 156 | geckodriver's `POST /session/{id}/moz/addon/install` with `temporary: true`, against a Firefox started by hand with `--marionette -remote-allow-system-access`, because geckodriver will not pass that switch through capabilities. The extension's own pages cannot be navigated to directly at all: the run pins `extensions.webextensions.uuids` so their address is known, and opens them from the chrome context with the system principal | 2026-09-25 |

## Cross browser matrix

### Table X2: Matrix

Run with `npm run matrix -- --target=chrome|edge --headed --grant-groups --keys`
and `npm run matrix:firefox -- --headed --grant-groups --keys`. Both need the
browser itself installed, `playwright` for the Chromium family and `geckodriver`
for Firefox, and a display. A virtual one will do, and is what these numbers come
from, but it needs a window manager: without one a browser has no focus, window
bounds are whatever the browser picks and no keystroke arrives.

```
Xvfb :77 -screen 0 1920x1080x24 &
DISPLAY=:77 metacity &
DISPLAY=:77 npm run matrix -- --target=chrome --headed --grant-groups --keys
```
 Results below are
from 2026-09-25 against Chrome 154.0.8037.57, Edge 153.0.4234.48 and Firefox
156.0.1 on Linux, on a virtual display with a window manager, which is what the
bounds and the keyboard rows need.

| Case | Chrome 154 | Edge 153 | Firefox 156 |
|---|---|---|---|
| Load unpacked, no console error on any surface | pass | pass | pass |
| Export all windows to a file | pass | pass | pass |
| The file on disk carries the name TabsPack asked for | pass | pass | pass |
| Pinned tabs and window bounds are captured | pass | pass | pass |
| Groups captured with title, colour and collapsed state | pass | pass | pass |
| Copy to the clipboard, from a page | pass | pass | not run, the driver reads no clipboard here |
| A suspended tab is recovered on import | pass | pass | pass |
| Restore into new windows, with the pack's bounds | pass | pass | pass |
| Every address in the pack is opened, and no suspender page is | pass | pass | pass |
| The pinned tab comes back pinned | pass | pass | pass |
| The group comes back with title, colour and collapsed state | pass | pass | pass |
| Restored tabs are unloaded, and the count is what the browser shows | pass | pass | pass, except a pinned tab, which Firefox loads anyway: ADR-025 |
| Restore 200 tabs with unloading on, without taking the browser down | pass, 9s, 199 unloaded | pass, 13s, 199 unloaded | pass, 6s, 199 unloaded |
| A page slow to commit keeps its address through the unload | pass, 24 of 24, 0 blank | pass, 24 of 24, 0 blank | not applicable, Gecko creates the tab unloaded |
| Every address of a 200 tab restore is in the browser, not just the count | covered by the row above | covered | pass, 200 of 200 |
| A tab created unloaded keeps the address it was created with, 40 of them | not applicable, Chromium cannot | not applicable | pass, 40 of 40 |
| A pack whose first tab is pinned does not lose the tabs after it | not applicable | not applicable | pass, 4 of 4, three runs: ADR-027 |
| The browser's own Options link lands on the settings pane, which is what `options_ui.page` with a fragment rests on | pass | pass | pass |
| The export pane offers the tab groups permission when a group is in scope | pass | pass | not run, the callout is the same component |
| A successful export reads as a success, not a warning | pass | pass | pass |
| The report says when groups came out with no names | pass | pass | pass |
| The toolbar badge and tooltip report an export and a restore | pass | pass | pass |
| An unloaded tab still shows its title | not applicable, Chromium cannot | not applicable | pass |
| A snapshot is written to local storage | pass | pass | pass |
| Snapshots survive a browser restart | pass | pass | not run, the temporary add-on goes with the restart |
| Keyboard commands are declared with the shortcut the browser accepted | pass | pass | pass |
| A keyboard command actually fires | **pass** in one run, Alt+Shift+E wrote a file and Alt+Shift+S saved a snapshot. Not run in another: this display delivers keys to Chrome only intermittently | **pass**, every run | not run, the key arrives and the command does not fire. The Alt modifier was ruled out by rebinding the command to Ctrl+Shift+U |
| Optional permission prompt for `tabGroups` | not run, a driver cannot answer a prompt | not run | not run |
| Containers | not applicable | not applicable | pass, the field is carried as `firefox-default` |

Totals on that date, and nothing failed on any of them: Chrome 23 passed with 2
not run, Edge 25 passed with none not run, Firefox 23 passed with 2 not run. The
rows that did not run are the keyboard ones, and the reason is in the row.

One instability worth naming rather than hiding: the small restore's rows read
the tab strip the moment the report appears, and a tab that is still loading
reports no address on either engine. The run waits for the addresses the pack
names before it reads anything, and it still caught a slow one twice out of
about a dozen runs. That is the rig, and it is also the reason the engine waits
for an address before unloading a tab: ADR-025.

## Commands

```
npm run typecheck     tsc --noEmit, strict
npm run lint          the project rules in scripts/lint.mjs
npm run schema:check  the generated schema still matches the types
npm test              unit suite (TZ pinned to UTC) plus schema conformance
npm run a11y          the contrast contract, computed from the tokens
npm run lint:amo      AMO's own linter over dist/firefox, which must be error free
npm run perf          the performance budgets in test/tools/bench.ts
npm run build         dist/chrome and dist/firefox
npm run verify        all of the above, in that order
npm run smoke         real browser checks, local only, skips without Playwright
npm run smoke:firefox installs dist/firefox in a real Firefox, through web-ext
npm run perf:browser  NFR-001, NFR-004 and NFR-005 against the built package
npm run assets        the icon set and the store tiles, from assets/icon.svg
```

`npm run smoke` loads `dist/chrome` into a real Chromium and drives the popup
and the manager page against the real extension APIs: counts, the keyboard path
through the segmented control, a download started through the downloads API, the
contents of the exported file, the report wording, the disabled private windows
control and its stated reason, then an import of a pack holding a pinned tab, a
group, two windows and a `chrome://` address, a restore of it, and the browser
state afterwards read back through `chrome.windows.getAll`. It also previews the
5000 tab fixture for NFR-005.

It has already earned its place. Four defects reached it that no unit test could
have found: `tabs.create` rejecting the `title` property on Chromium, a CSS
layout rule defeating the `hidden` attribute, `tabs.group` needing no permission
while its metadata does, and a preview that silently deselected the tabs it was
supposed to report.

What it cannot reach: a browser level keyboard shortcut. No test driver can
press one, so the smoke run checks everything up to that line, that the commands
are declared with the shortcuts the browser accepted and that the worker has a
listener, and `test/unit/commands.test.ts` covers what each command then does.
Pressing the keys is a manual matrix case.

It is not in CI because CI has no browser, and it is not a substitute for the
manual matrix above.
