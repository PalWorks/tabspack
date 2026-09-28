# Plan: T-507, T-509, B-102, B-103, B-201, B-502

| Field | Value |
|---|---|
| Version | 0.2, accepted |
| Date | 2026-09-27 |
| Status | Decided 2026-09-28, see Table P3b. In progress |
| Rows | T-507, T-509, B-102, B-103, B-201, B-502, plus B-101, which two of them depend on |

## 1. The shape of it

These six rows fall into three groups that share almost nothing, so they
ship on three separate tracks rather than as one release.

### Table P1: Tracks and order

| Track | Rows | Ships as | Who does what |
|---|---|---|---|
| **A. Finish the launch** | T-507, T-509 | Store listings, then extension 1.0.1 | You: the twenty minute checklist, the Edge and AMO accounts, the uploads. Me: preparing the build, the listings and the manifest, recording results, and the post acceptance wiring |
| **B. The format as a library** | B-502 | An npm package, `0.1.0` | You: an npm account, and a token stored as a GitHub secret. Me: everything else |
| **C. Durability** | B-101, B-102, B-103, B-201 | Extension 1.1.0 | Me: all of it, behind acceptance criteria written first, as sequencing rule 5 requires |

Track A runs now, because it is waiting on reviewers rather than on code.
Track B can run at any time, because it touches no extension code. Track C
is the real engineering, starts once its decisions are made, and its order is
fixed by dependency: an engine both halves use, then B-101, B-102, B-103,
B-201.

**Why B-101 appears in this plan.** B-102's solution names "the most recent
automatic snapshot", and B-103 exists because "fifty near identical automatic
snapshots are noise". Neither has anything to work on until B-101 makes
automatic snapshots. Decision D1 is whether to add it.

### Table P2: Effort

| Row | Effort in the roadmap | Estimate here | Why it differs |
|---|---|---|---|
| T-507 | S | Twenty minutes for you, thirty for me | As stated |
| T-509 | M | About a day of mine, spread over review waits | AMO has two requirements the Chrome route did not: a data collection declaration and a source archive reviewers can build |
| B-502 | S | One to two days | The code exists and is pure. The work is the package boundary, the build, and proving the published tarball works outside the repository |
| B-101 | M | Two to three days | The alarm scheduling, the unchanged check, and a cap it has to respect |
| B-102 | L | Three to four days | Detecting what was lost after a restart without false alarms is the hard part, and it needs a crash test in the real browser matrix |
| B-103 | M | Two days | A pure diff module and one new view |
| B-201 | M | Two days | Shares the comparison module B-103 builds |

## 2. Decisions needed before Track C starts

Each has a recommendation. None blocks Track A or B.

### Table P3: Decisions

| # | Decision | Options and trade-offs | Recommendation |
|---|---|---|---|
| D1 | Add B-101 to this batch | **Add it**: B-102 and B-103 work as their rows describe, at two to three more days. **Leave it out**: B-102 relies only on its own recovery copy, and B-103 diffs manual snapshots, which are rarely near identical, so its pruning half has little to do | Add it |
| D2 | The recovery copy (B-102): on or off at install | **Off**, as the row says: nothing new happens without consent, but the users who most need recovery are the ones who never found the setting. **On**: it protects everyone from the first crash. It is still local only, but it changes what the product does without being asked, and the privacy answers must say so | Off, with a one line offer on the Export pane after the first export, so the setting is found at the moment it makes sense |
| D3 | How B-101 keeps a rolling series inside ADR-012 | ADR-012 says **nothing is ever deleted automatically**, and that B-101 must respect the cap. **(a) Keep ADR-012 exactly**: never write an unchanged snapshot, and at the cap stop automatic saving with a loud notice; the user prunes with B-103. **(b) Amend it with a new ADR**: keep the last N automatic snapshots and delete older ones, while manual snapshots are never touched. Automatic deletion is the thing ADR-012 exists to forbid | (a). Skipping unchanged snapshots removes most of the noise before it exists, and the principle survives intact |
| D4 | The npm package name, and whose account publishes it | **`@palworks/tabspack`**: scoped, so it needs a `palworks` npm organisation, and nobody can squat it once created. **`tabspack`**: unscoped and free today (checked 2026-09-27), shorter, but anyone could take it first. **`tabspack-format`**: unambiguous, also free | `@palworks/tabspack`, published from GitHub Actions with provenance, so every tarball is traceable to a commit |
| D5 | Release trains | **1.0.1 then 1.1.0**: the export preview and the import hint fix go out small and fast, and the durability work gets its own review. **One 1.1.0**: one review, but the export preview waits days behind the new permissions | 1.0.1 then 1.1.0 |

