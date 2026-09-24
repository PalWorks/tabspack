import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportReport, describeRemoved, formatBytes, totalRemoved } from "../../src/core/report.js";
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
    removed: { scheme: 1, pinned: 0, excluded: 0, duplicate: 2 },
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

test("every filter that dropped something is named", () => {
  assert.equal(
    describeRemoved({ scheme: 1, pinned: 2, excluded: 3, duplicate: 4 }),
    "4 duplicates, 2 pinned, 1 not a web page, 3 excluded skipped",
  );
  assert.equal(describeRemoved({ scheme: 0, pinned: 0, excluded: 0, duplicate: 1 }), "1 duplicate skipped");
  assert.equal(describeRemoved({ scheme: 0, pinned: 0, excluded: 0, duplicate: 0 }), "");
});

test("byte counts are rendered at a human scale", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1024 * 1024 * 3), "3.0 MB");
});
