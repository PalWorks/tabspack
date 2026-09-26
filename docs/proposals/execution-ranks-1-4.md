# Execution plan: ranks 1 to 4

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-09-26 |
| Covers | `T-717`, `B-202`, `T-507`, `T-509`, the top four rows of [../ROADMAP.md](../ROADMAP.md) Table R1 |
| Decided before writing | The schema `$id` points at the GitHub Pages site, not at a registered `tabspack.dev`. The maintainer's call on 2026-09-26: buy the domain when there is traction to justify it |

## 1. The order is not the rank order, and that is deliberate

Rank answers "what is the cheapest win". It does not answer "what has to happen
before what", and for these four rows the difference matters, because two of
them change the code and two of them measure it.

**Table E1: execution order**

| Step | Row | Rank | Why here |
|---|---|---|---|
| 1 | `T-717` | 2 | It changes the schema that ships inside the package. Doing it after packaging means packaging twice |
| 2 | `B-202` | 4 | The last code change. Everything after this step only measures or publishes |
| 3 | `T-507` | 1 | A matrix run proves something about the tree it ran against. Run before step 2 it would prove something about a tree nobody is shipping |
| 4 | `T-509` | 3 | The version bump and the packages are the last thing that happens, so what is uploaded is the tree that was measured |

A verification that runs before the last edit is decoration. That is the whole
reason rank 1 is executed third.

## 2. `T-717`, the format's canonical URL

**The defect.** `schema/tabspack.v1.schema.json` declares
`$id: https://tabspack.dev/schema/tabspack.v1.schema.json` and `tabspack.dev`
has no DNS record and no whois entry. A `$id` need not resolve for validation
to work, so nothing is broken today. Two things are wrong anyway: a second
implementer who follows the canonical address of the format finds nothing, and
anybody may buy the domain and become the authority on our own file format.

**The decision.** The `$id` becomes
`https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json`, and the
schema is published at exactly that path so the address resolves. Registering
`tabspack.dev` is deferred until there is traction to justify it, at which point
the change is a `schemaVersion` conversation rather than an edit.

**Steps.**

1. `scripts/gen-schema.mjs`: `$id` to the site path. The generator is the source
   of truth; the JSON file is output, so it is never edited by hand.
2. `npm run schema` to regenerate, `npm run schema:check` to prove the committed
   file matches.
3. `scripts/gen-site.mjs`: publish `schema/tabspack.v1.schema.json` into
   `website/` from the repository copy, so the two cannot drift. `--check`
   then fails if somebody regenerates one without the other.
4. A lint rule, `ruleSchemaId`, asserting that the `$id` in the committed schema
   is the site origin plus the published path. This is the same guard
   `ruleRelayOrigin` already provides for the relay host, and it exists so this
   defect cannot come back quietly.
5. The Gecko extension id. `manifest.firefox.json` carries
   `tabspack@tabspack.dev`, which leans on the same unowned name. An extension
   id is an identifier and never resolves, so nothing breaks either way, but an
   AMO-accepted id can never be changed afterwards. It becomes
   `tabspack@palworks.ai`, a domain that is already ours and already serving the
   support relay. `scripts/matrix-firefox.mjs` holds the same string and changes
   with it.
6. `docs/SPEC.md`, `docs/proposals/web-surface.md` section 4 and the roadmap row
   record what was decided and why.

**Audit for step 1.**

- `grep -rn 'tabspack\.dev'` returns only historical prose, never a live value.
- `npm run schema:check` clean, `npm run site:check` clean, `npm run lint` clean.
- The deployed URL returns the schema with a JSON content type, checked against
  production rather than against `website/`.
- `npm test` green, because `schema.test.ts` reads the file.
- `npm run lint:amo` still passes with the new Gecko id.

## 3. `B-202`, tab age and staleness

**Promotion, not a phase jump.** `B-202` is a `v2` row, and sequencing rule 5
says a backlog item enters the build only with a problem statement and
acceptance criteria. Both are written below, so the row moves to phase `M5` and
ships in the first release. **It keeps the id `B-202`.** Renumbering it to a
`T-` id would break every reference for the sake of a letter, which is the same
argument ADR-042 makes about not renumbering anything else. The prefix now
records where a row came from, which is worth keeping.

**The problem.** A user with three hundred tabs cannot see which of them died
months ago, so they keep all three hundred. `lastAccessed` is already collected,
already carried through `SessionTab`, already serialized into the pack and
already in the schema. Nothing reads it.

