/**
 * T-204 to T-207. The restore engine against the writable fake browser, which
 * models the browser semantics that make this the highest risk code in the
 * product: pinned tabs clamped into their own region, a window that closes when
 * its last tab is removed, `discarded` refused at creation, and a group that
 * cannot be collapsed while it holds the active tab.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildExport } from "../../src/core/export.js";
import { loadPack } from "../../src/core/import.js";
import { DEFAULT_RESTORE_POLICY, restoreSession, type RestoreOptions } from "../../src/core/restore.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import type { Session } from "../../src/types/session.js";
import { createFakeAdapter, tab, window_, type FakeAdapter, type FakeState } from "../tools/fake-adapter.js";
import { referenceScenario } from "../tools/scenarios.js";

const WHEN = new Date("2026-09-24T08:29:40Z");
const NOW = WHEN.getTime();

/** No wall clock in the suite: the throttle is asserted by counting its pauses. */
function options(overrides: Partial<RestoreOptions> = {}): RestoreOptions & { pauses: number[] } {
  const pauses: number[] = [];
  return {
    ...DEFAULT_RESTORE_POLICY,
    skipDuplicates: false,
    sleep: async (ms: number) => {
      pauses.push(ms);
    },
    now: () => NOW,
    pauses,
    ...overrides,
  };
}

async function referencePack(): Promise<Session> {
  const payload = await buildExport(
    createFakeAdapter(referenceScenario()),
    { ...DEFAULT_SETTINGS, dedupe: false, keepFavicons: false },
    { now: WHEN },
  );
  const loaded = loadPack(payload.text, { now: NOW });
  assert.ok(loaded.session, "the reference pack must load");
  return loaded.session;
}

function emptyBrowser(extra: Partial<FakeState> = {}): FakeAdapter {
  return createFakeAdapter({ windows: [], groups: [], ...extra });
}

function urls(adapter: FakeAdapter): string[][] {
  return adapter.state.windows.map((win) => (win.tabs ?? []).map((entry) => entry.url ?? ""));
}

test("restores the reference pack into three windows in the right order", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());

  assert.equal(report.ok, true);
  assert.equal(report.windows, 3);
  // Forty tabs, less the chrome:// and file:// addresses no extension may open.
  assert.equal(report.restored, 38);
  assert.equal(report.unopenable.length, 2);
  assert.equal(adapter.state.windows.length, 3);
  assert.deepEqual(
    adapter.state.windows.map((win) => (win.tabs ?? []).length),
    [18, 14, 6],
  );
  const first = urls(adapter)[0] ?? [];
  assert.equal(first[0], "https://example.com/research/0", "the placeholder tab is gone");
  assert.equal(first[17], "https://example.com/research/unloaded", "an unloaded tab keeps its address");
});

test("the placeholder tab is removed only after a real tab exists", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  const sequence = adapter.calls.map((call) => call.method);
  const firstWindow = sequence.indexOf("createWindow");
  const firstTab = sequence.indexOf("createTab");
  const firstRemove = sequence.indexOf("removeTabs");
  assert.ok(firstWindow < firstTab, "the window comes first");
  assert.ok(firstTab < firstRemove, "removing the placeholder before the first tab would close the window");
});

test("pinned tabs hold the lowest indices after a restore", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  const tabs = adapter.state.windows[0]?.tabs ?? [];
  assert.deepEqual(
    tabs.slice(0, 3).map((entry) => entry.pinned),
    [true, true, false],
  );
  assert.deepEqual(
    tabs.map((entry) => entry.index),
    tabs.map((_, index) => index),
  );
});

test("groups are recreated with their title, colour and collapsed state", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.equal(report.groups, 3);
  assert.equal(report.ungrouped, 0);
  const restored = adapter.state.groups.map((group) => ({
    title: group.title,
    color: group.color,
    collapsed: group.collapsed,
  }));
  assert.deepEqual(restored, [
    { title: "Research", color: "blue", collapsed: false },
    { title: "Reading", color: "green", collapsed: true },
    { title: "Shopping", color: "orange", collapsed: false },
  ]);
});

