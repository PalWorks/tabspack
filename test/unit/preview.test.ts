/**
 * T-203. The tree's shape is decided by a pure function, so the ordering rules
 * can be tested without a browser: groups appear where their first tab appeared,
 * their members are shown together the way the browser will show them after a
 * restore, and nothing in the pack is left out of the list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, shortUrl } from "../../src/ui/manager/preview-tree.js";
import type { Session, SessionTab } from "../../src/types/session.js";

function tabOf(index: number, url: string, groupKey?: string): SessionTab {
  return {
    index,
    url,
    title: `Tab ${index}`,
    pinned: false,
    active: false,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: null,
    ...(groupKey ? { groupKey } : {}),
  };
}

function sessionOf(): Session {
  return {
    capturedAt: 0,
    source: {},
    windows: [
      {
        key: "w1",
        focused: true,
        incognito: false,
        type: "normal",
        groups: [
          { key: "g1", title: "Research", color: "blue" },
          { key: "g2", title: "Reading", color: "green", collapsed: true },
        ],
        tabs: [
          tabOf(0, "https://example.com/first"),
          tabOf(1, "https://example.com/research-a", "g1"),
          tabOf(2, "https://example.com/reading-a", "g2"),
          tabOf(3, "https://example.com/research-b", "g1"),
          tabOf(4, "chrome://settings/"),
        ],
      },
    ],
  };
}

test("a window, its groups and its tabs become one flat list", () => {
  const rows = flatten(sessionOf(), new Map());
  assert.deepEqual(
    rows.map((row) => `${row.kind}:${row.id}`),
    [
      "window:w1",
      "tab:w1:0",
      "group:w1/g1",
      "tab:w1:1",
      "tab:w1:3",
      "group:w1/g2",
      "tab:w1:2",
      "tab:w1:4",
    ],
  );
});

test("a group's tabs are shown together even when the file interleaved them", () => {
  const rows = flatten(sessionOf(), new Map());
  const group = rows.find((row) => row.id === "w1/g1");
  assert.deepEqual(group?.tabIds, ["w1:1", "w1:3"]);
  assert.equal(group?.detail, "2 tabs");
  assert.equal(group?.colour, "blue");
});

test("a window row owns every tab under it, so selecting it selects the pack", () => {
  const rows = flatten(sessionOf(), new Map());
  assert.deepEqual(rows[0]?.tabIds, ["w1:0", "w1:1", "w1:2", "w1:3", "w1:4"]);
  assert.equal(rows[0]?.detail, "5 tabs · 2 groups");
});

test("a tab that cannot be opened carries its flag", () => {
  const rows = flatten(sessionOf(), new Map([["w1:4", "cannot be opened"]]));
  assert.equal(rows.find((row) => row.id === "w1:4")?.blocked, "cannot be opened");
  assert.equal(rows.find((row) => row.id === "w1:0")?.blocked, undefined);
});

test("a web address is shown without its scheme, and anything else keeps it", () => {
  assert.equal(shortUrl("https://example.com/a?b=1"), "example.com/a?b=1");
  assert.equal(shortUrl("chrome://settings/"), "chrome://settings/");
  assert.equal(shortUrl(`https://example.com/${"x".repeat(200)}`).length, 90);
});
