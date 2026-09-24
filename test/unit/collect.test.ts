import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSession, normaliseColor, tabUrl } from "../../src/core/collect.js";
import { createFakeAdapter, group, tab, window_ } from "../tools/fake-adapter.js";
import type { FakeState } from "../tools/fake-adapter.js";
import { referenceScenario } from "../tools/scenarios.js";
import type { Scenario } from "../tools/scenarios.js";

const NOW = 1_759_000_000_000;

function adapterFor(scenario: Scenario, extra: Partial<FakeState> = {}) {
  return createFakeAdapter({ ...scenario, ...extra });
}

test("reads the reference scenario into three windows, forty tabs and three groups", async () => {
  const session = await collectSession(adapterFor(referenceScenario()), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(session.windows.length, 3);
  assert.equal(session.windows.reduce((sum, win) => sum + win.tabs.length, 0), 40);
  assert.equal(session.windows.reduce((sum, win) => sum + win.groups.length, 0), 3);
  assert.deepEqual(
    session.windows.map((win) => win.key),
    ["w1", "w2", "w3"],
  );
});

test("keeps tab order, pinned tabs and the active tab", async () => {
  const session = await collectSession(adapterFor(referenceScenario()), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  const first = session.windows[0];
  assert.ok(first);
  assert.deepEqual(
    first.tabs.map((t) => t.index),
    first.tabs.map((_, index) => index),
  );
  assert.equal(first.tabs.filter((t) => t.pinned).length, 2);
  assert.equal(first.tabs.filter((t) => t.active).length, 1);
});

test("falls back to pendingUrl so an unloaded tab is not lost", async () => {
  assert.equal(tabUrl({ index: 0, url: "", pendingUrl: "https://example.com/x" }), "https://example.com/x");
  assert.equal(tabUrl({ index: 0, url: "  " }), "");

  const session = await collectSession(adapterFor(referenceScenario()), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  const unloaded = session.windows[0]?.tabs.at(-1);
  assert.equal(unloaded?.url, "https://example.com/research/unloaded");
  assert.equal(unloaded?.discarded, true);
});

test("assigns file local group keys in order of first appearance", async () => {
  const session = await collectSession(adapterFor(referenceScenario()), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  const first = session.windows[0];
  assert.deepEqual(first?.groups.map((g) => g.key), ["g1", "g2"]);
  assert.deepEqual(first?.groups.map((g) => g.title), ["Research", "Reading"]);
  assert.equal(first?.groups[1]?.collapsed, true);
  assert.equal(first?.tabs[5]?.groupKey, "g1");
  assert.equal(first?.tabs[0]?.groupKey, undefined);
});

test("skips windows that are not normal, because their tabs cannot be restored", async () => {
  const scenario = {
    windows: [
      window_({ id: 1, focused: true, tabs: [tab({ url: "https://example.com/a" })] }),
      window_({ id: 2, type: "popup", tabs: [tab({ url: "https://example.com/popup" })] }),
    ],
    groups: [],
  };
  const session = await collectSession(adapterFor(scenario), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(session.windows.length, 1);
});

test("excludes private windows unless asked", async () => {
  const scenario = {
    windows: [
      window_({ id: 1, focused: true, tabs: [tab({ url: "https://example.com/a" })] }),
      window_({ id: 2, incognito: true, tabs: [tab({ url: "https://example.com/secret" })] }),
    ],
    groups: [],
  };
  const excluded = await collectSession(adapterFor(scenario), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(excluded.windows.length, 1);

  const included = await collectSession(adapterFor(scenario), {
    scope: "all_windows",
    includeIncognito: true,
    now: NOW,
  });
  assert.equal(included.windows.length, 2);
});

test("keeps group membership but no invented metadata when the groups API is absent", async () => {
  const session = await collectSession(
    adapterFor(referenceScenario(), { capabilities: { tabGroups: false } }),
    { scope: "all_windows", includeIncognito: false, now: NOW },
  );
  // Which tabs belong together survives, because that is knowable from the tab.
  assert.equal(session.windows.reduce((sum, win) => sum + win.groups.length, 0), 3);
  assert.equal(session.windows.reduce((sum, win) => sum + win.tabs.length, 0), 40);
  const first = session.windows[0]?.groups[0];
  assert.equal(first?.key, "g1");
  // Title and colour are unknowable without the API, so they are absent rather
  // than guessed.
  assert.equal(first?.title, undefined);
  assert.equal(first?.color, undefined);
  assert.equal(first?.collapsed, undefined);
});

test("maps opener tabs to positions, never to browser ids", async () => {
  const scenario = {
    windows: [
      window_({
        id: 1,
        focused: true,
        tabs: [
          tab({ id: 900, index: 0, url: "https://example.com/parent" }),
          tab({ id: 901, index: 1, url: "https://example.com/child", openerTabId: 900 }),
          tab({ id: 902, index: 2, url: "https://example.com/orphan", openerTabId: 7777 }),
        ],
      }),
    ],
    groups: [],
  };
  const session = await collectSession(adapterFor(scenario), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  const tabs = session.windows[0]?.tabs ?? [];
  assert.equal(tabs[1]?.openerIndex, 0);
  assert.equal(tabs[2]?.openerIndex, null);
});

test("current tab and selection scopes read the focused window only", async () => {
  const scenario = {
    windows: [
      window_({
        id: 1,
        focused: true,
        tabs: [
          tab({ index: 0, url: "https://example.com/a", active: true }),
          tab({ index: 1, url: "https://example.com/b", highlighted: true }),
          tab({ index: 2, url: "https://example.com/c" }),
        ],
      }),
      window_({ id: 2, tabs: [tab({ url: "https://example.com/other" })] }),
    ],
    groups: [],
  };
  const current = await collectSession(adapterFor(scenario), {
    scope: "current_tab",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(current.windows[0]?.tabs.length, 1);
  assert.equal(current.windows[0]?.tabs[0]?.url, "https://example.com/a");

  const selection = await collectSession(adapterFor(scenario), {
    scope: "selection",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(selection.windows[0]?.tabs.length, 2);
});

test("an unknown group colour falls back to grey rather than failing", () => {
  assert.equal(normaliseColor("chartreuse"), "grey");
  assert.equal(normaliseColor(undefined), "grey");
  assert.equal(normaliseColor("purple"), "purple");
});

test("records provenance without using it to branch", async () => {
  const session = await collectSession(
    adapterFor(referenceScenario(), { platform: { browser: "Firefox", browserVersion: "142.0" } }),
    { scope: "all_windows", includeIncognito: false, now: NOW },
  );
  assert.equal(session.source.browser, "Firefox");
  assert.equal(session.capturedAt, NOW);
});

test("ignores group metadata for a group with no members", async () => {
  const scenario = {
    windows: [window_({ id: 1, focused: true, tabs: [tab({ url: "https://example.com/a", groupId: -1 })] })],
    groups: [group({ id: 5, windowId: 1, title: "Empty" })],
  };
  const session = await collectSession(adapterFor(scenario), {
    scope: "all_windows",
    includeIncognito: false,
    now: NOW,
  });
  assert.equal(session.windows[0]?.groups.length, 0);
});
