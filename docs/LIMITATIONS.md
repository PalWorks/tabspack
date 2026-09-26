# Known Limitations

Read this before "fixing" anything listed here. Every entry is either a browser constraint we cannot remove or a deliberate product decision. Changing one requires an ADR in [DECISIONS.md](DECISIONS.md), not a patch.

## Table L1: Deliberate limits

| Limit | Why | What TabsPack does instead |
|---|---|---|
| No cookies, tokens, form state or local storage in an export | An export file would become a credential. It is emailed, put in cloud storage and shared with colleagues | Exports carry URLs and structure only. Stated in `PRIVACY.md` and in the store listing |
| No telemetry, so no in product metrics | ADR-005 | Quality is measured by issue reports and by the test matrix |
| No cloud sync, no accounts | Offline first and no account principles | The export file is the sync mechanism |
| Snapshots do not follow the user across machines | ADR-007, `storage.sync` cannot hold them | Export a file |
| Plain text and flat JSON exports do not round trip | They carry no window, order or group information | The UI labels them as one way. `.tabspack.json` is the round trip format |
| Incognito windows are excluded by default | Private browsing state should not silently land in a file | Opt in through settings, gated by the browser level incognito permission |
| `data:` favicons stripped by default | A few hundred tabs of embedded icons inflate a file by megabytes | Setting to keep them, compressed |
| Low fidelity imports stay low fidelity | An adapter that invents windows or groups produces a file that lies about its own provenance | The preview states the fidelity achieved by the source format |

## Table L2: Browser constraints we cannot remove