test("grouping happens after the tabs exist, because a tab cannot be created into a group", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());

  const created = new Set<number>();
  let grouped = 0;
  for (const call of adapter.calls) {
    if (call.method === "createTab") continue;
    if (call.method !== "groupTabs") continue;
    grouped += 1;
    for (const tabId of (call.detail as { tabIds: number[] }).tabIds) {
      assert.ok(!created.has(tabId), "a tab id is grouped once");
    }
  }
  // Every id handed to groupTabs must be one a createTab call already returned.
  const createdIds = new Set(
    adapter.state.windows.flatMap((win) => (win.tabs ?? []).map((entry) => entry.id as number)),
  );
  for (const call of adapter.calls.filter((entry) => entry.method === "groupTabs")) {
    for (const tabId of (call.detail as { tabIds: number[] }).tabIds) {
      assert.ok(createdIds.has(tabId), `group referenced an unknown tab ${tabId}`);
    }
  }
  assert.equal(grouped, 3);
});

test("a collapsed group holding the active tab is reported rather than silently left open", async () => {
  const session = await referencePack();
  const window = session.windows[0];
  assert.ok(window);
  // Make the collapsed group the one holding the active tab, which no browser
  // will collapse.
  const collapsed = window.groups.find((group) => group.collapsed);
  const active = window.tabs.find((entry) => entry.active);
  assert.ok(collapsed && active);
  active.groupKey = collapsed.key;

  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.ok(report.issues.some((issue) => issue.code === "restore.collapse_refused"));
  assert.match(
    report.issues.find((issue) => issue.code === "restore.collapse_refused")?.message ?? "",
    /restored open/,
  );
});

test("the active tab is activated, and it is activated last", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  for (const win of adapter.state.windows) {
    const active = (win.tabs ?? []).filter((entry) => entry.active);
    assert.equal(active.length, 1, "exactly one active tab per window");
  }
  assert.equal(adapter.state.windows[0]?.tabs?.find((entry) => entry.active)?.url, "https://example.com/research/4");
});

test("every restored tab is unloaded by default, except the one in front of the user", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());

  const tabs = adapter.state.windows.flatMap((win) => win.tabs ?? []);
  const loaded = tabs.filter((entry) => !entry.discarded);
  assert.equal(
    loaded.length,
    adapter.state.windows.length,
    "one loaded tab per window, the active one, and nothing else",
  );
  assert.ok(loaded.every((entry) => entry.active === true));
  assert.equal(report.discarded, tabs.length - loaded.length, "the report counts what actually unloaded");
});

test("unloading is flushed per batch, so a restore never holds more loaded than a batch", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options({ batchSize: 4 }));
  const flushes = adapter.calls.filter((call) => call.method === "discardTabs");
  assert.ok(flushes.length > 1, `expected several flushes, saw ${flushes.length}`);
  for (const flush of flushes) {
    assert.ok((flush.detail as number[]).length <= 4, "a flush never exceeds the batch size");
  }
});

test("a tab the browser refuses to unload is not counted as unloaded", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  // The fake browser refuses the active tab, which is what a real one does.
  const report = await restoreSession(adapter, session, options());
  const asked = adapter.calls
    .filter((call) => call.method === "discardTabs")
    .reduce((sum, call) => sum + (call.detail as number[]).length, 0);
  assert.ok(report.discarded <= asked, "never more than were asked for");
});

test("with the toggle off, tabs beyond the threshold are unloaded and the probe runs once", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(
    adapter,
    session,
    options({ unloadRestored: false, discardThreshold: 5 }),
  );
  const attempts = adapter.calls.filter(
    (call) => call.method === "createTab" && (call.detail as { discarded?: boolean }).discarded === true,
  );
  assert.equal(attempts.length, 1, "one rejection is enough to settle discardOnCreate for the restore");
  assert.ok(report.discarded > 20, `${report.discarded} tabs should have been unloaded`);
  assert.ok(adapter.calls.some((call) => call.method === "discardTabs"));
  const loaded = adapter.state.windows.flatMap((win) => win.tabs ?? []).filter((entry) => !entry.discarded);
  assert.ok(loaded.length <= 5 + adapter.state.windows.length, "only the first few tabs stay loaded");
});

