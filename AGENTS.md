# Agent Contract

Rules for any AI agent or LLM driven automation working in this repository. Humans should read it too, since most of it is just the engineering standard.

Read [docs/CONTEXT_MAP.md](docs/CONTEXT_MAP.md) first. It tells you which file owns which question, so you do not infer what is already written down.

## 1. Before writing code

1. There must be a task in Table R1 of [docs/ROADMAP.md](docs/ROADMAP.md) with a problem statement and acceptance criteria. If the work is not there, add the row first. Anything not in Table R1 is not agreed work.
2. Check [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Several behaviours that look like bugs are deliberate. Do not "fix" them.
3. Check [docs/DECISIONS.md](docs/DECISIONS.md). If your approach contradicts an accepted ADR, you need a new ADR that supersedes it by name, not a quiet change.
4. Read [docs/DOMAIN.md](docs/DOMAIN.md) before touching anything involving tabs, windows, groups, ordering or restore. Browser semantics are the main source of defects here.

## 2. Hard rules

These fail review without discussion.

1. **No `browser.*` or `chrome.*` outside `src/core/adapter/`.** Everything else goes through the adapter. Enforced by lint.
2. **No browser sniffing.** Probe for the API in `capabilities.ts`. Never branch on a browser name or user agent string.
3. **No network access.** No `fetch`, no `XMLHttpRequest`, no remote script, font, stylesheet or image, no analytics, no remote logging. NFR-006 tests this against the built bundle.
4. **No new permission** without an ADR and an update to PLAN.md Table P8. Never add a host permission.
5. **Nothing that could authenticate a user** goes into an export: no cookies, tokens, headers, form values or storage contents.
6. **No new runtime dependency.** `webextension-polyfill` is the only one. Development dependencies need a line in the pull request explaining why.
7. **No silent data loss.** A tab that is skipped, deduplicated, ungrouped or unopenable must appear in the import report. Silence is a defect.
8. **Never hand edit a generated file**, including `schema/tabspack.v1.schema.json`.
9. **Do not change the file format** without following [docs/PLAYBOOK.md](docs/PLAYBOOK.md) section 4. Other people's files depend on it.
10. **Do not commit real browsing data.** Fixtures use `example.com` and well known public sites.

## 3. Coding conventions

- TypeScript, `strict: true`. No `any` without a comment naming the reason.
- Plain ES modules. No framework. No state management library. No CSS framework.
- Pure functions in `src/core/`, side effects only in `src/core/adapter/` and in UI event handlers.
- Errors carry a message a user could act on. A validation error carries the JSON path and a suggested fix.
- Every async browser call is wrapped in the adapter and returns a rejected promise on failure, never a callback with `lastError` left unread.
- Name things as [docs/DOMAIN.md](docs/DOMAIN.md) names them. A group is a group, not a folder or a collection.
- Comment density matches the file you are editing. Explain why, not what.

## 4. Scope discipline

Do exactly the task. Do not refactor adjacent code, rename things, reformat files, upgrade tooling or add abstractions "while you are in there". If you find a real problem outside your task, add it to Table R1 in [docs/ROADMAP.md](docs/ROADMAP.md) or to Table L3 in [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and carry on.

Do not add features that are not in [PLAN.md](PLAN.md) section 7. The out of scope list is a decision, not an oversight. This includes anything AI shaped, cloud sync, accounts and encryption.

## 5. Verification, and what you may claim

1. `npm run typecheck && npm run lint && npm test && npm run build` must pass.
2. Browser behaviour is not proven by a unit test. If your change touches the adapter, the restore engine, a permission or the UI, load the extension unpacked in Chromium **and** Firefox and exercise the path before you claim it works.
3. Report what you actually ran. If you did not load a browser, say so. If a test fails, show the output. Never describe an untested path as verified.
4. Label anything you inferred rather than verified as inference, including claims about browser API behaviour you did not exercise.

## 6. Documentation duties

A change that alters behaviour updates the docs in the same commit:

### Table G1: What to update

| Change | Also update |
|---|---|
| New or changed behaviour | `CHANGELOG.md` under Unreleased |
| Format field added or changed | `docs/SPEC.md`, the types, the generated schema, a migration fixture if the version bumped |
| Architectural choice | `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md` if it was a real tradeoff |
| New browser constraint discovered | `docs/LIMITATIONS.md` |
| New procedure or a procedure that turned out to be wrong | `docs/PLAYBOOK.md` |
| Task finished | The status column in `docs/ROADMAP.md` Table R1, and its Done section |
| New requirement | `PLAN.md` with a new FR or NFR id |

## 7. Commits and pull requests

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `spec:` for format changes.
- Reference the task id: `feat(T-204): restore engine with throttled creation`.
- One logical change per commit. A pull request states what was run, what was verified in which browser, and what was not.
- Do not commit to `main` directly and do not push a tag unless you are performing a release per the playbook.

## 8. When to stop and ask

Stop and ask rather than guessing when: the change would alter the file format, add a permission, add a dependency, contradict an ADR, or touch anything on the out of scope list. Also stop when a requirement is ambiguous in a way that changes the work materially. Otherwise make the routine call yourself and note the assumption in the pull request.