### Table P3b: What was decided, 2026-09-28

| # | Decision | Effect on this plan |
|---|---|---|
| D1 | Add B-101 | As planned |
| D2 | Recovery copy off at install, offered after the first export | As planned. **Revised 2026-09-28** by the maintainer: on from install, with no prompt and no notice, together with recent sessions (B-104). ADR-049 |
| D3 | **A rolling limit on automatic snapshots**, because the aim is less work for the user managing sessions, not more | ADR-047 amends ADR-012: automatic snapshots keep the newest N and the oldest beyond that are removed. Manual snapshots are still never deleted by TabsPack. Unchanged snapshots are still never written. B-103's tidy action stays, for the manual ones and for anyone who wants a shorter series |
| D4 | The unscoped name `tabspack` on npm, published from this machine's authenticated npm CLI | B-502 publishes as `tabspack`, not `@palworks/tabspack`. Provenance publishing from Actions can follow later with a token |
| D5 | One combined release, no hurry | Track A's 1.0.1 folds into 1.1.0. Edge and AMO receive 1.1.0 as their first version; Chrome receives it as the first update after 1.0.0 is accepted |

## 3. What the codebase already gives us

A reuse map, so nothing is built twice.

### Table P4: Existing pieces each row reuses

| Need | Existing piece | Used by |
|---|---|---|
| Writing and reading a session | `toFile`, `stringify` in `src/core/serialize.ts`; `fromFile` in `src/core/deserialize.ts` | B-101, B-102, B-502 |
| Validating and upgrading a file | `validateFile` in `src/core/schema.ts`; `migrateToCurrent` in `src/core/migrate.ts` | B-502 |
| Other tools' formats | `loadPack` and `src/core/adapters/` | B-502, as a second entry point |
| Snapshot storage, usage and cap | `src/core/snapshots.ts`: two keys per snapshot, confirm and retry index writes, `usage()` against the 10 MB soft cap | B-101, B-103, B-201 |
| Opening tabs only after a preview | `importPanel.showSession(session, source, name)`, which snapshots already use | B-102 recovery, B-103 and B-201 results |
| Comparing addresses | `dedupeKey` in `src/core/filters.ts` | B-103, B-201 |
| A tab's identity across two captures | `tabIdentities` in `src/core/filters.ts`, added on 2026-09-27 for the export preview | B-103, where "moved" must not read as "removed and added" |
| The toolbar as a status line | `setBadge`, `setActionTitle`, ADR-033 | B-101, B-102 |
| Rating ask and listing links | `LISTINGS` in `src/core/rating.ts`, `NETWORK_ALLOWLIST` in `scripts/lint.mjs` | T-509 |
| Real browser crash testing | `scripts/matrix.mjs`, which spawns the installed Chrome and Edge directly and drives them over CDP | B-102 |

Two constraints shape Track C.

1. **The worker holds no state and answers no messages** (ARCHITECTURE section 7).
   Autosave has to live in the worker, because no page is open when the browser
   crashes. So the worker gains event listeners and a single alarm. It still
   holds no state in memory: everything it knows is read from storage each
   time it wakes.
2. **Every listener must be registered at the top level of `sw.ts`**, or a
   woken worker misses the event that woke it. Registration goes through the
   `events` object in `src/core/adapter/index.ts`, as the two existing
   listeners do.

## 4. Track A

### 4.1 T-507: the four manual checks

**State.** The automated matrix is green. Four rows in
[MANUAL-CHECKS.md](../MANUAL-CHECKS.md) need a person. Since that page was
written the export pane has changed shape (ADR-046), so check 4 covers more.

**Plan.**

1. Me: add the export preview to check 4: untick a tab and confirm the file
   leaves it out; confirm the settings fold after an export; confirm the
   checkboxes read as empty in both themes. Rebuild `dist/`.
2. You: the twenty minutes, filling Table M1.
3. Me: commit Table M1. Turn any failure into a roadmap row with a fix. Close
   T-507 when all four pass, and record it in ROADMAP Tables R1b and R10 and in
   TESTING Table X2.

**Acceptance.** Table M1 has a result on every line, and every result is a pass
or has a roadmap row.

### 4.2 T-509: three stores

