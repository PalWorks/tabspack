# Foreign format fixtures

One real export per adapter in docs/SPEC.md Table S5, added at M3 with the
adapter that reads it (tasks T-303 to T-308).

Two rules for anything committed here:

1. It must be a genuine export from the tool in question, not a reconstruction.
   An adapter written against an imagined file shape is an adapter that fails on
   contact with a real one.
2. Personal data is stripped first. Replace real URLs with `example.com` paths
   that keep the structure, and remove titles that identify anyone.

Each fixture is committed with a malformed sibling, so the adapter is tested on
both the happy path and on a file that has been truncated or edited by hand.
