# Migration fixtures

A before and after pair per `schemaVersion` step, per docs/PLAYBOOK.md section 4.

Version 1 is the first released version of the format, so there is no real
migration yet. The pair here describes a **hypothetical** step from 1 to 2 and
exists to exercise the machinery in `src/core/migrate.ts`: the registry, the
order of steps, the version rewrite and the refusal to guess when no step is
registered. `test/unit/migrate.test.ts` supplies the demonstration step; the
shipped registry is empty.

When the format really does change, the real pair replaces this one and the step
moves into `MIGRATIONS`.