**State.** Chrome resubmitted on 2026-09-26 after the keyword spam rejection,
item id `bgomldlmhkecjeceibdphdkoencnghjm`. **Live**, confirmed 2026-09-28, and 1.1.0
submitted the same day, pending review. Edge and AMO not started.

**Chrome.**

1. Wait for the review. If it is rejected, fix the cited violation the same
   day.
2. [Unverified] The in-product import hint still names three other extensions.
   The rejection cited only the description, but a reviewer reads the product
   too. Make it generic in 1.0.1 whatever happens.

**Edge Add-ons.**

1. You: create the Partner Center account.
2. Me: an Edge column in `store_listing.md` with every field in dashboard
   order. It uses the same package as Chrome, the 300 by 300 logo, the same
   screenshots, category Productivity, and the note already in
   `docs/store/submission.md` about no host permissions at install.
3. You: upload `tabspack-<version>-edge.zip` and paste the fields. Edge also
   has a submission API; it needs API credentials created in Partner Center,
   and is only worth it from the second update on.

**AMO.**

1. [Unverified] Mozilla requires new extensions to declare what they collect in
   `browser_specific_settings.gecko.data_collection_permissions`. I will
   confirm the current rule against Mozilla's documentation before changing
   anything.
   - The honest declaration here is nothing required, with the support message
     as optional personal communications.
   - The key is ignored by Firefox versions older than it, which fits our
     `strict_min_version` of 115, but `addons-linter` may warn.
   - The change goes into `manifest.firefox.json` with a lint check that it is
     present.
2. The source archive: `npm run pack` already writes it. I will unpack it into
   an empty directory, run `npm ci && npm run build`, and require the result to
   be byte identical to `dist/firefox`. A reviewer who cannot reproduce the
   build rejects it.
3. You: create the AMO account, then either upload by hand, or create AMO API
   credentials so `web-ext sign --channel=listed` submits from here. The
   listing text reuses `store_listing.md`: AMO renders Markdown, so the same
   headings work, with no product names, per the rule the Chrome rejection
   taught us.

**After each acceptance.** This is the wiring that turns the product on.

- The listing URL goes into `LISTINGS` in `src/core/rating.ts`, which enables
  the rating ask, and into `NETWORK_ALLOWLIST` in `scripts/lint.mjs`.
- README and the site replace "Not in the stores yet" with store buttons.
- `llms.txt` and `llms-full.txt` gain the listing URLs.
- ROADMAP closes the row, and CHANGELOG records it.

**1.0.1.**

- Contents: the export preview (ADR-046), the generic import hint, and the
  custom checkboxes.
- It goes out as an update to each accepted listing. It adds no permissions,
  so no user is asked anything again.

**Acceptance.** As the row says: accepted by all three stores, with the URLs
in `LISTINGS` and in the lint allowlist.

## 5. Track B: B-502, the reference reader and writer as a package

**Goal.** A third party can read, validate, upgrade and write TabsPack files
with `npm install` and no browser.

**Draft acceptance criteria.**

1. `npm install @palworks/tabspack` in an empty directory, then `import { parse, write, validate } from "@palworks/tabspack"`, works in Node 18 or later and in a browser bundler, with types.
2. Every fixture in `test/fixtures/expectations.json` behaves the same through
   the package as through the extension.
3. The package has zero runtime dependencies and carries the JSON Schema.
4. The published tarball is built from the same source files as the extension.
   Nothing is copied, so the two cannot drift.

**Design.**

- `packages/format/` with its own `package.json`, `README.md` and
  `tsconfig.json`. That tsconfig compiles exactly these files from `src/`:
  - `types/tabspack.ts` and `types/session.ts`
  - `core/serialize.ts`, `core/deserialize.ts`, `core/schema.ts`,
    `core/migrate.ts`, `core/issues.ts`
  - `core/naming.ts`, for `isoWithOffset`

  Their imports are already all inside this set, checked 2026-09-27, so the
  package boundary is real and not an aspiration.
- A second entry point, `@palworks/tabspack/import`, for `loadPack` with the
  foreign format adapters and suspender recovery. It is heavier, and most
  users will not want it.
- A small public facade, `packages/format/src/index.ts`, so internal names can
  change without breaking the package:
  - `parse(text) → { session, issues }`
  - `write(session, options) → text`
  - `validate(value) → issues`
  - `migrate(value) → { file, issues }`
  - the types and the schema
