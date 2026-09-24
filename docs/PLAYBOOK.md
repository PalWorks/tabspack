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

For an automated pass, `npm run smoke` loads `dist/chrome` into the Chromium that Playwright downloads and drives both surfaces. It uses that Chromium rather than the system Chrome because Chrome 137 and later ignore `--load-extension` entirely, as recorded in LIMITATIONS.md Table L3. The script skips cleanly when Playwright is not installed, and `--headed` shows the window.

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

1. Obtain a real export from the source tool. Strip anything personal and commit it to `test/fixtures/foreign/`.
2. Add a detection predicate in `src/core/adapters/detect.ts`. Detect by document shape only, never by file extension or name.
3. Write the adapter as a pure function from parsed input to a `TabsPackFile`. No browser access, no async work beyond parsing.
4. Declare the fidelity in the adapter and add the row to [SPEC.md](SPEC.md) Table S5. Never invent structure the source does not carry.
5. Add a malformed variant of the fixture and assert the error message.
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

## 5. Debug a failing import

1. Reproduce with the actual file, added to `test/fixtures/` with personal data stripped.
2. Determine the layer: detection, adapter, validation, migration, deserialize, preview or restore. The import report and the validation error path name the layer.
3. Validation errors that are not actionable are themselves defects. Fix the message as well as the cause.
4. If restore is at fault, check the nine step order in [ARCHITECTURE.md](ARCHITECTURE.md) section 6 before anything else. Order bugs present as wrong tab positions, a closed window or missing groups.
5. Add the regression fixture before the fix.

## 6. Release

1. Confirm the milestone exit test in [ROADMAP.md](ROADMAP.md) passes.
2. Run the full cross browser matrix in [TESTING.md](TESTING.md). Record the result in the pull request.
3. Bump the version in both manifests and in `package.json`. The three must match.
4. Convert the CHANGELOG Unreleased section to a version heading with the date.
5. Tag `v<version>` and push the tag.
6. Build the submission artifacts. Chromium: zip the contents of `dist/chrome`, not the folder. Firefox: zip the contents of `dist/firefox`, and prepare a source archive plus build instructions, which AMO requires whenever the submitted code is generated by a build step.
7. Submit to Chrome Web Store, Edge Add-ons and AMO. Keep the permission justifications from PLAN.md Table P8 in the submission notes, unchanged between stores.
8. Record submission dates and review outcomes in the CHANGELOG entry.

## 7. Roll back a bad release

There is no server, so rollback means the stores.

1. Chromium stores: publish the previous version as a new higher version number. There is no un publish that reaches users who already updated.
2. AMO: disable the bad version, which stops new installs, then publish a fixed higher version.
3. If the defect corrupts files, the priority is a reader fix that repairs affected files on import, because a user's file is the only copy of their session. Ship the reader fix before the writer fix.
4. Add the case to [LIMITATIONS.md](LIMITATIONS.md) Table L3 and a regression fixture.

## 8. Handle a permission or privacy question from a reviewer

Answer from PLAN.md Table P8 and `PRIVACY.md`. Do not improvise a justification, and never widen a permission to make a review pass. If a reviewer demands a permission the product does not need, escalate to a decision rather than accepting it.
