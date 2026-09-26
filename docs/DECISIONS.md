# Decision Records

One record per decision that would be expensive to reverse. Newest last. A decision is never edited in place; it is superseded by a later record that names it.

Format: context, options considered, decision, consequence.

---

## ADR-001: Product name is TabsPack

Date 2026-09-24. Status accepted.

**Context.** The v0.9 BRD called the product TabPack and the format `.tabpack`. The repository folder says TabsPack. The name is embedded in the `format` field of every exported file, so changing it later invalidates other people's files.

**Options.** TabPack, closer to the original document. TabsPack, matching the repository and the plural subject of the product.

**Decision.** TabsPack, with `tabspack` as the literal value of the `format` field.

**Consequence.** All v0.9 references to TabPack are historical. The word appears in the manifest name, the store listings, the format field and the file extension, and is now fixed.

---

## ADR-002: File extension is `.tabspack.json`

Date 2026-09-24. Status accepted.

**Context.** A branded extension signals a format. An unbranded one maximises compatibility.

**Options.** `.tabpack` as in v0.9, brandable but unknown to every operating system, blocked by some mail and chat services, not previewable, and it hides the fact that the content is JSON. `.json`, universally accepted but anonymous. `.tabspack.json`, both.

**Decision.** `.tabspack.json`.

**Consequence.** Files open in any editor, pass attachment filters, and are still recognisable. Detection on import is by document shape, never by extension, so the choice does not constrain the importer.

---

## ADR-003: TypeScript with esbuild

Date 2026-09-24. Status accepted. Supersedes an earlier verbal recommendation of plain ES modules with no build step.

**Context.** The strategic asset is a published specification with a reference parser and, later, an SDK. The earlier recommendation of untyped modules optimised for a fast first ship and easy store review auditing.

**Options.** Plain ES modules, no build step, fastest to ship. TypeScript with esbuild, one config file and a build step.

**Decision.** TypeScript with esbuild. `src/types/tabspack.ts` becomes the machine readable source of the JSON Schema, and schema migrations are type checked.

**Consequence.** A build step exists, so store submissions ship compiled output and the repository must document how to reproduce the build. Source maps are not shipped to stores.

---

## ADR-004: Unknown fields are ignored for behaviour and preserved on rewrite

Date 2026-09-24. Status accepted.

**Context.** v0.9 said unknown fields must be ignored. The engineering plan said they must be preserved on round trip. Both rules are defensible and they conflict on rewrite.

**Options.** Ignore only, which means a file passing through TabsPack silently loses any field a newer version or a third party tool added. Preserve only, which risks acting on data we do not understand. Both, scoped.

**Decision.** Ignore for behaviour, preserve on rewrite. Written into SPEC.md section 7 as a MUST.

**Consequence.** The deserializer carries an unknown field bag per object and the serializer writes it back. Tests assert byte level survival of an unrecognised field through import and re export.

---

## ADR-005: No telemetry in v1, so no funnel metrics

Date 2026-09-24. Status accepted.

**Context.** v0.9 listed restore completion rate and crash free sessions as success metrics while also promising no telemetry by default. The two cannot both hold.

**Options.** No telemetry, losing every in product metric and relying on store dashboards and issue reports. Opt in anonymous counters, gaining the metrics at the cost of a privacy disclosure, a settings toggle and a network path in a product whose selling point is that it has none.

**Decision.** No telemetry. No network request of any kind ships in v1, and NFR-006 makes that testable.

**Consequence.** Quality is measured by issue reports and by the test matrix. Privacy first stops being a claim and becomes a verifiable property, which is the differentiator against every closed competitor.

---

## ADR-006: v1 ships to Chrome, Edge and Firefox together

Date 2026-09-24. Status accepted.

**Context.** Cross browser support is in the product name. Retrofitting the polyfill and the capability layer after a Chrome only release is more expensive than starting with them.

**Options.** Chrome first, Firefox later. All three at once.

**Decision.** All three at once. Chrome and Edge share one build. Firefox uses a second manifest over the same source. Brave, Opera, Vivaldi and Arc work from the Chrome build without a store listing.

**Consequence.** Three store submissions, three review processes and a two engine test matrix from M0. The adapter rule in ARCHITECTURE.md section 4 exists to make this affordable.

---

## ADR-007: Snapshots in `storage.local` only

Date 2026-09-24. Status accepted.

**Context.** Snapshots can be large. `storage.sync` is roughly 100 KB total with per item limits, and syncs across a user's machines.

**Options.** `storage.local` only. `storage.sync` for metadata plus `storage.local` for bodies, which introduces a partial sync failure mode where a machine lists a snapshot it does not have.

**Decision.** `storage.local` only, one key per snapshot plus a metadata index.

**Consequence.** Snapshots do not follow the user across machines. The answer to that need is the export file, which is the whole point of the product. Retention policy is still an open question in PLAN.md section 17.

---

## ADR-008: MIT licence, public repository

Date 2026-09-24. Status accepted.

**Context.** The specification only becomes a standard if other implementers can read it and copy the parser without friction. All three reference extensions studied are permissively licensed or public.

**Options.** MIT and public. A source available licence. Private.

**Decision.** MIT, public, with the specification, the JSON Schema, a reference parser and sample files published in the repository.

**Consequence.** Competitors can implement the format, which is the intent. Contribution rules and a security policy are therefore required before the repository is made public.

---

## ADR-009: Import and export live on a full extension page, not the popup

Date 2026-09-24. Status accepted.

**Context.** A browser action popup closes on focus loss, including when a file picker opens. The reference extensions all put their work in the popup, and Export Tabs in particular loses its state whenever the popup closes.

**Options.** Popup only, simplest. Popup plus a manager page.

**Decision.** The popup is a launcher with one click export and a tab count. All import, preview, selection, restore and snapshot management happen on a manager page opened in a tab.

**Amended 2026-09-25.** The popup still hosts no file work, but it names import. The button sits beside export and opens `manager.html#import`, which lands on the import task with the file button focused. The first version left import unnamed in the launcher, which reads as a product that only exports.

**Consequence.** Two UI surfaces to build and style. Restore runs in a page context that cannot be terminated mid flight, which a service worker can be.

---

## ADR-010: Foreign format import is in v1, not deferred

Date 2026-09-24. Status accepted.

**Context.** v0.9 scoped import to TabsPack, plain text and JSON. The product's primary user story is migration, and the people migrating already store their sessions in Session Buddy, Tab Session Manager or OneTab.

**Options.** Defer foreign adapters to v2. Ship them in v1.

**Decision.** Ship the adapters in SPEC.md Table S5 in v1, at milestone M3.

**Consequence.** A fixture per source format and a normalisation test per adapter. Adapters never invent fidelity the source does not carry.

---

## ADR-011: The plain text export includes titles behind a toggle

Date 2026-09-24. Status accepted. Closes PLAN.md section 17 question 1.

**Context.** Plain text export does not round trip, so it exists purely for pasting into notes, tickets and chat. A URL only list is the cleanest input for other tools. A title plus URL list is far more readable for a human.

**Options.** URLs only, simplest and most machine friendly. Titles and URLs always, friendlier but noisier and worse as input to other tools. A toggle.

**Decision.** URLs only by default, with an include titles toggle. The toggle costs one setting and one branch in the formatter.

**Consequence.** FR-004 carries the toggle. The UI continues to label both text and flat JSON exports as one way formats, so nobody mistakes them for a backup.

---

## ADR-012: Snapshot retention is a soft cap with a warning, never automatic deletion

Date 2026-09-24. Status accepted. Closes PLAN.md section 17 question 2.

**Context.** `storage.local` is finite, roughly 10 MB by default in Chromium unless `unlimitedStorage` is requested, which we will not request because it widens the permission set. Snapshots are the only copy of a session a user may have.

**Options.** Unbounded until writes start failing, which fails at the worst moment with no warning. A hard cap that deletes the oldest snapshot, which silently destroys the thing the product exists to protect. A soft cap that warns and then refuses to add more.