- ESM only, `exports` map, `types` alongside, `sideEffects: false`.
- A lint rule: nothing inside the package's file set may import from
  `core/adapter/`. That is what would drag browser code into a library.

**Tests.**

- `npm pack`, install the tarball into a temporary directory outside the repo,
  and run the fixture corpus through the installed copy.
- A size budget on the tarball.
- This runs in CI on every push, not just at release.

**Publishing.**

- A workflow on a `format-v*` tag: build, test, then `npm publish --provenance`
  with the token from a GitHub secret.
- Versioning is separate from the extension. The major version tracks
  `schemaVersion`.

**Docs.**

- The package README.
- A line in `docs/SPEC.md` and on the site pointing at it.
- The site's llms files.
- An ADR recording the name and the file set.

## 6. Track C: durability

### 6.1 The shared engine

Built first, because B-101 and B-102 both need a worker that notices tab
changes and saves later rather than at once.

**Permissions.**

- `alarms`, required. [Unverified] It carries no install warning in Chrome or
  Firefox, so adding it in an update disables nobody. I will confirm this
  before shipping.
- `sessions`, optional, requested only when the user opens the recently
  closed list in B-102. The install time permissions do not change.

**Adapter.** Add to `src/core/adapter/`:

- `onTabsChanged`: created, removed, attached, detached, moved, and an update
  that changes the address or title
- `onStartup`
- `onAlarm`
- `createAlarm` and `clearAlarm`
- `getRecentlyClosed` and `restoreClosed`, behind a capability probe

**Scheduling.**

- A change only creates the alarm if it does not already exist, so a storm of
  tab events costs one write.
- Chrome's shortest alarm delay is 30 seconds. [Unverified] Firefox's may
  differ; the delay is read from capabilities, not assumed.

**Module.** `src/core/autosave.ts`, pure apart from the adapter it is given:

- `captureNow(adapter, settings)` reuses `collectSession`, without incognito
  unless the user allowed it.
- `unchanged(previous, next)` compares by `tabIdentities` and group membership,
  so a reordered tab strip is a change and a page that merely finished loading
  is not.

### 6.2 B-101: scheduled automatic snapshots

**Draft acceptance criteria.**

1. Off by default. A Snapshots setting sets the interval: hourly, every four
   hours, or daily.
2. When due, a snapshot named `Automatic, <date> <time>` and tagged `auto` is
   written, unless the tabs are unchanged since the last automatic snapshot,
   in which case nothing is written and the skip is logged.
3. It respects ADR-012. At the soft cap, automatic saving stops and says so on
   the Snapshots pane and in the toolbar title. It never deletes (decision D3).
4. A worker terminated between alarms loses nothing: the next alarm runs as
   normal.

**UI.**

- The snapshot list marks automatic ones with a quiet `auto` chip.
- A filter shows all, manual only, or automatic only.

### 6.3 B-102: recovery after a crash or a lost session

**Draft acceptance criteria.**

1. With the recovery copy on, the worker keeps one rolling record of the
   current session, at most 30 seconds old, in a single storage key that is
   counted in usage but is not a snapshot.
2. On browser start, once the browser's own session restore has settled, it
   compares the record with the tabs now open.
   - If a meaningful part is missing (a whole window, or at least ten tabs and
     a fifth of the session), the toolbar shows a recovery badge.
   - The popup and the manager then say how many tabs from when are not open
     now.
3. **Preview and restore** opens that session in the import preview, with only
   the missing tabs ticked. It never restores on its own (DOMAIN business
   rule 4).
4. When Chrome restored everything itself, which is the common case, nothing
   is offered.
5. With the optional `sessions` permission granted, a **Recently closed**
   list shows the browser's own last 25 closed windows and tabs. Restoring one
   uses `sessions.restore`, which keeps its back button history, something a
   file can never carry.
6. Proven in `npm run matrix`: kill the real browser with SIGKILL, relaunch
   the same profile, and require the offer with the right count. Then
   relaunch after a clean close with the browser restoring its session, and
   require no offer.

**The hard part is false alarms.** The browser restores tabs asynchronously
after start. Deciding too early flags tabs that are about to reappear.

- The check waits for tab creation to go quiet: no new tab for five seconds,
  with a thirty second ceiling.
- It then compares by address, not identity, because a restored tab has a new
  window key.
- The thresholds are constants with unit tests on both sides of each.

**Surfaces.**

- A card at the top of the Export pane, because that is where the manager
  opens, and a line in the popup.