| Constraint | Effect | Mitigation |
|---|---|---|
| Extensions cannot open `chrome://`, `edge://`, `about:` other than blank, `view-source:`, `javascript:` or `data:` URLs | Those tabs cannot be recreated | Kept in the file, listed on a placeholder page, counted in the import report. SPEC section 8 |
| `file://` URLs need a browser level file access grant | Local file tabs may fail to open | Capability probe, and the same placeholder treatment when refused |
| Tab groups need Chromium 89 or Gecko 139 | Older browsers restore tabs ungrouped | Group metadata is retained in the file, so a later restore on a capable browser is lossless. One notice, not one per tab |
| `tabs.lastAccessed` is not guaranteed. Older browsers do not supply it, and no foreign import format except Tab Session Manager carries one | Tab age is unknown for those tabs, and unknown is not a small case: a pack imported from OneTab or a bookmark file has no dates at all | Unknown is a band of its own in the age report, counted and shown. It is never called old and no filter drops it, because absence of evidence is not evidence of age. ADR-044 |
| Chromium cannot create an already discarded tab | Restoring a large pack briefly creates loaded tabs | Create inactive, then discard immediately beyond the threshold |
| A tab group cannot span windows | Group structure is per window by definition | The format declares groups inside their window |
| `tabs.create` cannot assign a group | Grouping is always a second pass | Restore step 6 in ARCHITECTURE.md section 6 |
| Tab and group ids are process local | They are useless in a file | The format uses its own `w1`, `g1` ids and `index` for order |
| An MV3 service worker is terminated when idle | Long running restore in the worker can be killed mid flight | Restore runs in the manager page |
| A Chromium service worker has no `URL.createObjectURL` | The background cannot make a blob URL to download | Measured: its downloads API accepts a `data:` URL instead, and a Gecko background page can make a blob URL. ADR-021 |
| A data URL has a practical size limit | A very large pack cannot be written from the background that way | Beyond 1.5 MB the command opens the manager page, which has a DOM and no limit, and finishes the export there |
| `storage.local` is capped at about 10 MB without the unlimitedStorage permission | Snapshots can fill it | Usage is shown against the cap, a warning appears at 80 percent, and nothing is ever deleted automatically: ADR-012 |
| A browser action popup closes on focus loss | A file picker opened from a popup loses the popup and its state | ADR-009, all file work happens on the manager page |
| Unloaded tabs may report an empty `url` | Naive collection loses them | Always fall back to `pendingUrl` |
| Chrome shows an update warning for newly added required permissions | Adding `tabGroups` later would scare existing users | `tabGroups` is an optional permission requested at first use, from a button that says what it is for |
| Window bounds may be rejected by the window manager | `windows.create` throws | Retry once at 800 by 600 at the origin, then continue |
| `windows.create` refuses bounds and a state such as maximized in the same call | A maximized window cannot be given the position and size from the pack | Created plain, then maximized. Its bounds come from the window manager, so bounds do not round trip for a window that is not in its normal state |
| A group holding the active tab cannot be collapsed | A collapsed group whose active tab is inside it comes back open | Collapsing runs after activating, and a refusal is reported rather than swallowed |
| `tabs.group` works without the `tabGroups` permission, but the group's title, colour and collapsed state do not | Without the permission a restore produces grouped but unlabelled tabs | Membership is restored, the report says the titles and colours were not applied, and the preview offers the permission before the restore |
| `tabs.create` cannot set a title on Chromium, and rejects the property outright | A restored tab has no title until its page loads | The title is sent only on the engines that accept it, alongside `discarded`. Elsewhere the browser fills it in on load. The round trip harness excludes the field and says why |
| Recovering a suspended tab is a judgement about a shape | The generic rule rewrites any extension page carrying an absolute http address in a `uri`, `url`, `u`, `href`, `target` or `originalUrl` parameter. An extension page that legitimately carries one would be rewritten to the address it carries | Contained three ways: the value must be an absolute http or https address, every recovery is counted and named rather than done silently, and the whole behaviour has a switch in Settings. Twelve negative cases guard it, including an extension's own options page. ADR-023 |
| Chromium gives a tab a new id when it unloads it, and a tab unloaded before its navigation commits loses its address for good | Both silently ruined a restore: blank tabs, and groups, openers and the active tab all applied to ids that no longer existed | Each tab is given up to three seconds to report an address before it is unloaded, and the engine follows the id the unload reports. Measured, and fixed, on 2026-09-25: ADR-025 |
| `pendingUrl` is set the instant a tab starts navigating, long before anything has committed | Treating it as an address was the same defect again, and a real 50 tab session lost 47 of 48 addresses to it. A refused local port hides it completely, because there the address commits inside one poll | Only a committed `url` counts, and a tab that has not committed is left loaded rather than unloaded. The matrix now serves 24 of its own pages slowly, on a real socket: ADR-026 |
| Firefox refuses `tabs.create({ pinned: true, discarded: true })`, in those words | A pinned tab cannot be created unloaded on Gecko, and a probe that reads the refusal as a verdict about the browser downgrades every tab after it | A pinned tab never asks to be created unloaded on any engine, and the refusal never reaches the capability probe. A pinned tab restored on Gecko takes its title from its page rather than from the pack: ADR-027 |
| A new tab on Gecko reports `url: "about:blank"` while its navigation is in flight | It is the empty address under another name, and unloading there loses the page | `about:blank` counts as an address only for a tab whose pack entry asked for it. The engine compares against what each tab was asked for: ADR-027 |
| Firefox loads a pinned tab straight after agreeing to create it unloaded | The restore would claim to have left more tabs unloaded than it did | The count in the report is recounted from the browser at the end rather than trusted from each creation: ADR-025 |
| Safari requires Xcode packaging and a paid Apple developer account | No Safari build | Out of scope, PLAN.md Table P1 |

## Table L3: Tooling constraints found while building

