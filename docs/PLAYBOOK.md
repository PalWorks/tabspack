# Playbook

Step by step operational procedures. Follow them literally. If a step is wrong, fix the step here in the same change that works around it.

## 1. Load the extension for development

Chrome or Edge:

1. `npm run build`
2. Open `chrome://extensions` or `edge://extensions`
3. Enable Developer mode
4. Load unpacked, select `dist/chrome`
5. After a rebuild, press the reload icon on the extension card. A manifest change needs a full remove and re add

Firefox:

1. `npm run build`
2. Open `about:debugging#/runtime/this-firefox`
3. Load Temporary Add-on, select `dist/firefox/manifest.json`
4. Temporary add-ons are removed when Firefox closes, which is expected

Inspect the service worker from the extension card in Chromium, or from `about:debugging` in Firefox. Remember the worker is terminated when idle: a silent extension is usually a terminated worker, not a bug.

For an automated pass, `npm run smoke` loads `dist/chrome` into the Chromium that Playwright downloads and drives all three surfaces, including a real import and restore. It uses that Chromium rather than the system Chrome because Chrome 137 and later ignore `--load-extension` entirely, as recorded in LIMITATIONS.md Table L3. The script skips cleanly when Playwright is not installed, and `--headed` shows the window.

## 2. Implement a feature

1. Find or create the task in Table R1 of [ROADMAP.md](ROADMAP.md). If the work is not a task, stop and make it one, with a problem statement and acceptance criteria.
2. Check [LIMITATIONS.md](LIMITATIONS.md). If the feature contradicts an entry there, it needs an ADR first.
3. Branch from `main` as `feat/<task-id>-<slug>`, for example `feat/T-204-restore-engine`.
4. Write the failing test first when the work sits in `core/`. Browser only work gets a matrix case in [TESTING.md](TESTING.md) instead.
5. Implement. Touch `browser.*` only inside `src/core/adapter/`.
6. `npm run verify`, which is typecheck, lint, schema check, tests, performance budgets and both builds.
7. `npm run smoke` for a real browser pass, then load unpacked in Chromium and in Firefox and exercise the path by hand. A green unit suite proves nothing about a permission prompt.
8. Update the task status, add a CHANGELOG entry under Unreleased, and update the affected docs in the same commit.

## 3. Add a foreign format adapter

1. Obtain a real export from the source tool. Strip anything personal and commit it to `test/fixtures/foreign/`. If the file had to be reconstructed from documentation, say so in that folder's README and add a debt row in LIMITATIONS.md Table L4.
2. Write the adapter as one file in `src/core/adapters/`, implementing `ForeignAdapter`: `detect` is a shape test, `parse` is a pure function to a `TabsPackFile`. No browser access, no async work beyond parsing.
3. Register it in `ADAPTERS` in `src/core/adapters/detect.ts`, in the right place: the list runs from the most specific shape to the most general, and the first detector that says yes wins.
4. Declare the fidelity in the adapter and add the row to [SPEC.md](SPEC.md) Table S5. Never invent structure the source does not carry.
5. Add a malformed variant of the fixture and assert that it fails with a fix, in `test/unit/adapters.test.ts`. Both files are added to the `CASES` and `MALFORMED` lists there, which is what keeps every adapter held to the same standard.
6. Surface the fidelity in the preview UI so the user knows what was lost before restoring.

## 4. Change the file format

This is the procedure that protects other people's files. Follow all of it.

1. Decide whether the change is additive. Adding an optional field is not a breaking change, because readers must ignore unknown fields, so it does not bump `schemaVersion`.
2. For anything else, write an ADR in [DECISIONS.md](DECISIONS.md) explaining why the compatible option was rejected.
3. Bump `schemaVersion` in `src/types/tabspack.ts`.
4. Write the migration function from the previous version. Migrations are pure and one directional.
5. Add a migration fixture pair under `test/fixtures/migration/`.
6. Regenerate `schema/tabspack.v1.schema.json`, or add the new version file. Never hand edit a generated schema.
7. Update [SPEC.md](SPEC.md), including the version table at the top.
8. Confirm a reader at the old version refuses the new file by name rather than parsing it badly.
9. Decide what happens to the schema's `$id`. It is a published address that files in the wild already name, so changing it is a format event and not an edit. `scripts/gen-site.mjs` publishes the schema at that address and `ruleSchemaId` fails the build if the two ever disagree. ADR-043.