**Decision.** A soft cap, default 100 snapshots or 8 MB, whichever comes first. A warning at 80 percent. At the cap, saving is refused with a message offering export and delete, and nothing is ever deleted automatically.

**Consequence.** T-405 implements the guard. Automatic scheduled snapshots, B-101, must respect the cap, and B-103 exists so a rolling automatic series prunes duplicates by explicit user action rather than by silent eviction.

---

## ADR-013: The new tab page is not overridden

Date 2026-09-24. Status accepted. Closes PLAN.md section 17 question 3.

**Context.** Several competitors replace the new tab page with their session dashboard, which drives engagement and puts the product in front of the user constantly.

**Options.** Override by default, which maximises engagement. Override as an opt in setting. No override.

**Decision.** No override in v1. The manager page is opened deliberately, from the popup, a keyboard command or a bookmark.

**Consequence.** Recorded as B-601, declined. Reviewers scrutinise `chrome_url_overrides` and users resent a tool that takes over a surface they did not offer. A product whose entire pitch is that it does not take anything from you should not begin by taking the new tab page. Revisit only if users ask for it, and then as an explicit opt in.

---

## ADR-014: Project rules are enforced by a purpose built lint script, not eslint

Date 2026-09-24. Status accepted. Refines the wording of task T-004, which said "eslint rule".

**Context.** The rules that matter in this repository are specific to it: nothing outside the adapter may touch `browser.*`, no `innerHTML`, no network call or remote resource, no unexplained `any`, and an exact manifest permission set. General purpose lint rules add little on a four thousand line codebase with one contributor.

**Options.** eslint with a local plugin, which brings a dependency tree, a config format and a plugin API between each rule and its reason. A single node script that reads the files and applies the five rules directly.

**Decision.** `scripts/lint.mjs`, no dependency, roughly 150 lines, each rule next to the sentence in AGENTS.md that justifies it. Comments are stripped before scanning so prose never trips a rule.

**Consequence.** No formatter is enforced yet, which is acceptable while the codebase has one author, and is worth revisiting before outside contributions arrive. The five hard rules are checked on every build instead of being trusted.

---

## ADR-015: The offscreen permission is declared when the background clipboard path ships

Date 2026-09-24. Status accepted. Narrows PLAN.md Table P8 and task T-003.

**Context.** The plan declared `offscreen` as an optional permission from M0. At M1 every clipboard write happens in a page, which has a DOM and needs no offscreen document. The only caller that would need one is a keyboard command handled by the service worker, which arrives at M4.

**Options.** Declare it now, as planned. Declare it when something uses it.

**Decision.** Not declared until M4. The offscreen document and the service worker route exist in the source and degrade with a clear message, so the path is written and reviewed, just not permitted yet.

**Consequence.** Declaring a permission the build never exercises is exactly the permission creep AGENTS.md forbids, and reviewers ask about unused permissions. The manifest assertion in `scripts/lint.mjs` allows `offscreen` in the optional set, so adding it at M4 is a one line change.

---

## ADR-016: Group membership is preserved even when the tab groups API is absent

Date 2026-09-24. Status accepted.

**Context.** A browser without `tabGroups`, or with the optional permission ungranted, still reports `groupId` on each tab. The first implementation dropped groups entirely in that case, and a test caught it.

**Options.** Drop groups entirely, which loses knowable structure. Keep membership and invent a default title and colour, which writes values into a file that no browser ever reported. Keep membership and omit what was not read.

**Decision.** Keep membership, omit title, colour and collapsed state when the API did not supply them.

**Consequence.** A file exported without the groups API restores its groups on a browser that has it, with default titles and colours. The user notice now says titles and colours are unavailable rather than claiming groups are not captured.

---

## ADR-017: The reader is hand written, not driven by the published JSON Schema

Date 2026-09-25. Status accepted. Relates to T-201 and ADR-004.

**Context.** The format has a published JSON Schema, generated from the types. The obvious move is to validate imports with it, using ajv.

**Options.** Bundle ajv and validate against the schema, which is one implementation and no drift, but adds a runtime dependency against AGENTS.md section 2 rule 6, and makes the reader exactly as strict as the schema. Or hand write the reader.

**Decision.** Hand written, in `src/core/schema.ts`. The schema stays the contract for writers and is enforced in CI against every fixture by `scripts/schema-conformance.mjs`.

**Consequence.** The reader is deliberately more forgiving than the schema in seven documented ways, listed in SPEC.md Table S6, because a format whose selling point is that a person can hand edit it cannot reject a file for a missing export time. The risk is drift between the two, which `test/unit/schema.test.ts` holds down by asserting the reader's verdict on every fixture against `expectations.json`, the same file the schema run reads.

---

## ADR-018: A tab that cannot be opened stays selected in the preview

Date 2026-09-25. Status accepted. Relates to T-205 and to rule 7 of AGENTS.md section 2.

**Context.** A pack usually holds a few addresses no extension may open, such as `chrome://settings`. The preview flags them. The question is whether they start selected.

**Options.** Deselect them, which makes the restore count honest at a glance but means the restore never sees them, never reports them and never opens the placeholder page, so the user is told once in the preview and never again. Or keep them selected and let the restore report them.

**Decision.** They stay selected. The restore counts them, lists them and opens the placeholder page, while the button's label counts only what will actually open.

**Consequence.** The count on the button and the count in the tree differ, which the line above the tree explains: "6 of 6 selected, 1 will be skipped, 1 cannot be opened". This was found by a real browser: with the tabs deselected the placeholder page never opened, and the one lossy edge of the format was invisible.

---

## ADR-019: The tab groups permission is requested by a button in the preview

Date 2026-09-25. Status accepted. Narrows PLAN.md Table P8.

**Context.** `tabGroups` is an optional permission, requested at first use to avoid the Chrome update warning. First use is a restore of a pack that has groups.

**Options.** Request it inside the restore, which is where it is needed, but the request then sits behind several awaits and a browser only grants an optional permission inside a user gesture. Or ask for it with its own control before the restore.

**Decision.** A notice appears under the preview when the pack has groups and the permission is missing, with an Allow button beside it. The click is the gesture, and the sentence beside it says what is gained and that refusing still restores the tabs.

**Consequence.** One more thing on the page, shown only when it applies. Refusing is a first class path: `tabs.group` needs no permission, so the tabs are still grouped, and the restore reports that the titles and colours were not applied.

---

## ADR-020: One file imports as one pack

Date 2026-09-25. Status accepted. Relates to T-303 and T-304.

**Context.** Tab Session Manager and Session Buddy both export a file that can hold many saved sessions. A TabsPack pack is one session.

**Options.** Import every session and merge them into one pack, which invents a relationship between sessions the user kept apart. Import every session as several packs, which means the import surface stops being about one file and the preview has to grow a session picker. Or import the first and say so.

**Decision.** One file imports as one pack. The first session is read, and a warning names how many were in the file and what to do about the others.

**Consequence.** A user migrating a whole archive has to export their sessions one at a time from the other tool. That is the honest cost, and it is visible in the report rather than discovered later as a silent merge. A session picker in the preview is a reasonable M4 or later addition if anyone asks for it; it is not in Table R1 yet, deliberately.

---

## ADR-021: No offscreen document, because the background can write a file by itself

Date 2026-09-25. Status accepted. Supersedes ADR-015.

**Context.** ADR-015 kept the offscreen document in the source and deferred its permission to M4, on the assumption that a Chromium service worker cannot produce a file and would need one to make a blob URL. M4 is the milestone where a keyboard command has to write a file with no page open, so the assumption was measured.

**What the measurement said.** In a Chromium service worker with the built extension loaded: `URL.createObjectURL` is absent, `Blob` exists, and `chrome.downloads.download` accepts a `data:` URL and returns a download id. A Gecko MV3 background is an event page with a DOM, so it makes a blob URL directly.

**Options.** Declare `offscreen`, request it at first use and keep a document whose only job is to make a blob URL. Or write the file from the background by the route each engine already allows, and fall back to the manager page when neither works.

