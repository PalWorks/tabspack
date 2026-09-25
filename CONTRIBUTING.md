# Contributing

Thank you for looking. The rules here exist to protect one thing: a `.tabspack.json` file that someone saved today must still open in five years.

Read [AGENTS.md](AGENTS.md) as well. It applies to human contributors too; only its sections on verification claims and scope discipline are written specifically for automation.

## Before you start

1. Open an issue first for anything beyond a typo. A pull request that changes behaviour without an agreed task tends to be rejected on scope rather than on quality.
2. Check [PLAN.md](PLAN.md) section 7. The out of scope list is a decision, not a gap. Cloud sync, accounts, encryption and AI features will be declined.
3. Check [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Several behaviours that look wrong are deliberate.

## Workflow

1. Fork, or branch from `main` if you have write access.
2. Branch name: `feat/<task-id>-<slug>`, `fix/<issue>-<slug>` or `docs/<slug>`.
3. Commit in conventional commit style, referencing a task id where one exists: `feat(T-204): restore engine with throttled creation`. Use `spec:` for any change to the file format.
4. One logical change per commit. Keep formatting noise out of functional commits.
5. Run everything in the checklist below before opening the pull request.
6. In the pull request, state what you ran, which browsers you loaded the extension in, and what you did not verify. An honest gap is fine; a silent one is not.

`main` is always in a state that builds and loads. Do not push directly to it, and do not push tags unless you are running a release from [docs/PLAYBOOK.md](docs/PLAYBOOK.md) section 6.

## Checklist

```bash
npm run verify        # typecheck, lint, schema, tests, contrast, budgets, both builds, AMO's linter
npm run smoke         # the built extension driven in a real Chromium
npm run smoke:firefox # the built package installed in a real Firefox
```

Then, if your change touches the adapter layer, the restore engine, a permission or any UI: load `dist/chrome` in Chrome or Edge and `dist/firefox` in Firefox, and exercise the path by hand. Unit tests do not prove a permission prompt or a tab strip, and [docs/TESTING.md](docs/TESTING.md) lists exactly what the automated runs cannot reach.

## Code style

- TypeScript, `strict: true`. No `any` without a comment naming the reason.
- Plain ES modules, no framework, no state library, no CSS framework.
- `src/core/` is pure. Side effects live in `src/core/adapter/` and in UI event handlers.
- Nothing outside `src/core/adapter/` may reference `browser.*` or `chrome.*`. This is enforced by lint and it is the reason one codebase can serve Chromium and Gecko.
- No browser sniffing. Probe for the capability.
- Error messages are actionable. A validation error carries a JSON path and a suggested fix.
- Use the vocabulary in [docs/DOMAIN.md](docs/DOMAIN.md). A group is a group, not a folder.
- Formatting is whatever the committed formatter config produces. Do not argue with it and do not reformat unrelated files.

## What needs an ADR

Add a record to [docs/DECISIONS.md](docs/DECISIONS.md) in the same pull request if you are: changing the file format in a non additive way, adding or widening a permission, adding a runtime dependency, changing where data is stored, or contradicting an existing ADR. Never edit an accepted ADR in place; supersede it by name.

## Tests and fixtures

- Work inside `src/core/` gets a unit test. Browser only work gets a case in the matrix in [docs/TESTING.md](docs/TESTING.md).
- A bug fix gets the regression fixture before the fix.
- A new import adapter gets a real world fixture plus a malformed variant.
- Fixtures contain no personal browsing data. Use `example.com` and well known public sites, and strip anything identifying from a real export before committing it.

## Reviewing

A reviewer checks, in this order: does it match an agreed task, does it respect the hard rules in AGENTS.md section 2, is the format change handled per the playbook, are the docs updated in the same commit, and were the stated verifications actually run.

## Translations

The i18n scaffold arrives at M5. Locale contributions are welcome after that, as `_locales/<code>/messages.json` against the English source. Do not machine translate a permission justification or a privacy statement.

## Reporting bugs

Include the browser and version, the extension version, what you expected, what happened, and where possible the file that triggered it with personal URLs removed. An import bug without its file is usually unfixable.

Security issues do not go in the issue tracker. See [SECURITY.md](SECURITY.md).