**The honesty constraint, which is the hard part.** `tabs.lastAccessed` is not
guaranteed. `collect.ts` writes `null` when the browser does not give one, and a
tab restored from a file may have no timestamp at all. A report that treats
"unknown" as "old" would tell a user to throw away tabs it knows nothing about.
So: unknown is its own band, it is never counted as stale, and it is never
filtered out. It is shown, because a count the product cannot vouch for is
exactly the count it must not hide.

**Acceptance criteria.**

1. A pure `src/core/staleness.ts` with no adapter and no DOM, banding a session
   by last use and reporting an unknown count separately.
2. The export pane states the bands for the current scope before anything is
   exported, and says nothing at all when every tab is recent, because a line
   that always appears is a line nobody reads.
3. One bulk action: an export filter that drops tabs not opened within a chosen
   window, composing into the existing pipeline with a count in the report like
   every other filter.
4. A pinned tab is never dropped as stale. Pinning is the user saying they want
   it, and an old timestamp on a pinned tab is not evidence of anything.
5. A tab with no timestamp is never dropped.
6. Off by default. A filter that silently removes tabs on first run would be the
   worst surprise in the product.
7. Unit tests for the bands, the boundary, the pinned exemption, the unknown
   exemption and the composition with dedupe.

**Out of scope, deliberately.** Closing the stale tabs after archiving them is
the feature this one implies, and it is the one destructive thing the product
would ever do. It needs its own row, its own confirmation and a guarantee that
no tab closes before its export is on disk. A new backlog row carries it.

**Audit for step 2.** Every criterion above demonstrated by a test rather than
by reading the code, plus `npm run verify` green and the export pane checked at
320 px.

## 4. `T-507`, the cross browser matrix

**State.** `npm run matrix` drives the installed Chrome, Edge and Firefox and is
automated. Four rows remain that a machine genuinely cannot do, listed in Table
R10: answering the browser's own `tabGroups` prompt, checking a recovered
suspended tab against the suspender that made it, pressing a keyboard command in
Firefox on a real display, and having an opinion about how it looks.

**Steps.**

1. Re-run the full matrix on all three engines against the tree as it stands
   after steps 1 and 2, and record the totals.
2. Settle the discrepancy in the logs. Three different totals for the same run
   are recorded in three places, and the honest way to resolve that is a run,
   not an argument about which log is newer.
3. Produce the human checklist: the four rows, in order, with the exact keys to
   press and the exact thing to look for, so the sitting takes twenty minutes
   and does not need the roadmap open beside it.

**What cannot be closed here.** The four human rows. `T-507` stays
`for a person` until somebody performs them. Marking it done from an agent
session would be a lie about the only part of it that was ever in doubt.

## 5. `T-509`, store submissions

**Steps that are work.**

1. Version to `1.0.0` in `package.json` and both manifests, and convert the
   CHANGELOG's Unreleased heading to a release heading, per sequencing rule 3.
2. `npm run verify` and `npm run pack`, producing the three packages.
3. Validate each package against the store rules: the Chrome zip is the contents
   of `dist/chrome` and not the folder, the Firefox package passes
   `addons-linter`, and the Gecko source archive is present with build
   instructions.
4. Confirm the Chrome Web Store credentials answer, with a read-only call. A
   token that turns out to be dead at upload time is the worst moment to find
   out.

**The stop.** The submission itself is not executed. Two reasons, and the first
is the real one.

- **It is an irreversible public act under the maintainer's own identity.** A
  listing goes live under their developer account, is reviewed by Google, and an
  unpublish leaves a record. That needs a person to say go, which was promised in
  an earlier session and is not being quietly walked back now.
- **Two of the three accounts do not exist.** Chrome Web Store OAuth
  credentials, a publisher id and a refresh token are on this machine. Edge
  Add-ons and AMO have neither an account nor a credential, and one of them
  carries a fee. No amount of preparation creates those.

So step 4 ends with the packages built, validated and staged, the exact upload
command written down, the listing copy in `store_listing.md` ready to paste, and
one decision to take.

## 6. Where this lands

**Table E2: what each row's status becomes**

| Row | Status after this plan | What is left |
|---|---|---|
| `T-717` | `done` | Nothing. Revisit only if `tabspack.dev` is bought |
| `B-202` | `done` | The archive-and-close follow-up, as its own row |
| `T-507` | `for a person` | Four checks, twenty minutes, checklist provided |
| `T-509` | `next` | The maintainer's go, plus an Edge account and an AMO account |