**Decision.** No offscreen document. `src/background/save-file.ts` tries a blob URL, then a data URL under 1.5 MB, then opens the manager page with the export it wanted. The offscreen source, its build entry and its 35 KB in each package are gone, and the `offscreen` permission is never requested.

**Consequence.** One fewer execution context, one fewer permission a store reviewer has to be told about, and a smaller package. The clipboard is now only ever written from a page, which is where every copy in the product already happens; `copyText` from a context with no DOM throws a message saying so rather than silently doing nothing. If a future feature needs a background clipboard write, this decision is the one to supersede, and the document to restore is in the history of this repository.

---

## ADR-022: The interface is translated, and the core's messages are its English fallback

Date 2026-09-25. Status accepted. Scopes T-503.

**Context.** T-503 asks for an i18n scaffold with English complete and no hard coded user facing string. Two kinds of string exist in this product: the words the interface renders, and the sentences `src/core/` produces when it validates a file or restores a pack, each of which carries a stable code, a JSON path and a suggested fix.

**Options.** Translate both, which means rewriting every core message as a parameterised template keyed by code, restructuring roughly a hundred sentences that are currently written where the decision that produces them is made, and doing it before a single second locale exists. Or translate the interface now and leave the core's messages as English defaults that a locale can override by code later.

**Decision.** Every string the interface renders comes from `_locales/en/messages.json`, enforced by three lint rules: no key without an entry, no entry without a use, and no English sentence written into markup or into a DOM call. The core keeps its messages, each with a code, and `renderIssues` is the single place that would consult a translation for one.

**Consequence.** A second locale translates the whole interface today and the validator's messages when someone needs them, which is the right order: the interface is what everybody sees, and an import error is what somebody sees on a bad day. The decision that produces a message stays next to the message, which is what keeps them honest, and the boundary is visible in `src/ui/shared/wording.ts`, where numbers become sentences. If the core's messages are ever translated, this decision is the one to supersede.

---

## ADR-023: A suspended tab is recovered to the page it stands for

Date 2026-09-25. Status accepted. Scopes T-601 to T-609.

**Context.** A tab suspender frees memory by replacing a tab's address with one of its own pages and keeping the real address inside it. To the browser, and therefore to every honest export, that tab is an extension page. It cannot be reopened by any other browser, it dedupes against nothing, `web pages only` drops it, and a sort by address files it under the suspender. A real export from a real session made this concrete: 34 tabs, of which 30 were parked by The Great Suspender (notrack) and 1 was an `edge://` page, leaving 3 that would open anywhere. A product whose promise is not losing tabs was losing seven out of eight.

**What the suspenders actually do**, read from their own source rather than assumed:

| Family | Page | Carrier |
|---|---|---|
| The Great Suspender and its forks, including (notrack) and The Marvellous Suspender | `suspended.html` | `#ttl=<enc>&pos=<n>&uri=<raw>`, with a legacy encoded `url=`. The `uri` value is not encoded and runs to the end of the string |
| Tiny Suspender | `suspend.html` | `?url=<enc>&title=<enc>&favIconUrl=<enc>`, with a legacy `#uri=&title=` |
| Auto Tab Discard, v2 dummy mode only | `plugins/dummy/page.html` | `?title=<enc>&href=<enc>&icon=<enc>` |
| Firefox reader mode | `about:reader` | `?url=<enc>` |

Chrome's Memory Saver, Edge's sleeping tabs, Firefox's tab unloading, and Auto Tab Discard's current build all use the native discard API, which keeps the address. They need nothing from us.

**Options.** Match on a list of extension ids, which is exact and stale the day a fork ships, and your own suspender is a fork of a fork. Or match on the shape of the address, as `core/adapters/detect.ts` already does for foreign formats. Or do nothing and leave the user to unsuspend every tab by hand before exporting.

**Decision.** Recover by shape, in `src/core/unsuspend.ts`, at two call sites: before the filters on export, and at the import boundary for files already written and for other tools' exports. Four named rules for the families above, then a generic rule for any extension page carrying an absolute http or https address in a parameter named `uri`, `url`, `u`, `href`, `target` or `originalUrl`. On by default, with a setting. Every recovery is counted and named, in the export report and on the line that describes an imported file.

The address that comes back is always an ordinary web address. An intermediate may be another wrapper, up to three deep, but `javascript:`, `data:`, `file:` and a browser's own pages stop the chain, so a recovery can never manufacture a dangerous address out of a harmless one. `src/core/urls.ts` judges it again before anything opens.

**What is not recorded.** The pack holds the page's address and nothing about the wrapper. A `suspendedFrom` field would add a v1 field no reader will use, for provenance the report already states. The scroll position a suspender keeps is dropped, because TabsPack does not model scroll and inventing a field for it would put it in the format forever. The suspender's own favicon is dropped, since a sleep icon beside a recovered page is a picture of something no longer true; a favicon the wrapper carried for the real page is kept.

**Consequence.** The generic rule is the one that can do damage: an extension page that legitimately carries a `?url=` would be rewritten. It is contained by requiring an absolute http or https value, by reporting every recovery rather than performing it silently, and by the setting. Twelve negative cases are in the suite, including an extension's own options page, and the risk is named in `docs/LIMITATIONS.md`. The user's own file is the regression test: 30 recovered, 33 of 34 openable, the `edge://` page the only one left behind.

---

## ADR-024: A restored tab is created unloaded

Date 2026-09-25. Status accepted. Amends FR-208.

**Context.** The default was to load the first 20 tabs of a restore and unload the rest. The people this product is for do not have 20 tabs. They have 50 to 200, which is why they are moving a session between browsers at all, and 20 pages loading at once on a machine already holding their working set is the moment the browser stops answering.

**Options.** Keep the threshold and document a recommendation nobody reads. Make the threshold zero, which reads as a magic number. Or state the behaviour as what it is, a toggle, and keep the threshold for the person who wants the old shape.

**Decision.** `unloadRestored` is on by default: every restored tab is created unloaded, except the one active tab per window, which no browser will leave unloaded. The threshold stays for when the toggle is off, and the options page disables it while the toggle is on rather than hiding it, so the number a user chose is still legible.

Gecko creates a tab unloaded and nothing else happens. Chromium has no such option, so the tab is created and unloaded straight after, and that flush runs once per batch with one batch of lag rather than once per window: a tab asked to unload in the turn it was created is still navigating and the browser refuses. The lag caps how many pages are ever loaded at one time at roughly the batch size, which is the difference between a 200 tab restore costing 8 tabs of memory and costing 200.

**Consequence.** A restore looks instant and costs almost nothing until a tab is opened. A recovered suspended tab comes back as an ordinary unloaded tab rather than as a page belonging to a suspender, which is the same memory result without depending on a third party extension: TabsPack never writes another extension's address into a tab. `adapter.discardTabs` now answers with the tabs it actually unloaded, so the report counts what happened rather than what was asked for. The path cannot be exercised in the headless Chromium the smoke run uses, where one `chrome.tabs.discard` call takes the browser down: measured, and recorded in `docs/LIMITATIONS.md` Table L3 and in the manual matrix, T-507.

---

## ADR-025: A tab is unloaded only once it has an address, and its new id is followed

Date 2026-09-25. Status accepted. Amends ADR-024. Scopes T-507.

**Context.** ADR-024 made every restored tab unload by default. The cross browser matrix, run against real Chrome 154, Edge 153 and Firefox 156 rather than against the headless browser the smoke run uses, found that this was quietly ruining the restore on Chromium. Both causes were measured with a probe, not deduced:

| What was measured | Result |
|---|---|
| `tabs.create` then `tabs.discard` immediately, the way the engine did it | The tab reports **no address at all**: `url` empty, `pendingUrl` empty, `title` empty. Activating it does not bring the page back. The page is gone |
| The same, waiting until the tab reports an address first | Address kept, title kept, unloaded as asked. The wait was **100 ms** |
| The id, either way | **Changes.** Chromium replaces the tab when it unloads it, and `tabs.discard` answers with a different tab id |
| Firefox, a pinned tab created with `discarded: true` | Reports itself unloaded, then loads anyway |