test("a browser that accepts discarded at creation is used that way instead", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser({ capabilities: { discardOnCreate: true } });
  await restoreSession(adapter, session, options({ unloadRestored: false, discardThreshold: 2 }));
  assert.equal(adapter.calls.some((call) => call.method === "discardTabs"), false);
  const created = adapter.calls.filter(
    (call) => call.method === "createTab" && (call.detail as { discarded?: boolean }).discarded === true,
  );
  assert.ok(created.length > 30);
});

test("the active tab is never unloaded", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options({ discardThreshold: 0 }));
  for (const win of adapter.state.windows) {
    const active = (win.tabs ?? []).find((entry) => entry.active);
    assert.equal(active?.discarded, false);
  }
});

test("creation is throttled in batches", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const opts = options({ batchSize: 8, batchDelayMs: 25 });
  await restoreSession(adapter, session, opts);
  // 18, 14 and 6 tabs in batches of 8: two pauses, one pause, none.
  assert.deepEqual(opts.pauses, [25, 25, 25]);
});

test("a window manager that refuses the bounds is retried once and reported", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser({ failBoundsOnce: true });
  const report = await restoreSession(adapter, session, options());
  assert.equal(report.windows, 3);
  assert.ok(report.issues.some((issue) => issue.code === "restore.bounds_refused"));
  const retried = adapter.calls
    .filter((call) => call.method === "createWindow")
    .map((call) => call.detail as { width?: number });
  assert.ok(retried.some((request) => request.width === 800), "the retry uses a size no window manager refuses");
});

test("a maximized window is created without bounds and maximized afterwards", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  const create = adapter.calls.find((call) => call.method === "createWindow")?.detail as Record<string, unknown>;
  assert.equal(create["state"], undefined);
  assert.equal(create["width"], undefined, "bounds and a state cannot be sent in the same call");
  assert.ok(
    adapter.calls.some(
      (call) =>
        call.method === "updateWindow" &&
        ((call.detail as { request: { state?: string } }).request.state === "maximized"),
    ),
  );
  assert.equal(adapter.state.windows[0]?.state, "maximized");
});

test("a window with plain state keeps the position and size from the pack", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  const second = adapter.state.windows[1];
  assert.equal(second?.left, 40);
  assert.equal(second?.width, 1280);
});

test("tabs already open are skipped and counted when asked for", async () => {
  const session = await referencePack();
  const adapter = createFakeAdapter({
    windows: [
      window_({
        id: 1,
        focused: true,
        tabs: [tab({ id: 1, index: 0, url: "https://example.com/research/3", active: true })],
      }),
    ],
    groups: [],
  });
  const report = await restoreSession(adapter, session, options({ skipDuplicates: true }));
  assert.equal(report.duplicates, 2, "the open tab, and the pack's own duplicate of it");
  assert.equal(report.restored, 36);
});

test("addresses no extension can open are listed and the placeholder page is opened", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.deepEqual(
    report.unopenable.map((entry) => entry.url),
    ["chrome://settings/", "file:///home/example/notes.txt"],
  );
  assert.equal(report.placeholderOpened, true);
  assert.match(adapter.opened[0] ?? "", /^placeholder\.html\?id=/);
  const stored = await adapter.storageGetAll();
  const key = Object.keys(stored).find((name) => name.startsWith("placeholder:"));
  assert.ok(key, "the list is handed over through storage, not through the URL");
  assert.equal((stored as Record<string, { tabs: unknown[] }>)[key as string]?.tabs.length, 2);
  assert.ok(report.issues.some((issue) => issue.code === "restore.unopenable"));
});

test("a local file is restored when the browser has granted file access", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser({ fileAccessAllowed: true });
  const report = await restoreSession(adapter, session, options());
  assert.deepEqual(
    report.unopenable.map((entry) => entry.url),
    ["chrome://settings/"],
  );
  assert.equal(report.restored, 39);
});

test("the placeholder page can be turned off, and the report still names the count", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options({ openPlaceholder: false }));
  assert.equal(report.placeholderOpened, false);
  assert.equal(adapter.opened.length, 0);
  assert.equal(report.unopenable.length, 2);
});