| Constraint | Effect | Handling |
|---|---|---|
| Chrome 137 and later ignore `--load-extension` | The switch is accepted and does nothing, so the browser starts with no extension and no error | Two answers. `npm run smoke` uses the Chrome for Testing that Playwright downloads, which still honours the switch, and `npm run matrix` loads the build into the installed Chrome with the CDP command `Extensions.loadUnpacked`, which is the supported replacement. Edge 153 still honours the switch |
| Firefox refuses to let a driver navigate to a `moz-extension:` address | An automated check cannot open the extension's own pages, which is every page this product has | `npm run matrix:firefox` pins `extensions.webextensions.uuids` so the address is known, and opens the page from the chrome context with the system principal, which needs Firefox started by hand with `-remote-allow-system-access` because geckodriver will not pass that switch through capabilities |
| A synthetic keystroke does not always reach the browser | The keyboard command rows cannot be trusted blindly | Every run presses a plain Ctrl+T first. If that does not open a tab, the rows report as not run rather than as a failure. Edge and Chrome act on the real shortcuts this way; Firefox takes the plain key and does not act on an extension command, with the Alt modifier ruled out by rebinding the command to Ctrl+Shift+U |
| Playwright intercepts downloads | The on disk filename is replaced by a generated one, so an end to end check cannot observe the name TabsPack asked for | The smoke check asserts the download was started by the extension through the downloads API. The filename itself is covered by the naming unit tests |
| A textarea's value is not a child node | `:empty` never changes when the output panel is filled, which made a first version of the smoke check wait forever | Poll the value, not the selector |
| A layout rule such as `display: flex` beats the `hidden` attribute | A hidden panel rendered anyway, which a real browser found and no unit test could | One rule in `base.css` makes `hidden` mean hidden everywhere |
| A tab opened by the extension takes a moment to appear to the test driver, and reports no URL until it does | A check for the placeholder page failed although the page had opened | Poll for it rather than reading the page list once |
| Chrome silently drops a suggested shortcut it will not accept | A command declared with `Alt+Shift+W`, `Alt+Shift+C` or `Alt+Shift+T` loads with no shortcut at all and no error | Measured: `Alt+Shift+E`, `D`, `S`, `K`, `1`, `2` and `Ctrl+Shift+U` are accepted. The shipped defaults are E, D and S, and the browser's own shortcut page can rebind them |
| Chrome allows at most four suggested keys per extension | A fifth command silently loads with no shortcut, and too many can stop the extension loading at all | Three commands are declared, which leaves room for one more |
| A file input fires no event when the same file is chosen twice | Fixing a file and picking it again did nothing | The input's value is cleared after every read |
| `chrome.tabs.discard` crashes any Chromium that Playwright launches itself | A restore with unloading on ends that browser with a segmentation fault. Measured with a direct probe: **one** call is enough, so this is not about volume. Re-measured on 2026-09-26: it is the launch, not the browser. The installed Edge 154, launched by Playwright's `launchPersistentContext`, crashes the same way as Chrome for Testing 151, headed or headless, with or without a session bus | Not the product. The same Edge 154, and Chrome 154, spawned directly and driven over CDP by `npm run matrix`, each restore 200 tabs with unloading on and leave 199 unloaded, as does Firefox 156. `npm run perf:browser`, `npm run smoke` and `scripts/gen-store-art.mjs` all launch through Playwright, so all three restore with unloading off; smoke first asserts the toggle ships on |
| Chrome does not grant `permissions.request` in an automated run | The tab groups path cannot be granted in `npm run smoke` | The smoke run asserts the degraded path instead, which is the path that needed proving anyway. The granted path is a manual matrix case |
| The polyfill is bundled into all four entry points | About 35 KB is repeated in each bundle, roughly 140 KB across a 296 KB build | Accepted for now. Code splitting across a service worker and page contexts costs more than it saves at this size |

## Table L5: Limits that exist to keep the product honest

| Limit | Value | Why |
|---|---|---|
| Largest file the importer reads | 64 MB | Forty times the largest session anybody has. Above it the file is refused with a sentence rather than read into a tab that then runs out of memory |
| Exclude patterns, and the length of one | 200 each | A line of four hundred stars compiles to a regular expression that can backtrack for a very long time on a URL that does not match |
| Issues shown for one file | Three per kind, then a line saying how many more | A file with five thousand identical problems should produce a report, not a wall |
| Rows of the preview tree in the document | About thirty, whatever the pack holds | A five thousand tab pack renders in about fifty milliseconds because only what is on screen exists |
| Snapshot storage before a warning | 80 percent of about 10 MB | ADR-012: the cap is soft, the warning is loud, and nothing is ever deleted to make room |
| Wrappers unwrapped when recovering a suspended tab | 3 | A wrapper inside a wrapper happens; four deep is a loop or a joke. Past the limit nothing is claimed and the tab is left as it was found: ADR-023 |

## Table L4: Technical debt register

| Debt | Introduced | Paid when |
|---|---|---|
| No formatter is enforced, only the nine project rules in `scripts/lint.mjs` | T-004, ADR-014 | Before outside contributions arrive |
| The placeholder icon is a generated mark, not designed artwork | T-007 | T-504 |
| Foreign format fixtures are reconstructions from documented shapes, not genuine exports, which `test/fixtures/foreign/README.md` forbids | M3, T-303 to T-308 | When a genuine export of each tool can be obtained |
| The rendered tab age sentence is proved in two halves rather than end to end: the counts by unit test, the wording by asking the browser to substitute into the phrase. No test profile can hold a tab from three months ago | B-202 | If a way to seed `lastAccessed` in a test profile appears. Until then the whole case is [MANUAL-CHECKS.md](MANUAL-CHECKS.md) territory |