The consequences in the product were exactly as bad as they sound. A restore with unloading on produced blank tabs. Every id held after an unload was stale, so grouping, opener relationships, muting and the final activation all silently missed their tabs: a real Edge restore reported "2 restored ungrouped" for a pack whose group it had just created. And the older default was no defence, only a smaller blast radius: before ADR-024 the same loss hit every tab past the twentieth, so a 200 tab restore came back with 20 pages and 180 blank tabs.

**Options.** Unload only at the very end of a window, which keeps ids valid for the fixups but lets every tab in the window load first, which is the memory cost the feature exists to avoid. Or keep the per batch flush and deal with both facts directly.

**Decision.** Three changes, all in `src/core/restore.ts` and the adapter:

1. Before unloading a batch, each tab is given up to three seconds to report an address, polled every 15 ms. A tab that never reports one is unloaded anyway, because a tab that will not commit will not load either.
2. `adapter.discardTabs` answers with `{ from, to }` for every tab it unloaded. The engine queues **positions** rather than ids and rewrites `createdIds` from that answer, so grouping, openers and activation all act on tabs that still exist.
3. The report's unloaded count is recounted from the browser at the end rather than trusted from each creation, because of the Firefox pinned tab above. A count a user cannot check against their own tab strip is worth nothing.

**Consequence.** The lag of one batch means the wait almost never waits: the previous batch has long since committed. A restore of 200 tabs takes 14 seconds in Chrome, 21 in Edge and 8 in Firefox, and leaves 199 of them unloaded, measured. The fake browser now models both Chromium behaviours and the Firefox one, so the unit suite fails without any of the three fixes: eight tests fail without the wait, nine without the id remapping, one without the recount. `npm run matrix` is what found this, and it is the reason that script exists.

---

## ADR-026: Only a committed address counts as an address

Date 2026-09-25. Status accepted. Amends ADR-025. Scopes T-612.

**Context.** ADR-025 waited for a tab to report an address before unloading it, and the test for "has an address" was `url` or `pendingUrl`. That is wrong, and the whole matrix passed anyway.

`pendingUrl` is the address a tab is **on its way to**. `url` is the one it has **committed**. A tab reporting only `pendingUrl` has committed nothing, so the very condition ADR-025 was written to avoid was satisfied by the thing that proves it has not happened yet. Chromium sets `pendingUrl` on the first tick after `tabs.create`, so `settle` returned on its first poll, every time, and the discard landed mid flight.

Nothing caught it because every restore row in the matrix and every restore in the smoke run points at a port nothing listens on. A refused connection commits in well under a millisecond, so `url` was already set by the first poll and the `pendingUrl` branch never decided anything. Measured, on a real pack of 50 remote pages in Edge 153 and Chrome 154:

| Pack | Restored | Came back blank |
|---|---|---|
| 200 tabs on a refused local port, which is what the matrix ran | 200 | 0 |
| The user's own 50 tab session, real sites | 48 | **47** |

The user reported it as "errors in more than 50% of URLs". It was 47 of 48: `url` empty, `title` empty, `discarded` true, and no way to get the page back. The file was intact, so nothing was lost permanently, but a restore that destroys the session it is restoring is the worst defect this product can have, and it shipped past a matrix built specifically to catch this class of thing.

**Options.** Accept `pendingUrl` and lengthen the wait, which does not help, because the flag was never evidence of anything. Or wait for `url` alone and unload whatever has not committed by the deadline, which is what ADR-025 said in words and is still a loss. Or wait for `url` alone and never unload a tab that has not committed.

**Decision.** `settle` returns the ids that have actually committed, and the unload discards only those. A tab that has not committed by the batch's deadline is carried to the end of the window and tried once more; one that still has not is left loaded, and counted as loaded. **Memory is a cost. A lost address is a lost page.** The two are not traded against each other in either direction.

**Consequence.** Measured on the same 50 tab session: 48 restored, 0 blank, 46 unloaded in Chrome, 44 in Edge. It is slower, because the waiting is now real: 15 seconds in Chrome and 21 in Edge against 1.3 seconds to destroy it, with the progress line counting up throughout. The 200 tab local row is unchanged at 13 seconds, because those pages still commit immediately.

Two guards, because the unit suite alone did not fail and the matrix alone did not fail:

- The fake browser reports `pendingUrl` with an empty `url` while a navigation is in flight, and `commitReads` says for how many polls. A local page took one, which is why one was enough to pass. Three tests fail without the fix.
- The matrix serves its own pages, slowly, on a real socket: 24 tabs, 400 ms before the response headers, asserting that not one address was lost. That row is the one that did not exist, and it is the reason this got through.

---

## ADR-027: A refusal about one tab is not a verdict about the browser, and `about:blank` is not an address

Date 2026-09-25. Status accepted. Amends ADR-026. Scopes T-613.

**Context.** ADR-026 fixed the Chromium loss and the Firefox matrix then failed intermittently: one run in four lost an address from a four tab restore, and the tab came back `about:blank`, unloaded, with a title derived from the address it should have held. A four tab row cannot tell a rig problem from a browser one, so the row was rebuilt to name what was missing and print the tab strip. It then failed every run, and named two separate defects.

**The first.** Firefox refuses `tabs.create({ pinned: true, discarded: true })` with, in its own words, "Pinned tabs cannot be created and discarded." The engine's probe for whether a browser can create a tab unloaded is a `try` around that one call, and any refusal set `discardOnCreate = false` for the rest of the restore. The reference pack's first tab is pinned. So one pinned tab told the engine that Gecko could not create unloaded tabs **at all**, and every tab after it took the Chromium path of create, wait, unload, which is the path with something to lose.

**The second, which is what it then lost.** A new tab on Gecko reports `url: "about:blank"` while its navigation is in flight, not an empty string. ADR-026 had just made an empty `url` the test for "not committed yet", and `about:blank` is not empty, so the wait ended immediately and the unload landed mid flight all over again. Same defect, one layer down, hidden behind a guard that was measured on the other engine.

| Row | Before | After |
|---|---|---|
| The 4 tab restore, Firefox 156 | 2 of 4 addresses, twice in a row | 4 of 4, three runs in a row |
| The 200 tab restore, Firefox 156 | 200 of 200: the loss needed a pinned tab in the pack | 200 of 200 |
| `tabs.create` with `discarded: true`, 40 tabs, no pinned | 40 of 40 | 40 of 40 |

**Decision.** Two changes:

1. A pinned tab never asks to be created unloaded, on any engine, and a refusal of that pair never reaches the capability probe. Nothing is lost by not asking: Firefox loads a pinned tab straight after agreeing to unload it, which ADR-025 already had to work around. The cost is that a pinned tab restored on Gecko takes its title from its page rather than from the pack, like every tab on Chromium.
2. `about:blank` counts as an address only for a tab whose pack entry asked for `about:blank`. The engine already knows what each tab was asked for, so `settle` now takes that and compares, rather than testing a string for emptiness. A redirect still counts, because the tab has committed something of its own.

**Consequence.** Three consecutive Firefox runs at 25 of 25 rows, where the same harness failed two rows in two of six runs before. Both fixes are load bearing in the unit suite: two tests fail without the first, one without the second. The fake browser grew a `gecko` mode that reports `about:blank` while navigating and refuses the pinned pair in Firefox's own words.

The lesson is the one ADR-026 already paid for and did not fully learn. **A guard measured on one engine is a guard on one engine.** Both of these were introduced by a fix for the same class of defect, on the other engine, the same day.

---

## ADR-028: Settings are a pane of the manager page, not a page of their own

Date 2026-09-26. Status accepted. Supersedes the page split assumed by T-501. Scopes T-511.

**Context.** The product had two full page surfaces, `manager.html` and `options.html`, with the same header and the same cards. A user seeing both asked why. The honest answer is that `options_ui.page` is a manifest field and the browser builds its own links to whatever it names, so one document has to answer them. That is a reason for a route, not for a second page.

Counted control by control, the settings page was mostly a second set of widgets over the same stored values:

| | Count |
|---|---|
| Controls on both pages, writing the same setting | **15** |
| On the settings page only | 8 |

