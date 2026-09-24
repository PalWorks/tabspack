import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, compileExcludeList, dedupeKey, domainOf } from "../../src/core/filters.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import type { Session, SessionTab, SessionWindow } from "../../src/types/session.js";

const OFF = { ...DEFAULT_SETTINGS, dedupe: false };

function tabOf(overrides: Partial<SessionTab> & { url: string; index: number }): SessionTab {
  return {
    title: overrides.url,
    pinned: false,
    active: false,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: null,
    ...overrides,
  };
}

function sessionOf(tabs: SessionTab[], groups: SessionWindow["groups"] = []): Session {
  return {
    windows: [
      { key: "w1", focused: true, incognito: false, type: "normal", groups, tabs },
    ],
    source: {},
    capturedAt: 0,
  };
}

test("web pages only drops anything that is not http or https", () => {
  const session = sessionOf([
    tabOf({ index: 0, url: "https://example.com/a" }),
    tabOf({ index: 1, url: "chrome://settings/" }),
    tabOf({ index: 2, url: "file:///home/x" }),
  ]);
  const result = applyFilters(session, { ...OFF, webPagesOnly: true });
  assert.equal(result.session.windows[0]?.tabs.length, 1);
  assert.equal(result.removed.scheme, 2);
});

test("skip pinned removes pinned tabs and counts them", () => {
  const session = sessionOf([
    tabOf({ index: 0, url: "https://example.com/a", pinned: true }),
    tabOf({ index: 1, url: "https://example.com/b" }),
  ]);
  const result = applyFilters(session, { ...OFF, skipPinned: true });
  assert.equal(result.session.windows[0]?.tabs.length, 1);
  assert.equal(result.removed.pinned, 1);
});

test("the exclude list matches wildcards and ignores comments", () => {
  const patterns = compileExcludeList("https://ads.example.com/*\n# a comment\n\n*://tracker.test/*");
  assert.equal(patterns.length, 2);
  const session = sessionOf([
    tabOf({ index: 0, url: "https://ads.example.com/banner" }),
    tabOf({ index: 1, url: "https://example.com/keep" }),
  ]);
  const result = applyFilters(session, { ...OFF, excludeList: "https://ads.example.com/*" });
  assert.equal(result.session.windows[0]?.tabs.length, 1);
  assert.equal(result.removed.excluded, 1);
});

test("dedupe keeps the first occurrence across the whole session", () => {
  const session: Session = {
    windows: [
      {
        key: "w1",
        focused: true,
        incognito: false,
        type: "normal",
        groups: [],
        tabs: [tabOf({ index: 0, url: "https://example.com/same" })],
      },
      {
        key: "w2",
        focused: false,
        incognito: false,
        type: "normal",
        groups: [],
        tabs: [
          tabOf({ index: 0, url: "https://example.com/same" }),
          tabOf({ index: 1, url: "https://example.com/other" }),
        ],
      },
    ],
    source: {},
    capturedAt: 0,
  };
  const result = applyFilters(session, { ...OFF, dedupe: true });
  assert.equal(result.removed.duplicate, 1);
  assert.equal(result.session.windows[1]?.tabs.length, 1);
  assert.equal(result.session.windows[1]?.tabs[0]?.url, "https://example.com/other");
});

test("dedupe treats a different query or fragment as a different page", () => {
  assert.notEqual(dedupeKey("https://example.com/a?x=1"), dedupeKey("https://example.com/a?x=2"));
  assert.notEqual(dedupeKey("https://example.com/a#one"), dedupeKey("https://example.com/a#two"));
  assert.equal(dedupeKey("HTTPS://Example.COM/a"), dedupeKey("https://example.com/a"));
});

test("sorting never moves an unpinned tab above a pinned one", () => {
  const session = sessionOf([
    tabOf({ index: 0, url: "https://example.com/zebra", title: "Zebra", pinned: true }),
    tabOf({ index: 1, url: "https://example.com/apple", title: "Apple" }),
    tabOf({ index: 2, url: "https://example.com/mango", title: "Mango" }),
  ]);
  const result = applyFilters(session, { ...OFF, sort: "title" });
  const tabs = result.session.windows[0]?.tabs ?? [];
  assert.equal(tabs[0]?.title, "Zebra");
  assert.deepEqual(tabs.map((t) => t.title), ["Zebra", "Apple", "Mango"]);
});

test("descending sort reverses within the partition", () => {
  const session = sessionOf([
    tabOf({ index: 0, url: "https://a.example.com/", title: "A" }),
    tabOf({ index: 1, url: "https://b.example.com/", title: "B" }),
  ]);
  const result = applyFilters(session, { ...OFF, sort: "domain", sortDesc: true });
  assert.deepEqual(result.session.windows[0]?.tabs.map((t) => t.title), ["B", "A"]);
});

test("filtering reindexes, remaps openers and prunes empty groups", () => {
  const session = sessionOf(
    [
      tabOf({ index: 0, url: "chrome://settings/", groupKey: "g1" }),
      tabOf({ index: 1, url: "https://example.com/parent", groupKey: "g2" }),
      tabOf({ index: 2, url: "https://example.com/child", groupKey: "g2", openerIndex: 1 }),
      tabOf({ index: 3, url: "https://example.com/orphan", openerIndex: 0 }),
    ],
    [
      { key: "g1", title: "Gone" },
      { key: "g2", title: "Kept" },
    ],
  );
  const result = applyFilters(session, { ...OFF, webPagesOnly: true });
  const win = result.session.windows[0];
  assert.deepEqual(win?.tabs.map((t) => t.index), [0, 1, 2]);
  assert.equal(win?.tabs[1]?.openerIndex, 0);
  assert.equal(win?.tabs[2]?.openerIndex, null);
  assert.deepEqual(win?.groups.map((g) => g.key), ["g2"]);
});

test("a window emptied by a filter is dropped entirely", () => {
  const session = sessionOf([tabOf({ index: 0, url: "chrome://settings/" })]);
  const result = applyFilters(session, { ...OFF, webPagesOnly: true });
  assert.equal(result.session.windows.length, 0);
});

test("domainOf survives a URL that is not a URL", () => {
  assert.equal(domainOf("not a url"), "");
  assert.equal(domainOf("https://Example.com/path"), "example.com");
});
