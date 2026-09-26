import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportReport, formatBytes, removedParts, totalRemoved } from "../../src/core/report.js";
import type { Session } from "../../src/types/session.js";

const session: Session = {
  windows: [
    {
      key: "w1",
      focused: true,
      incognito: false,
      type: "normal",
      groups: [{ key: "g1", title: "One" }],
      tabs: [
        {
          index: 0,
          url: "https://example.com/",
          title: "Example",
          pinned: false,
          active: true,
          muted: false,
          discarded: false,
          openerIndex: null,
          cookieStoreId: null,
          lastAccessed: null,
        },
      ],
    },
  ],
  source: {},
  capturedAt: 0,
};

test("a report counts what was kept and what was dropped", () => {
  const report = buildExportReport({
    session,
    removed: { scheme: 1, pinned: 0, stale: 0, excluded: 0, duplicate: 2 },
    format: "tabspack",
    bytes: 2048,
    filename: "tabspack-20260924-0930.tabspack.json",
    saved: true,
  });
  assert.equal(report.tabs, 1);
  assert.equal(report.windows, 1);
  assert.equal(report.groups, 1);
  assert.equal(totalRemoved(report.removed), 3);
});

/*
 * Without the `tabGroups` permission the collector never reads a title or a
 * colour, so the file carries bare membership and a restore produces unnamed
 * clusters. The export report is the only place a user can learn that before
 * it happens: ADR-030.
 */
test("a group with no name and no colour is counted, so the export can say so", () => {
  const bare: Session = {
    ...session,
    windows: [
      {
        ...(session.windows[0] as (typeof session.windows)[number]),
        groups: [{ key: "g1" }, { key: "g2" }, { key: "g3", title: "Named" }],
      },
    ],
  };
  const report = buildExportReport({
    session: bare,
    removed: { scheme: 0, pinned: 0, stale: 0, excluded: 0, duplicate: 0 },
    format: "tabspack",
    bytes: 100,
    filename: "x.tabspack.json",
    saved: true,
  });
  assert.equal(report.unnamedGroups, 2, "the two bare groups are counted, the named one is not");
});

test("a pack whose groups all have names reports none missing", () => {
  const report = buildExportReport({
    session,
    removed: { scheme: 0, pinned: 0, stale: 0, excluded: 0, duplicate: 0 },
    format: "tabspack",
    bytes: 100,
    filename: "x.tabspack.json",
    saved: true,
  });
  assert.equal(report.unnamedGroups, 0);
});

test("every filter that dropped something is named", () => {
  // The order is the order the interface prints them in, most surprising first.
  assert.deepEqual(removedParts({ scheme: 1, pinned: 2, stale: 0, excluded: 3, duplicate: 4 }), [
    { kind: "duplicate", count: 4 },
    { kind: "pinned", count: 2 },
    { kind: "scheme", count: 1 },
    { kind: "excluded", count: 3 },
  ]);
  assert.deepEqual(removedParts({ scheme: 0, pinned: 0, stale: 0, excluded: 0, duplicate: 1 }), [
    { kind: "duplicate", count: 1 },
  ]);
  assert.deepEqual(removedParts({ scheme: 0, pinned: 0, stale: 0, excluded: 0, duplicate: 0 }), []);
});

test("byte counts are rendered at a human scale", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1024 * 1024 * 3), "3.0 MB");
});