Scope, format, titles, favicons, private windows, dedupe, web pages only, skip pinned, sort, reverse, exclude, restore target, skip open, unload, threshold. Not defaults against a current run either: the manager's controls write the stored setting on every change, and both pages followed each other live through `storage.onChanged`. Two widgets, one truth, kept in sync at runtime.

**Options.** Leave it, and keep fifteen duplicates. Or merge, and move the settings page's cards into a pane, which keeps all fifteen duplicates behind a rail and permanently doubles the widgets, the strings and the tests. Or merge, and let each setting live once.

**Decision.** One document, a vertical rail of five: Export, Import, Snapshots, then Settings and About behind a hairline, because the first three are tasks and the last two are not. A setting that belongs to a task lives with that task and is saved there. Settings holds only what belongs to no task: suspended tab recovery, restore speed, theme and reset. About holds the version, the privacy line and the keyboard shortcuts the browser reports.

- `options_ui.page` is `manager.html#settings`. **Measured, not assumed:** Chrome 154, Edge 153 and Firefox 156 all accept a fragment there and land on the settings pane, and there is a matrix row for it on both harnesses. No redirect shim is needed.
- The gear does not use `runtime.openOptionsPage`, because a browser that finds a manager tab already open focuses it without changing the fragment, and the user who pressed the gear would land on whatever pane it was showing. It opens the address directly.
- The address follows the pane, with `replaceState` rather than a push, so a reload comes back where the user was and a pane can be linked to. A rail is not browsing, and five entries in the back button would say it was.
- `#export=<scope>`, the keyboard command's handoff, stays an action and is still cleared after it runs.
- Below 900px, and at the 200 percent zoom DESIGN section 6 commits to, the rail becomes the horizontal strip this page used to have. Same markup, same keys, no script.
- The scope control gains **This tab**, which was previously reachable only from a dropdown on the settings page and would otherwise have been lost.

**Consequence.** Fifteen duplicate controls gone, one settings module instead of a page, 19 message keys removed and 7 added. The cost is discoverability: someone who opens Settings looking for their export defaults finds none, so the pane opens with one line saying where they are. That line is cheaper than fifteen widgets and more honest than two.

A smoke check now asserts the property directly rather than trusting the diff: no control id on the settings pane appears on the export or import panes.

---

## ADR-029: A success is reported as a success

Date 2026-09-26. Status accepted. Scopes T-701.

**Context.** A user sent a screenshot of a finished export, annotated: "Is this success or failure or warning? The colour coding and icons are misleading." They were right. `renderExportReport` set the tone to `warn` whenever any filter had removed anything, and **Remove duplicates is on by default**, so an ordinary export that had worked perfectly came up amber with a warning triangle beside it.

**Decision.** An export that produced a file or filled the clipboard is a success. Filters removing what they were told to remove is detail, and detail goes in the muted line underneath, where it already was. Warn is kept for something the user did not ask for, and error for a failure, which `renderError` already handles.

**Consequence.** One line of code, and the first thing a user sees after the product's main action now means what it looks like. A smoke check asserts the tone, because the count in the report was never the part that was wrong.

---

## ADR-030: The tab groups permission is asked for where it is lost, not only where it is used

Date 2026-09-26. Status accepted. Supersedes ADR-019. Scopes T-702, T-703.

**Context.** A user exported from Edge and from Chrome, restored, and the groups came back with the right tabs in them and no names. Their file says why:

```json
"groups": [{ "id": "g1" }]
```

No title, no colour. `capabilities().tabGroups` is `typeof browser.tabGroups?.query === "function"`, and **without the optional permission that namespace does not exist at all**, so the collector never queries a group and writes bare membership. Membership survives because it is read from `tab.groupId`, which needs no permission. So the export loses the names, silently, and the only place the permission was ever offered was the import side, after a pack with groups had been loaded. A user who never imports never sees the offer, and their exports are quietly lossy for as long as they use the product.

ADR-019 put the request behind a button in the preview, which was right about the mechanism and wrong about the place.

**Decision.** One component, `shared/groups-callout.ts`, used by both panes:

- **Export** shows it when the current scope contains a group and the permission is missing. That is before the file is written, which is the only moment it can still help.
- **Import** shows it when the loaded pack contains a group, as before.
- The export report counts groups that have no name and no colour and says so, so a file that is already lossy is not silent about it.
- A refusal is an answer: the callout says what will happen instead and stops asking.

The same click still opens the browser's own dialog, because there is no API that shows it without one. A user asked whether a native prompt could be used instead; this is that prompt, and our button is the only thing that can summon it.

**Consequence.** The thing that was invisible is now impossible to miss, and the case where it is already too late is reported rather than discovered weeks later. Three unit tests cover the count; a smoke check asserts the callout is above the cards rather than below them.

---

## ADR-031: A callout goes above the work, and the preview is revealed before it is measured

Date 2026-09-26. Status accepted. Scopes T-703, T-705, T-706.

**Context.** Three complaints about the import screen, from one session with a real user:

1. The tab groups notice was "very in-line and not attractive enough to trigger an action". It was a row at the bottom of the preview card, below a tree of fifty rows.
2. The drop target stayed poster sized after a file had loaded, pushing the thing the user came for down the page.
3. Once, an import read the file and showed no list at all. Repeating the import worked.

**Decision.**

- A **callout** component: a banner at the top of a pane, above the cards, with a coloured bar, a glyph, a sentence and the action. Tone carried by bar, glyph and words, never by background alone. It is not a modal: a dialog asking for a permission the browser is about to ask for again is one layer too many.
- The **intake card folds** to its summary line once a pack is loaded, with one button back. Folded, not removed, because the file line has to stay attached to the card that explains where the file came from.
- For the third, the cause was not found. Two things that could produce it were fixed instead, and both are right regardless. The preview is **revealed before the tree loads**, because the tree only renders the rows inside its viewport and cannot measure a viewport that is `display: none`; it fell back to a guess. And **every failure in the read now reaches the screen**: it was an unhandled rejection, which is exactly the reported symptom, a file line saying the pack had been read and no preview underneath.

**Consequence.** Measured after the change: revealing first makes the first paint render 24 rows against the real 420px box rather than about 12 against a guess. Fifteen consecutive imports of three real packs in a real Edge all showed their list, and the smoke run now imports twice in a row and asserts both. The original report is not reproduced and is not claimed to be fixed, only that two ways it could happen are gone.

---

## ADR-032: Titles on, favicons off, and a switch that means what it says

Date 2026-09-26. Status accepted. Amends ADR-011. Scopes T-704.

**Context.** A user asked for titles on by default and questioned whether favicons should be. Looking properly at both turned up a third thing.

**Titles.** `textIncludeTitles` was off, so the URL list export was a column of bare addresses. The one reason to export as text is to read it.

**Favicons.** `keepFavicons` was on. Measured on the user's own two files: favicon URLs are **7 to 9 percent** of the bytes. Nothing in TabsPack reads them. The preview shows a group dot, not an icon; no browser lets an extension set a favicon on a restored tab; the browser fetches the real one when the page loads. They are also third party URLs recorded in a file a user may hand to somebody else.

**And the thing found on the way.** `keepableFavicon` dropped only `data:` icons when the setting was off and kept every remote one regardless. A checkbox labelled "Favicon URLs" removed almost nothing when cleared. The label was not true.

**Decision.** `textIncludeTitles` defaults to on. `keepFavicons` defaults to off, and now means what it says: off is none, on is all of them including the embedded ones. The switch stays, because the format is public and another tool may want them.

**Consequence.** A text export is readable, a pack is 7 to 9 percent smaller, and a control does what its label promises. Two tests pin the defaults so a later change is deliberate, and one covers the switch in both directions.

---

## ADR-033: The toolbar says what happened, from whichever surface did it

Date 2026-09-26. Status accepted. Scopes T-707.

**Context.** The badge was a bare count in one colour, set only by an export started from the popup. An import set nothing at all, so a restore of two hundred tabs could finish with the manager page behind three other windows and no sign anywhere that it was done. A user asked for "better import succeeded / export succeeded / failed notifications from our icon in the address bar".

