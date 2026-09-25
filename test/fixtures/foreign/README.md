# Foreign format fixtures

One sample per adapter in docs/SPEC.md Table S5, with a malformed sibling, added
at M3 with the adapters that read them (tasks T-303 to T-308).

## What these files are

**Reconstructions, not genuine exports.** They were written against the shape
each tool documents or, for Tab Session Manager, against its own source
(`src/background/save.js`, which builds `windows` keyed by window id, `tabs`
keyed by tab id, `windowsInfo` and `tabGroups`). Session Buddy is closed source,
so its JSON and CSV samples follow its documented shape.

That is a weaker guarantee than a real export, and it is recorded as debt in
docs/LIMITATIONS.md Table L4. An adapter written against an imagined file shape
is an adapter that fails on contact with a real one, so replacing each of these
with a genuine export, personal data stripped, is worth doing before v1 ships.

## Rules for anything added here

1. Prefer a genuine export from the tool in question. If one is reconstructed,
   say so here and add the debt row.
2. Personal data is stripped first. Replace real URLs with `example.com` paths
   that keep the structure, and remove titles that identify anyone.
3. Every fixture is committed with a malformed sibling, so the adapter is tested
   on both the happy path and on a file that has been truncated or hand edited.
   The malformed one must fail with a message that says what to do next.