test("restoring into the current window merges the pack and says so", async () => {
  const session = await referencePack();
  const adapter = createFakeAdapter({
    windows: [window_({ id: 1, focused: true, tabs: [tab({ id: 1, index: 0, url: "https://example.org/open", active: true })] })],
    groups: [],
  });
  const report = await restoreSession(adapter, session, options({ target: "current_window" }));
  assert.equal(adapter.state.windows.length, 1);
  assert.equal(report.windows, 1);
  assert.equal((adapter.state.windows[0]?.tabs ?? []).length, 39, "one tab was already there");
  assert.ok(report.issues.some((issue) => issue.code === "restore.windows_merged"));
  assert.equal(adapter.calls.some((call) => call.method === "createWindow"), false);
});

test("only the selected tabs are restored", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const wanted = new Set(["w2:0", "w2:1", "w2:2"]);
  const report = await restoreSession(
    adapter,
    session,
    options({ include: (windowKey, index) => wanted.has(`${windowKey}:${index}`) }),
  );
  assert.equal(report.selected, 3);
  assert.equal(report.restored, 3);
  assert.equal(adapter.state.windows.length, 1);
  assert.deepEqual(urls(adapter)[0], [
    "https://example.org/item/0",
    "https://example.org/item/1",
    "https://example.org/item/2",
  ]);
});

test("a browser without tab groups restores the tabs in order and says once what it could not do", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser({ capabilities: { tabGroups: false } });
  const report = await restoreSession(adapter, session, options());
  assert.equal(report.groups, 0);
  assert.equal(report.ungrouped, 14);
  const notices = report.issues.filter((issue) => issue.code === "restore.no_groups");
  assert.equal(notices.length, 1, "one notice, not one per tab");
  assert.equal(report.restored, 38, "every tab is still restored");
});

test("opener relationships and muted tabs survive", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  await restoreSession(adapter, session, options());
  const second = adapter.state.windows[1]?.tabs ?? [];
  const child = second[1];
  assert.equal(child?.openerTabId, second[0]?.id);
  assert.equal(second[2]?.mutedInfo?.muted, true);
});

test("an empty selection restores nothing and does not open a window", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options({ include: () => false }));
  assert.equal(report.restored, 0);
  assert.equal(report.windows, 0);
  assert.equal(adapter.state.windows.length, 0);
  assert.equal(report.ok, true);
});

test("a popup window in a pack is skipped with a reason", async () => {
  const session = await referencePack();
  const window = session.windows[1];
  assert.ok(window);
  window.type = "popup";
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.equal(report.windows, 2);
  assert.ok(report.issues.some((issue) => issue.code === "restore.window_type_skipped"));
});

test("a private window in a pack is restored as an ordinary one when private access is off", async () => {
  const session = await referencePack();
  const window = session.windows[0];
  assert.ok(window);
  window.incognito = true;
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.ok(report.issues.some((issue) => issue.code === "restore.incognito_not_allowed"));
  assert.equal(adapter.state.windows[0]?.incognito, false);
  assert.equal(report.windows, 3);
});

test("the report is a returned object, and its numbers add up", async () => {
  const session = await referencePack();
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, session, options());
  assert.equal(report.selected, 40);
  assert.equal(report.restored + report.duplicates + report.unopenable.length, report.selected);
  assert.equal(typeof report.ms, "number");
});

test("the fixture of restricted URLs produces a placeholder list of five and one restored tab", async () => {
  const text = readFileSync(
    path.join(process.cwd(), "test", "fixtures", "edge", "restricted-urls.tabspack.json"),
    "utf8",
  );
  const loaded = loadPack(text, { now: NOW });
  assert.ok(loaded.session);
  const adapter = emptyBrowser();
  const report = await restoreSession(adapter, loaded.session, options());
  assert.equal(report.unopenable.length, 5);
  assert.equal(report.restored, 1);
  assert.deepEqual(
    report.unopenable.map((entry) => entry.url),
    [
      "chrome://settings/",
      "about:config",
      "javascript:alert(1)",
      "view-source:https://example.com/",
      "file:///home/example/notes.txt",
    ],
  );
});