- Dismissing it keeps the record until the next start, so a mistaken dismissal
  can be undone from Snapshots, where the record appears as **Last session
  before restart**.

### 6.4 B-103: snapshot diff and pruning

**Draft acceptance criteria.**

1. Every snapshot row offers **Compare with the one before**. The result
   counts and lists added, removed, moved to another window, and regrouped
   tabs, by `tabIdentities` and `dedupeKey`.
2. **Tidy automatic snapshots** finds runs of automatic snapshots with no
   difference, or differing only by fewer than a chosen number of tabs, keeps
   the newest of each run, and names every one it will delete. Nothing is
   deleted until the user confirms that list. Manual snapshots are never
   proposed (ADR-012).
3. It runs in memory on the stored bodies, and stays under 500 ms for 100
   snapshots of 500 tabs on the perf budget machine.

**Module.** `src/core/compare.ts`, pure, holding:

- `diffSessions(a, b) → { added, removed, moved, regrouped }`
- `pruneCandidates(metas, bodies, threshold) → { keep, remove }`

**UI.**

- The diff opens in a panel on the Snapshots pane.
- Any list in it can be opened in the import preview, which gives "restore
  just what I closed since yesterday" for free.

### 6.5 B-201: addresses repeated across snapshots

**Draft acceptance criteria.**

1. An **Overlap** view on the Snapshots pane lists the addresses that appear
   in three or more snapshots, by default, with how many and which.
2. **Combine** takes the snapshots the user selects and saves one new
   snapshot with every address once. It keeps the window structure of the
   newest, and puts addresses found only in older snapshots in one extra
   window.
3. Combining never deletes the originals. Deleting them is a separate,
   confirmed action listing their names.

**Module.** `overlap(bodies) → Map<dedupeKey, snapshotIds[]>` and
`combine(sessions) → Session`, in `src/core/compare.ts`.

## 7. Cross-cutting work in Track C

### Table P5: What Track C changes outside its own code

| Area | Change |
|---|---|
| Store permission justifications | `alarms` and, when requested, `sessions`, in `store_listing.md` Table S6, before 1.1.0 is submitted |
| Privacy | `PRIVACY.md` and store Table S8: with the recovery copy or automatic snapshots on, the open tabs are written to local storage on a schedule. Still local only, never sent anywhere. The single purpose is unchanged: saving and restoring tabs |
| Settings | New settings, each with defaults, limits and a migration for stored settings from 1.0 |
| Docs | ADRs for the engine, for D2 and for D3. ARCHITECTURE section 7, because the worker now has listeners and an alarm. DOMAIN, for what a recovery copy is. TESTING, for new tests and the crash row in Table X2 |
| Tests | Unit tests for every pure function, the thresholds on both sides of each boundary, and a fake adapter that fires tab events and alarms. Smoke: automatic snapshot written and skipped, recovery offer shown from a seeded record, overlap and diff views. Matrix: the crash test in Chrome and Edge. Firefox gets the recovery flow, but it has no SIGKILL restart in `matrix-firefox`, which will be stated rather than implied |

## 8. Risks

### Table P6: Risks and mitigations

| Risk | Mitigation |
|---|---|
| The worker waking on every tab event costs battery | One alarm per change burst, at least 30 seconds apart, and no work when both features are off, because the listeners check a stored flag first |
| Recovery offers after an ordinary restart | The quiet period, the thresholds, and a matrix test that requires no offer after a clean restart |
| Automatic snapshots fill the 10 MB cap | Unchanged snapshots are never written. The cap stops them loudly (D3). The Snapshots pane shows how much space automatic snapshots use |
| A new permission in an update disables the extension for users | `alarms` needs checking for a warning before release. `sessions` stays optional, so installs are unaffected |
| AMO rejects the build as not reproducible | The byte identical rebuild check in 4.2, run before upload |
| The package drifts from the extension | One set of source files and a lint boundary. The package tests run in CI on every push |

## 9. What happens when you say go

1. You answer D1 to D5, even if only with "as recommended".
2. Track A starts the same day: the refreshed checklist, then the AMO and Edge
   preparation.
3. Track C starts by writing the acceptance criteria above into ROADMAP section 3 and promoting the rows, keeping their ids (ADR-042).
   - Then the engine, B-101, B-102, B-103 and B-201, each with its own audit.
   - Each of them ends with verify, smoke and the matrix green.
4. Track B slots in wherever a review wait leaves a gap.
