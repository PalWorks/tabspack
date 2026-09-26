## What this changes

<!-- One paragraph. What it does, not how. -->

## Task

<!-- The id from docs/ROADMAP.md Table R1, for example T-204. If there is no row, add one first: anything not in that table is not agreed work. -->

## What I ran

- [ ] `npm run verify` (typecheck, lint, schema check, site check, tests, contrast, budgets, both builds, AMO's linter)
- [ ] `npm run smoke` against a real Chromium

## What I verified by hand, and where

<!--
A green unit suite proves nothing about a permission prompt, a keyboard shortcut
or a tab strip. Say which browsers you loaded this in and what you exercised. If
you loaded none, say that: an honest gap is useful, a guess is not.
-->

| Browser | Version | What I exercised | Result |
|---|---|---|---|
|  |  |  |  |

## What I did not verify

<!-- Anything inferred rather than seen. Label it plainly. -->

## Documentation

- [ ] `CHANGELOG.md` under Unreleased
- [ ] The task's status in `docs/ROADMAP.md` Table R1
- [ ] Any of `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LIMITATIONS.md`, `docs/PLAYBOOK.md`, `docs/DOMAIN.md`, `docs/TESTING.md` that this change makes wrong
- [ ] If a user can see it: `README.md`, `store_listing.md`, and the site under `scripts/site/` followed by `npm run site`. A stale claim on those is a false statement, not an out of date note
- [ ] If it changes what is read, stored or sent: `PRIVACY.md` and its version, and `SECURITY.md` if it opens or closes an attack surface

## Format changes only

- [ ] This does not change `.tabspack.json`, or it follows `docs/PLAYBOOK.md` section 4 in full