**Options.** The `notifications` API puts a system toast on screen, which needs another permission, another store justification, and is the thing users mute first. Or use the two signals the toolbar already has.

**Decision.** Two signals, doing different jobs. The **badge** is four characters and a colour: blue `…` while working, green with the count when it worked, red `!` when it did not. The **tooltip** is a sentence, which is the only place on the toolbar one fits: "Exported 42 tabs to tabspack-20260926-0915.tabspack.json". Every surface goes through `shared/notify.ts` so the popup, the manager page and the keyboard commands all say the same thing the same way. Colour is never the only signal: the count, the `!` and the sentence all change too.

**Consequence.** `setBadge` takes a tone and `setActionTitle` is new on the adapter. The unused `badgeMs` setting, which had no control anywhere, is gone. Smoke checks read the real badge colour and the real tooltip out of a real browser after a real export.

---

## ADR-034: An unsigned Firefox build cannot be installed, and the error does not say so

Date 2026-09-26. Status accepted. Scopes T-709.

**Context.** A user tried to install the Firefox build through `about:addons` and got **"This add-on could not be installed because it appears to be corrupt"**. The file was fine. Release Firefox refuses any extension Mozilla has not signed, and says nothing about signing, so the message sends you looking for a broken build.

**Decision.** Nothing in the product can change this, so the fix is packaging and words. `npm run pack` writes every artefact to `dist/artifacts/`: the Chrome zip, the Edge zip, the `.xpi`, and the source archive AMO asks for, built from `git ls-files` so an ignored file cannot leak into a public archive. `docs/store/submission.md` names the two routes that actually work, `about:debugging` for a temporary install and Developer Edition with `xpinstall.signatures.required` off for a permanent one, and says that release Firefox will take the `.xpi` only once AMO has signed it.

**Consequence.** AMO's own linter reports zero errors on the generated `.xpi`.

---

## ADR-035: A support form that sends no request and ships no key

Date 2026-09-26. Status accepted. Scopes T-710.

**Context.** A support form was asked for, with a Resend account and two addresses. Two things stand in the way, and only one of them is a matter of taste.

**The key cannot ship.** An API key inside a published extension is a public key. Anyone can unzip the package and read it, and then send mail as `@palworks.ai` until the domain's sending reputation is gone. No obfuscation helps: the code has to read it at runtime, so a person can too.

**The claim would stop being true.** "No network request of any kind" is in `PRIVACY.md`, in all three store listings, and in `scripts/lint.mjs`, which fails the build on any `fetch` in `src/`. That rule caught the first draft of this feature, which is what a rule is for.

**Options.** Ship the key, which is not an option. Or POST to a relay that keeps the key server side, which needs hosting and costs the claim. Or hand the composed message to the user's own mail client.

**Decision.** The form is in the extension, the message is composed in `core/support.ts`, and it is handed to the user's mail client with `mailto:`. The extension makes no request, the claim stays true as written, and the user sees the message one more time before it goes. `server/support-worker/` holds the relay, deployable, deliberately **not** wired in: switching to it means editing the lint rule, the privacy policy, both store answers and writing a record that supersedes this one, which is the right amount of friction for a change of that kind.

Three rules hold the form itself:

- **What is sent is what is on screen.** Nothing is added on the way out.
- **Nothing about your tabs.** Not an address, not a title, not a count. A test asserts it.
- **The diagnostics are visible whether or not they are switched on**, greyed when off, because "include which browser I am using" is only a real choice if you can read what it means.

**Consequence.** A message too long for a `mailto:` is refused rather than truncated, and copied to the clipboard instead, because half a bug report is worse than none. Eight unit tests cover the composer.

---

## ADR-036: A rating is asked for at most three times, ever, and only after real use

Date 2026-09-26. Status accepted. Scopes T-711.

**Context.** A periodic rating nudge was asked for, "until they have rated us". The literal version of that is the pattern that makes people uninstall things, and no browser tells an extension whether a review was left, so "until they have rated" is not knowable.

**Decision.** Five rules, in `core/rating.ts` because a rule in code is a rule:

1. **Earned, not timed.** The counter is finished exports and restores, not days installed. Someone who never used it has nothing to say, and asking them produces the one star that says so.
2. **Never during the work.** It appears after an action finishes, at the top of the pane the user is already on, never in the popup.
3. **Three answers, two of which end it.** Rate, not now, don't ask again.
4. **At most three asks in a lifetime**, at 8, 40 and 150 uses, with a fortnight and then two months between them. After that it stops by itself.
5. **A click through is treated as done.** Pretending to know whether a review was left would mean asking someone who has already written one.

An ask with nowhere to go is worse than no ask. The first version of this built the Chrome link out of the runtime extension id, which looks right and is wrong: an unpacked build has a runtime id too, so a development install produced a confident link to a Web Store page that did not exist. The audit at the end of the phase caught it only because the check that was supposed to prove it passed for the wrong reason. The listings are now written down in one place and are **empty until a store has accepted a submission**, so today nothing is shown at all, which is correct: nothing is published to rate. Filling them in belongs to T-509.

**Consequence.** Seven unit tests, one per rule, plus one that asserts there is no link yet. When a listing is added it also has to be added to the lint rule's allowlist, which is the reminder that it is a real address: the rule forbids remote **resources**, and a page the user clicks through to is a navigation, not a resource.

---

## ADR-037: Who made it, once, at the foot of About

Date 2026-09-26. Status accepted. Scopes T-714.

**Context.** A line about palworks.ai was proposed, with the question of whether it was a bad idea.

**Decision.** It is a good idea, in one place and in a quiet voice. A named maker is a trust signal, store reviewers prefer a real publisher to an anonymous one, and anyone who wants to know who has their data deserves an answer on the page rather than in a listing.

Two constraints make it safe. It goes at the **foot of About**, under the privacy paragraph, so nothing about it reads as a service being introduced. And it is a **link the user clicks**, never anything a page loads: the address is set in script, it is in the lint allowlist with that reason, and no page fetches anything from it. The licence still says "TabsPack contributors", because attribution and copyright are different things.

---

## ADR-038: An address that is not ours is opened as it was given

Date 2026-09-26. Status accepted. Scopes T-710, T-711.

**Context.** The adapter had one way to open a tab, `openExtensionPage(path)`, and it resolves its argument against the extension's own origin:

```ts
const url = browser.runtime.getURL(path);
```

Both new features needed to open something that is not ours: a `mailto:` for the support handoff, and a store page for the rating. Handed to that method, `mailto:support@palworks.ai?...` becomes `chrome-extension://<id>/mailto:support@palworks.ai?...`, which opens an empty tab and nothing else. Neither feature would have worked, and neither unit test could see it, because the fake adapter records whatever string it is handed.

Found by reading the adapter while auditing the phase, not by a test. Written down because the name was the trap: `openExtensionPage` sounds like "open a page", and it means "open a page of ours".

**Decision.** `openExternal(url)` opens an address exactly as given. `openExtensionPage(path)` keeps its meaning and its name. Three callers use the first, two use the second, and the difference is now visible at every call site.

**Consequence.** The browser audit opens the support form for real and asserts that what lands is a `mailto:` rather than an extension URL with one glued to it. A `mailto:` may open no tab at all, because the operating system takes it, so a refusal is reported by throwing and the page offers Copy instead.

---

## ADR-039: One request, to one address, that the user grants and can refuse

Date 2026-09-26. Status accepted. Supersedes ADR-035 in part. Scopes T-715.

**Context.** ADR-035 shipped a support form that made no network request: it composed the message and handed it to the user's own mail client. That was the right first move and it kept `PRIVACY.md` true as written. It also assumed a configured mail client, and the person who asked for the form came back with the reason it is not enough: **a lot of people do not have one.** On those machines the Send button opened nothing. The message was still on the clipboard and the page still said so, but a support channel whose happy path is "paste this into webmail yourself" is not a support channel.

