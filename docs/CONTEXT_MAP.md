# Context Map

Where knowledge lives, so nothing is inferred twice. Read the file that owns a question rather than reconstructing the answer from code.

## Table C1: Ownership

| Question | File | Not in |
|---|---|---|
| Why does this product exist, who is it for, what is in and out of scope | [../PLAN.md](../PLAN.md) | Anywhere else. PLAN.md is the single source of truth for scope |
| What does a requirement id like FR-206 mean | [../PLAN.md](../PLAN.md) sections 10 and 11 | |
| What is the file format, exactly, field by field | [SPEC.md](SPEC.md) | PLAN.md carries no field definitions |
| What order do phases ship in, what is the exit test | [ROADMAP.md](ROADMAP.md) sections 3 and 4 | PLAN.md, which points here |
| What should I work on next, what counts as done | [ROADMAP.md](ROADMAP.md) Table R1, the master backlog | A separate task file. There is none, deliberately |
| What can only a person test, and how | [MANUAL-CHECKS.md](MANUAL-CHECKS.md), the four rows of T-507 with the keys to press and what failure looks like | Reading Table X2 and working it out again |
| How is the code organised, what may call `browser.*` | [ARCHITECTURE.md](ARCHITECTURE.md) | |
| What does a browser actually mean by pinned, discarded, group, container | [DOMAIN.md](DOMAIN.md) | |
| What may a surface look like, and how must it behave | [DESIGN.md](DESIGN.md) | Anywhere else. Tokens are defined once, in `src/ui/shared/theme.css` |
| Why was something decided the way it was | [DECISIONS.md](DECISIONS.md) | Commit messages, which are not a decision log |
| Is this a bug or a deliberate limit | [LIMITATIONS.md](LIMITATIONS.md) | |
| How do I load, build, release, roll back, add an adapter, change the format | [PLAYBOOK.md](PLAYBOOK.md) | |
| What is tested, how, and what must be green before a release | [TESTING.md](TESTING.md) | |
| How should an agent behave in this repository | [../AGENTS.md](../AGENTS.md) | |
| What data leaves the machine | [../PRIVACY.md](../PRIVACY.md) | Short answer: nothing |
| Where does a user facing string live | `_locales/en/messages.json`. Nothing in `src/ui/` spells an English sentence: ADR-022 |
| What goes to the stores, and what do I answer a reviewer | [store/listing.md](store/listing.md) and [store/submission.md](store/submission.md) | An improvised justification. PLAN.md Table P8 is the source |
| What exactly do I paste into each dashboard field | [../store_listing.md](../store_listing.md), the name, summary, description, permission justifications, privacy answers and artwork, in dashboard order | Writing it again in the dashboard |
| Where does the public site come from | `scripts/site/`, one layout and one file per page, rendered into `website/` by `scripts/gen-site.mjs` and committed | Editing `website/` by hand. It is output, and `npm run site:check` fails if it drifts |
| What carries a support message, and what does it hold | [../server/support-worker/README.md](../server/support-worker/README.md) | The extension, which holds no key and makes one request to one address |
| What has been explored but not agreed | [proposals/](proposals/) | The roadmap, which carries only agreed work |
| How do I report a vulnerability | [../SECURITY.md](../SECURITY.md) | |
| What changed and when | [../CHANGELOG.md](../CHANGELOG.md) | |
| What did the original 2026-07 product document say | [history/TabPack_BRD_PRD_v0.9.md](history/TabPack_BRD_PRD_v0.9.md) | It is superseded. Read it for history, never for current scope |

## Reading order for a newcomer, human or agent

1. `README.md` for orientation.
2. `PLAN.md` sections 1 to 9 for intent.
3. `docs/DOMAIN.md`, because most mistakes in this codebase come from browser semantics, not from the code.
4. `docs/SPEC.md` for the format.
5. `docs/ARCHITECTURE.md` for the layout and the adapter rule.
6. `AGENTS.md` before writing a line.
7. `docs/ROADMAP.md` Table R1 to pick up work.

## Three layer model

Orientation: `README.md`, `PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/DESIGN.md`.

Execution: `AGENTS.md`, `docs/PLAYBOOK.md`, `docs/ROADMAP.md`, `docs/TESTING.md`.

Memory: `docs/DECISIONS.md`, `docs/LIMITATIONS.md`, `CHANGELOG.md`, `docs/history/`.

Outward facing: `store_listing.md`, `scripts/site/` and the `website/` it renders, `PRIVACY.md`, `SECURITY.md`. These four say things to people who cannot read the code, so a claim in one of them is a promise. When a fact changes, they change in the same commit as the code that changed it.