## 5. Debug a failing import

1. Reproduce with the actual file, added to `test/fixtures/` with personal data stripped.
2. Determine the layer: detection, adapter, validation, migration, deserialize, preview or restore. The import report and the validation error path name the layer.
3. Validation errors that are not actionable are themselves defects. Fix the message as well as the cause.
4. If restore is at fault, check the nine step order in [ARCHITECTURE.md](ARCHITECTURE.md) section 6 before anything else. Order bugs present as wrong tab positions, a closed window or missing groups.
5. Add the regression fixture before the fix.

## 6. Release

1. Confirm the milestone exit test in [ROADMAP.md](ROADMAP.md) passes.
2. Run the full cross browser matrix in [TESTING.md](TESTING.md), **headed on a display with a window manager and with `--grant-groups --keys`**. Run any other way it reports failures that are the rig rather than the product, and a total quoted without its configuration is not a fact. Record both the totals and the flags in the pull request.
3. Do the checks in [MANUAL-CHECKS.md](MANUAL-CHECKS.md) and fill in its Table M1. No automated run reaches them.
4. Bump the version in both manifests and in `package.json`. The three must match, and `scripts/build.mjs` fails the build if they do not. Also update the version the site states, in `scripts/site/llms-full.txt` and the `softwareVersion` in `scripts/site/pages/index.html`, then `npm run site`.
5. Convert the CHANGELOG Unreleased section to a version heading with the date.
6. Tag `v<version>` and push the tag.
7. Commit first, then `npm run pack`: the source archive is made from committed files, and an uncommitted one is simply missing from it. It writes all four artefacts to `dist/artifacts/`: the Chrome zip, the Edge zip, the Firefox `.xpi` and the source archive AMO requires whenever the submitted code is generated by a build step.
8. Audit the archives before uploading one. The manifest must be at the archive root and not inside a folder, which is the mistake that gets a Chrome upload rejected, and no source map, `.env`, account id or credential-shaped string may be in any of them. `docs/store/submission.md` Table T5 is the checklist.
9. Submit to Chrome Web Store, Edge Add-ons and AMO. Keep the permission justifications from PLAN.md Table P8 in the submission notes, unchanged between stores.
10. Record submission dates and review outcomes in the CHANGELOG entry.
11. Put each listing URL into `LISTINGS` in `src/core/rating.ts` and `NETWORK_ALLOWLIST` in `scripts/lint.mjs`. This is the step that turns the rating ask on, and until it is done `anyListingKnown()` is false and no ask is ever shown.
12. The `tabspack` npm package has its own version, whose major is `schemaVersion`. When `src/package/`, the reader or the writer changes: bump `packages/tabspack/package.json`, run `npm run package:test`, then `npm publish --otp=<code>` from `packages/tabspack`. npm refuses a publish without two factor authentication. Switch npm accounts with `npmu <profile>` first if the machine is on another one.

## 7. Roll back a bad release

There is no server, so rollback means the stores.

1. Chromium stores: publish the previous version as a new higher version number. There is no un publish that reaches users who already updated.
2. AMO: disable the bad version, which stops new installs, then publish a fixed higher version.
3. If the defect corrupts files, the priority is a reader fix that repairs affected files on import, because a user's file is the only copy of their session. Ship the reader fix before the writer fix.
4. Add the case to [LIMITATIONS.md](LIMITATIONS.md) Table L3 and a regression fixture.

## 8. Handle a permission or privacy question from a reviewer

Answer from PLAN.md Table P8 and `PRIVACY.md`. Do not improvise a justification, and never widen a permission to make a review pass. If a reviewer demands a permission the product does not need, escalate to a decision rather than accepting it.