Nothing in ADR-035's reasoning about the key has changed, and nothing in it is being reversed. An API key in a published extension is still a public key. What changes is the answer to the second question: whether the network claim is worth more than the support channel.

**Options.**

| | Cost |
|---|---|
| Leave it as it is | Everyone without a mail client has no way to report a bug, which is most of the people most likely to hit one |
| Ship the key and send directly | Not an option, for the reason ADR-035 gives |
| Relay through a worker, with the host as a **required** permission | Every install shows "read and change your data on tabspack-support.palworks.ai" at the prompt, for a feature almost nobody uses. The permission dialogue is the most expensive screen in the product |
| Relay through a worker, with the host as an **optional** permission | Install prompt unchanged. The browser asks the first time Send is pressed, which is the moment the user is choosing to contact us. Costs the absolute form of the network claim |

**Decision.** The last one.

1. **The relay holds the key.** `server/support-worker/` is deployed. The extension knows one address and no secret.
2. **The host is optional and asked for at the point of use.** A default install has no host access at all. `manifest.*.json` lists `optional_host_permissions`, and the request is made inside the click on Send, which is also the only way Chromium will honour it.
3. **Refusing is a supported answer, not an error.** Declined, offline, rate limited, refused, timed out, or deployed nowhere: every one of them falls back to the mail client and then to the clipboard. `sendViaRelay` cannot throw and cannot return anything the caller has no branch for.
4. **One file may make a request.** `scripts/lint.mjs` still fails the build on `fetch` anywhere in `src/` except `src/core/relay.ts`, and only on `fetch`: `XMLHttpRequest`, `WebSocket` and the rest stay banned everywhere including there. "TabsPack talks to exactly one address from exactly one place" is a fact a reviewer can check in a minute.
5. **The address is written four times and checked.** `src/core/relay.ts`, both manifests, and the worker's route. A new lint rule fails the build if any of them disagree, because a Send button pointing at a host nobody deployed fails silently and nothing else would notice.
6. **The payload does not grow.** Four fields: subject, body, reply address, and an always-empty honeypot. It is the message the user read on screen, and the test that proves no tab data can reach it is now two tests.

**What the privacy claim becomes.** "TabsPack makes no network request" becomes "TabsPack makes no network request unless you press Send in the Support pane, and your browser asks you first". That is a longer sentence and a worse headline, and it is the honest one. `PRIVACY.md`, both store documents and the listing copy all change in the same release, which is what ADR-005 says has to happen.

**Two things found by making one request before deploying anything.**

The obvious hostname, `support.palworks.ai`, **was already live**, serving a Cloudflare Worker belonging to a different product on the same domain. Deploying over it with `custom_domain = true` would have taken that product down, and in the meantime every TabsPack support message would have been posted to a stranger's endpoint. The relay is therefore at `tabspack-support.palworks.ai`, and the lesson is cheap and general: a hostname you own the domain of is not a hostname that is free.

That also exposed a real defect in the client, which treated any `response.ok` as a delivered message. The endpoint that was already there answers with HTML. A captive portal, a corporate proxy, a parked domain and a misrouted host all do the same. `sendViaRelay` now requires the worker's own `{"ok":true}` body, because telling somebody their bug report was sent when it went nowhere is the worst thing this function can do: a duplicate costs nothing, a silently swallowed report costs the report.

**Deployed 2026-09-26** to `tabspack-support.palworks.ai`, with a Resend key that is send-only and scoped to the `palworks.ai` domain, so a compromise of it buys the ability to send as us and nothing else: no logs, no contacts, no minting further keys. It is a key of TabsPack's own rather than one shared with the other products on that domain, so revoking it breaks only this. Verified end to end from the shipped extension in a real browser, with the message delivered to the inbox and its body identical to what was on the screen.

One measured surprise worth recording: Cloudflare's rate limiting binding is **approximate**. With the limit set to 1, three requests got through before the fourth was refused, because the counter is per colo and eventually consistent. It is a brake on a flood, not a quota, and the daily counters in KV are the real ceiling. That is why they are checked after it rather than instead of it.

**The two deploy identifiers are not committed.** The Cloudflare account id and the KV namespace id are not credentials, and Cloudflare documents both as safe for version control. They are still kept out, because this repository is public and naming the account anything runs on buys nothing. `wrangler` does not substitute environment variables in its config, which was measured rather than assumed, so `scripts/deploy-relay.mjs` renders the committed template from an uncommitted `.env`, deploys with `--config`, and deletes the rendered file in a `finally`. A lint rule fails the build on any 32 character hex string in the committed config, because a convention nothing enforces is a convention that lasts until the next person is in a hurry.

**Consequence.** The Support pane gains a second button, "Use my email app", so the original route is still one click for the people who prefer it, and it is where Send lands when anything goes wrong. The worker is open to the internet by construction, so it is capped three ways and holds no state; past the global cap it answers 429 and the extension uses the mail client, which means the worst outcome of an attack on it is a slower support channel rather than a lost message or a bill. Eleven unit tests cover the client, and every refusal path in the worker was exercised against a local deployment before it shipped.

---

## ADR-040: The site is committed HTML, rendered by a script, and loads nothing from anyone else

Date 2026-09-26. Status accepted. Scopes T-716.

**Context.** TabsPack needed a public site: something to link from a store listing, somewhere to host the privacy policy and the terms at a stable address, and a page that makes the case for the product to someone who has never heard of it. Ten pages, one of them long.

**Three questions, and only the third is interesting.**

**Where it is hosted.** GitHub Pages, from the repository that already holds the source. No account to add, no bill, and the thing that is served is a commit anybody can read. The alternative was a hosting platform with a build step and a dashboard, which is more moving parts than a ten page static site can justify.

**Whether the HTML is committed or built.** Committed. GitHub Pages should serve exactly what is in the repository: a site whose deployed content is the output of a build nobody can inspect is the same trust problem as an extension whose source is not published, on a smaller scale.

**Whether the pages are hand written.** No, and this is the part worth recording. Ten pages that share a header and a footer, written by hand, are ten copies of the same navigation, and the copies drift. A link added to one page and not the other nine is the most ordinary bug a static site has, and nothing fails when it happens.

**Decision.** `scripts/gen-site.mjs` renders `website/` from a layout and ten page bodies in `scripts/site/`. The output is committed. `--check` re-renders into memory and fails if what is committed is stale, which is what the deploy workflow runs first, so a layout change that was never regenerated fails the build instead of shipping a footer that disagrees with itself.

**The site loads nothing from anyone else.** No font service, no analytics, no tag manager, no embedded anything. This is not minimalism for its own sake: the product's whole claim is that it does not phone home, and a marketing site that quietly loads six third party scripts while making that claim is the loudest possible contradiction. It also means the cookie notice can say there are none, and be right.

**Every link is relative.** The site lives at a repository subpath today and may live at a custom domain tomorrow. `scripts/check-site.mjs` fails on an absolute link to our own origin, with one deliberate exception: `404.html`, which GitHub Pages serves for a bad address at any depth and whose links therefore cannot be relative to anything.

**Consequence.** Two checkers, because they answer different questions. `check-site.mjs` reads the HTML: links resolve, images have dimensions and alt text, every page has a title, a description, a canonical and an OG image, structured data parses, the sitemap matches the pages. It needs no browser and runs in `npm run verify`. `check-site-browser.mjs` needs a layout engine, because whether a page fits on a phone is not a question you can answer by reading CSS. It found the bug that proves the point: every `minmax(300px, 1fr)` grid track was a 300 pixel floor inside a 280 pixel container, so **every page on the site scrolled sideways at 320 pixels wide**, and no amount of reading the stylesheet would have shown it.

Search and answer engines are served by the same facts rather than a second set: `SoftwareApplication`, `FAQPage`, `Organization`, `WebSite` and `BreadcrumbList` graphs generated from the page's own front matter, so a rich result cannot disagree with the page, and `llms.txt` and `llms-full.txt` for the crawlers that would rather read prose than parse markup. `robots.txt` allows every one of them, including the model crawlers: a product nobody has heard of gains more from being quotable than it loses from being trained on.

---

