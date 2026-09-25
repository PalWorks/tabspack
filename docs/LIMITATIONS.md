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
| Chromium cannot create an already discarded tab | Restoring a large pack briefly creates loaded tabs | Create inactive, then discard immediately beyond the threshold |
| A tab group cannot span windows | Group structure is per window by definition | The format declares groups inside their window |
| `tabs.create` cannot assign a group | Grouping is always a second pass | Restore step 6 in ARCHITECTURE.md section 6 |
| Tab and group ids are process local | They are useless in a file | The format uses its own `w1`, `g1` ids and `index` for order |
| An MV3 service worker is terminated when idle | Long running restore in the worker can be killed mid flight | Restore runs in the manager page |
| A browser action popup closes on focus loss | A file picker opened from a popup loses the popup and its state | ADR-009, all file work happens on the manager page |
| Unloaded tabs may report an empty `url` | Naive collection loses them | Always fall back to `pendingUrl` |
| Chrome shows an update warning for newly added required permissions | Adding `tabGroups` later would scare existing users | `tabGroups` and `offscreen` are optional permissions requested at first use |
| Window bounds may be rejected by the window manager | `windows.create` throws | Retry once at 800 by 600 at the origin, then continue |
| `windows.create` refuses bounds and a state such as maximized in the same call | A maximized window cannot be given the position and size from the pack | Created plain, then maximized. Its bounds come from the window manager, so bounds do not round trip for a window that is not in its normal state |
| A group holding the active tab cannot be collapsed | A collapsed group whose active tab is inside it comes back open | Collapsing runs after activating, and a refusal is reported rather than swallowed |
| `tabs.group` works without the `tabGroups` permission, but the group's title, colour and collapsed state do not | Without the permission a restore produces grouped but unlabelled tabs | Membership is restored, the report says the titles and colours were not applied, and the preview offers the permission before the restore |
| `tabs.create` cannot set a title on Chromium, and rejects the property outright | A restored tab has no title until its page loads | The title is sent only on the engines that accept it, alongside `discarded`. Elsewhere the browser fills it in on load. The round trip harness excludes the field and says why |
| Safari requires Xcode packaging and a paid Apple developer account | No Safari build | Out of scope, PLAN.md Table P1 |

## Table L3: Tooling constraints found while building

| Constraint | Effect | Handling |
|---|---|---|
| Chrome 137 and later ignore `--load-extension` | The system Chrome cannot load an unpacked build for an automated check, and starts with no extension at all rather than reporting an error | `npm run smoke` uses the Chromium that Playwright downloads, which still honours the switch. Manual verification in Chrome, Edge and Firefox is unaffected |
| Playwright intercepts downloads | The on disk filename is replaced by a generated one, so an end to end check cannot observe the name TabsPack asked for | The smoke check asserts the download was started by the extension through the downloads API. The filename itself is covered by the naming unit tests |
| A textarea's value is not a child node | `:empty` never changes when the output panel is filled, which made a first version of the smoke check wait forever | Poll the value, not the selector |
| A layout rule such as `display: flex` beats the `hidden` attribute | A hidden panel rendered anyway, which a real browser found and no unit test could | One rule in `base.css` makes `hidden` mean hidden everywhere |
| A tab opened by the extension takes a moment to appear to the test driver, and reports no URL until it does | A check for the placeholder page failed although the page had opened | Poll for it rather than reading the page list once |
| Chrome does not grant `permissions.request` in an automated run | The tab groups path cannot be granted in `npm run smoke` | The smoke run asserts the degraded path instead, which is the path that needed proving anyway. The granted path is a manual matrix case |
| The polyfill is bundled into all four entry points | About 35 KB is repeated in each bundle, roughly 140 KB across a 296 KB build | Accepted for now. Code splitting across a service worker and page contexts costs more than it saves at this size |

## Table L4: Technical debt register

| Debt | Introduced | Paid when |
|---|---|---|
| No formatter is enforced, only the five project rules in `scripts/lint.mjs` | T-004, ADR-014 | Before outside contributions arrive |
| The placeholder icon is a generated mark, not designed artwork | T-007 | T-504 |
| Foreign format fixtures are reconstructions from documented shapes, not genuine exports, which `test/fixtures/foreign/README.md` forbids | M3, T-303 to T-308 | When a genuine export of each tool can be obtained |
