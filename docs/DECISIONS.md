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