## ADR-041: The mark is the maintainer's illustration, and the master is a raster

Date 2026-09-26. Status accepted. Scopes T-713.

**Context.** The original mark was three bars and a download arrow, which is the most generic possible browser extension icon. Three rounds of agent drawn candidates followed, and the sheet that judged them at 16 pixels killed most of them: a folder, a briefcase, a mushroom, a tulip, an exclamation mark, a handbag and a hamburger menu, all of which looked fine at 128.

The maintainer then drew two of their own. **v2 could not ship**: its four windows were badged with the Chrome, Firefox, Edge and Opera logos, which are other companies' registered marks, and every store's brand policy prohibits a third party's marks in an extension icon because it implies an endorsement that does not exist. It also dissolved at 16 pixels. **v3 fixed both**: no trademarks, and an arrow large enough to survive.

**The interesting part is what happened next.** v3 was a 500 pixel raster, and the pipeline rasterised a vector, so the obvious move was to redraw it. That was tried twice and **both attempts were worse than the picture they were copying**: thinner, emptier, the fan too small, the arrow either too timid or so large it swallowed the window. Rendered side by side at 16, 20, 32, 48 and 128, the raster won every column.

That is an ordinary outcome and worth naming. Geometric marks redraw cleanly because their proportions are the design. An illustrative mark with depth, a gradient and overlapping planes has proportions that were arrived at by eye, and copying them by eye at a fraction of the effort produces something that is recognisably the same idea and recognisably worse.

**Decision.** `assets/icon.png`, 512 pixels, is the master. `scripts/gen-assets.mjs` renders it down to 16, 32, 48 and 128 and to the three store tiles.

Two things are done to it on the way, and both are in the pipeline rather than done by hand so they are reproducible:

- **The drop shadow is cropped off.** In the original it falls outside the tile on the right. The script crops to the opaque bounding box and masks to a rounded square, so what ships is the tile and nothing else.
- **An unsharp pass, hardest where the loss is.** Any downscale to 16 pixels is soft, and a soft toolbar icon reads as a mistake. After drawing the master into a canvas at the target size, a small unsharp kernel runs over it in the page: 0.9 at 16, 0.7 at 32, 0.4 at 48, nothing above. Alpha is left exactly as the downscale produced it, because sharpening it puts a hard fringe on the rounded corners. With that pass the raster beats the vector at 16 as well as at 128, which is what settled it.

**Consequence.** `assets/icon.svg` is gone. `gen-og.mjs` embeds the master as a data URI, and the in-product wordmark in the popup, the manager and the placeholder now points at `icons/icon-32.png`, which the build already copies, rather than carrying a second and older drawing of the mark. The original artwork and the comparison that decided it are kept in `assets/candidates/reference/`, and `npm run icons:compare` still works: it now shows the shipped mark alongside any new candidate, which makes it a tool for judging a replacement rather than for making the first choice.

The trade is that the mark can no longer be reasoned about as geometry or recoloured by editing one line. For an illustration that was never true anyway.

---

## ADR-042: Task ids keep their letter, and the backlog is ranked by return on effort

Date 2026-09-26. Status accepted.

**Context.** Two questions came from the maintainer on the same day. What do the `T-` and `B-` prefixes mean, and can the backlog be arranged so the small things that pay well come first.

Neither had an answer in the repository. The roadmap used the ids on every row and in every cross reference without ever saying what the letter was for, and it sorted Table R1 by id, which is the one ordering guaranteed to be unrelated to what is worth doing next. An id scheme nobody has written down is a private convention, and a backlog sorted by id is a filing cabinet.

**Options on the ids.** Renumber to a flat serial, which is shorter and needs no legend. Keep the letters and write the legend that was missing.

The count decided it. The ids appear 413 times across 70 files: beside the line of code that implements them, in test names, in ADRs, in the pull request template, and in ten commit subjects. Commit subjects cannot be rewritten on a published branch, so a renumber leaves history pointing at ids that no longer exist, permanently, in exchange for dropping one character. The letter also earns its place: `T-` is agreed work with acceptance criteria, `B-` is an idea that sequencing rule 5 forbids from entering the build until somebody writes them. That distinction is worth one character at the front of every id.

**Options on the order.** Rank by hand, which is honest about being a judgement but unfalsifiable and quietly re-argued every time the file is opened. Compute a rank from the Effort and Impact columns that were added the same day. Sort by impact alone, which puts every `L` and `XL` at the top and answers the wrong question.

**Decision.** The prefixes stay, and section 1 of the roadmap now explains them, including the part that is easy to get wrong: the digits are a serial in the order rows were written, not a phase number. `T-717` sits in phase M5.

Table R1 gains a Rank column, computed as `impact / effort` over `Critical 4, High 3, Medium 2, Low 1` and `S 1, M 2, L 4, XL 8`, ties to the higher impact then the lower id. Table R1b keeps its sort by id, because a closed row is history.

**Consequence.** The arithmetic is deliberately crude, and that is the point: a row moves up only by changing its Effort or its Impact, in a commit that says why. Preference alone cannot promote anything.

Two things the rank cannot see, both written into the roadmap next to it. It does not know dependencies, so `T-717` outranking `T-509` is a coincidence and not the reason it comes first; sequencing rule 1 and the Problem column carry that. And it does not know who can do the work, so rank 1 being `T-507`, four checks only a person can perform, is a true answer to "what is the cheapest win" and not an instruction to an agent.

---

## ADR-043: The format's canonical URL is the site, and it resolves

Date 2026-09-26. Status accepted.

**Context.** `schema/tabspack.v1.schema.json` declared `$id: https://tabspack.dev/schema/tabspack.v1.schema.json`, and `tabspack.dev` was never registered. No DNS record, no whois entry. The Firefox extension id, `tabspack@tabspack.dev`, leaned on the same name.

Nothing was broken. A JSON Schema `$id` is an identifier and a validator never has to fetch it, which is exactly why this survived from M1 to the eve of the first submission without anybody noticing. Two things were wrong anyway. A second implementer who does the obvious thing and follows the canonical address of the format finds nothing at all, which is a poor advertisement for a specification that asks to be reimplemented. And an unregistered domain in a published file is an invitation: anybody may buy it and become the authority on the address of our own format, in a file that by then is sitting on other people's disks.

Timing was the reason it mattered that week rather than eventually. The schema ships inside the package. Once a store accepts a build, changing the `$id` stops being an edit and becomes a question about what `schemaVersion` means, because files in the wild already name the old address.

**Options.**

*Register `tabspack.dev` and point it at the site.* The coherent answer. Short, quotable, survives the site moving, and the extension id already claimed the name. Costs about a pound a month and a DNS record, forever, for a product with no users yet.

*Point the `$id` at the GitHub Pages site.* Free, resolves the same day, and the site already exists with the privacy policy and the terms on it. The address is long and ties the identity of the format to a repository path, so moving the repository is a format event.

*Leave it.* Free and the only option under which a third party can own the canonical URL of the format.

**Decision.** The `$id` is `https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json`. The domain is bought when there is traction to justify it, which is the maintainer's call, and at that point the move is a `schemaVersion` decision under PLAYBOOK section 4.

**The part that is not a URL change.** A `$id` that points at nothing is the defect; a `$id` that points at a 404 is the same defect with extra confidence. So the site now publishes the schema at exactly that path, copied from `schema/` at render time rather than duplicated, and `scripts/lint.mjs` gained `ruleSchemaId`, which fails the build on any of three drifts: the `$id` not matching the site origin, the published path not existing, and the published bytes differing from the committed schema. All three were tested by breaking them.

**The Gecko id moved too**, to `tabspack@palworks.ai`. An extension id never resolves, so this changes nothing technically. It is done now because AMO fixes an addon's id permanently at first acceptance, and this is the last moment it is free. `palworks.ai` is already ours and already serves the support relay.

**Consequence.** The format has a citable address that works, which was one of the four things the B-503 exploration said a specification site actually buys. The cost is a long URL and a format identity tied to a repository path. Both are recoverable for the price of a domain; a squatted name would not have been.
