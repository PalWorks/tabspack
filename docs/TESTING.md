# Testing

As of the end of M6: 223 unit tests, the number `npm test` reports, with 21
conformance fixtures, 16 foreign format fixtures, 38 contrast pairs, 2
performance budgets in node and 3 more measured in a browser, and a 70 check
browser run that covers export, import, restore,
search, snapshots, the options page and the theme. The contract below is what
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
| Everything in `src/core/` | 223 unit tests against a writable fake browser that models the awkward parts of the real one |
| The whole interface in Chromium, including import, restore, search, snapshots, options and the theme | `npm run smoke`, 70 checks against the built extension in a real Chromium |
| That the Firefox package installs in Firefox | `npm run smoke:firefox`, which is how the Load Temporary Add-on button does it |
| That the Firefox package would pass AMO's linter | `npm run lint:amo`, zero errors required |
| NFR-001, NFR-004, NFR-005 on the built package | `npm run perf:browser` |
| The contrast contract | `npm run a11y`, computed from the tokens |

| Not automated | Why |
|---|---|
| Exporting, importing and restoring in Firefox and Edge | Neither browser can be driven with an extension loaded the way Chromium can here |
| A keyboard shortcut actually being pressed | The browser handles it before any page or driver sees it |
| The `tabGroups` permission prompt being granted | Chrome refuses `permissions.request` in an automated run |
| A restore with unloading on, at scale | `chrome.tabs.discard` takes the headless browser down: LIMITATIONS Table L3 |
| Snapshots surviving a browser restart | The profile is thrown away with the run |

## Cross browser matrix

### Table X2: Matrix

| Case | Chrome | Edge | Firefox |
|---|---|---|---|
| Load unpacked, clean console | Required. `npm run smoke` proves the load and a clean console | Required | Partly automated: `npm run smoke:firefox` installs the package in a real Firefox through web-ext, which proves the manifest, the permissions, the background declaration and the CSP are right for Gecko. A clean console still needs a human |
| Export all windows | Required | Required | Required |
| Restore into new windows with bounds | Required | Required | Required |
| Groups restored with colour and collapsed state | Required, 89 and later | Required | Required, 139 and later. Degrades with one notice below that |
| Discarded restore | Create then discard | Create then discard | `discarded: true` at creation |
| Restore 200 tabs with unloading on, which is the default since ADR-024, and watch for a crash | Required, see LIMITATIONS Table L3 | Required | Required |
| A tab parked by a suspender comes back as the page it stands for | Required, with the suspender installed | Required | Required |
| Clipboard | From the page, on every engine. There is no offscreen document and no background clipboard write: ADR-021 | Same | Same |
| Optional permission prompt for `tabGroups` | Required | Required | Required |
| Keyboard commands fire, and appear in the browser's shortcut settings | Required | Required | Required |
| Snapshots survive a browser restart | Required | Required | Required |
| Containers | Not applicable | Not applicable | Field ignored, no error |

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
