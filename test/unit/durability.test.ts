/**
 * M9: the recovery copy (B-102), recent sessions (B-104) and automatic snapshots (B-101), driven the way
 * the worker drives them, against a browser that only exists in node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALARM_AUTO,
  ALARM_RECOVERY,
  AUTO_TAG,
  OFFER_KEY,
  PENDING_KEY,
  RECENT_KEEP,
  RECOVERY_KEY,
  beginStartup,
  deleteRecent,
  keepRecent,
  readRecent,
  rollRecent,
  checkStartup,
  readAutoState,
  readOffer,
  readPrevious,
  reconcileAlarms,
  runAutoSnapshot,
  scheduleRecovery,
  writeRecovery,
} from "../../src/core/durability.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/core/settings.js";
import { listSnapshots, renameSnapshot, saveSnapshot } from "../../src/core/snapshots.js";
import { onAlarm, onStartup, onTabsChanged } from "../../src/background/durability.js";
import { createFakeAdapter, tab, window_, type FakeAdapter } from "../tools/fake-adapter.js";

const ON: Settings = { ...DEFAULT_SETTINGS, recoveryCopy: true, autoSnapshotHours: 1, autoSnapshotKeep: 3 };
const OFF: Settings = { ...DEFAULT_SETTINGS, recoveryCopy: false };

function browserWith(count: number, prefix = "a", storage: Record<string, unknown> = {}): FakeAdapter {
  return createFakeAdapter({
    windows: [window_({ id: 1, tabs: Array.from({ length: count }, (_, index) => tab({ id: index + 1, index, url: `https://${prefix}.example/${index}` })) })],
    groups: [],
    storage: { settings: ON, ...storage },
  });
}

function setTabs(adapter: FakeAdapter, count: number, prefix = "a"): void {
  adapter.state.windows = [
    window_({ id: 1, tabs: Array.from({ length: count }, (_, index) => tab({ id: 100 + index, index, url: `https://${prefix}.example/${index}` })) }),
  ];
}

test("the recovery copy is on from install, with nothing to agree to first", () => {
  assert.equal(DEFAULT_SETTINGS.recoveryCopy, true);
});

test("turned off, the recovery copy writes and schedules nothing", async () => {
  const adapter = browserWith(3);
  assert.equal(await writeRecovery(adapter, OFF), "off");
  assert.equal(await scheduleRecovery(adapter, OFF), false);
  assert.equal(adapter.alarms.size, 0);
});

test("the copy is written once, and not again until the tabs change", async () => {
  const adapter = browserWith(3);
  assert.equal(await writeRecovery(adapter, ON, 1000), "written");
  assert.equal(await writeRecovery(adapter, ON, 2000), "unchanged");
  setTabs(adapter, 4);
  assert.equal(await writeRecovery(adapter, ON, 3000), "written");
  const stored = (await adapter.storageGet({ [RECOVERY_KEY]: null as unknown }))[RECOVERY_KEY] as { tabs: number; capturedAt: number };
  assert.equal(stored.tabs, 4);
  assert.equal(stored.capturedAt, 3000);
});

test("an empty browser never overwrites the copy", async () => {
  const adapter = browserWith(3);
  await writeRecovery(adapter, ON, 1000);
  adapter.state.windows = [];
  assert.equal(await writeRecovery(adapter, ON, 2000), "empty");
  const stored = (await adapter.storageGet({ [RECOVERY_KEY]: null as unknown }))[RECOVERY_KEY] as { tabs: number };
  assert.equal(stored.tabs, 3);
});

test("a storm of tab changes schedules one write", async () => {
  const adapter = browserWith(3);
  assert.equal(await scheduleRecovery(adapter, ON), true);
  assert.equal(await scheduleRecovery(adapter, ON), false);
  assert.ok(adapter.alarms.has(ALARM_RECOVERY));
});

test("a window closing does not schedule anything, because a shutdown looks the same", async () => {
  const adapter = browserWith(3);
  adapter.sessionStore.tabspackBoot = 1;
  await onTabsChanged(adapter, { closing: true });
  assert.equal(adapter.alarms.has(ALARM_RECOVERY), false);
  await onTabsChanged(adapter, { closing: false });
  assert.ok(adapter.alarms.has(ALARM_RECOVERY));
});

test("after a crash that lost the session, the start check offers it, and the copy waits until then", async () => {
  const adapter = browserWith(40);
  await writeRecovery(adapter, ON, 1000);
  // The browser comes back with one new tab page and nothing else.
  adapter.state.windows = [window_({ id: 9, tabs: [tab({ id: 900, url: "chrome://newtab/" })] })];
  await onStartup(adapter);
  assert.equal((await adapter.storageGet({ [PENDING_KEY]: false }))[PENDING_KEY], true);
  assert.equal(await writeRecovery(adapter, ON, 2000), "pending", "the evidence is not overwritten before the check");

  const detail = await onAlarm(adapter, "tabspack-startup");
  assert.match(detail, /40 of 40 tabs not open/);
  const offer = await readOffer(adapter);
  assert.equal(offer?.missingTabs, 40);
  assert.equal(offer?.capturedAt, 1000);
  assert.equal(adapter.badges.at(-1)?.text, "↺");
  assert.equal((await adapter.storageGet({ [PENDING_KEY]: false }))[PENDING_KEY], false);

  const previous = await readPrevious(adapter, ON);
  assert.equal(previous?.missing.windows[0]?.tabs.length, 40);
  assert.deepEqual(previous?.missing.windows[0]?.tabs.map((t) => t.index).slice(0, 3), [0, 1, 2]);
});

test("a restart the browser restored itself offers nothing", async () => {
  const adapter = browserWith(40);
  await writeRecovery(adapter, ON, 1000);
  setTabs(adapter, 40);
  assert.equal(await beginStartup(adapter, ON), true);
  assert.equal(await checkStartup(adapter, ON), null);
  assert.equal(await readOffer(adapter), null);
});

test("with the copy off, a start sets nothing aside", async () => {
  const adapter = browserWith(3);
  await writeRecovery(adapter, ON, 1000);
  assert.equal(await beginStartup(adapter, OFF), false);
  assert.deepEqual(await readRecent(adapter), []);
  assert.equal((await adapter.storageGet({ [OFFER_KEY]: null as unknown }))[OFFER_KEY], null);
});

test("automatic snapshots are written only when the tabs changed", async () => {
  const adapter = browserWith(5);
  assert.equal((await runAutoSnapshot(adapter, ON, 1000)).outcome, "written");
  assert.equal((await runAutoSnapshot(adapter, ON, 2000)).outcome, "unchanged");
  setTabs(adapter, 6);
  assert.equal((await runAutoSnapshot(adapter, ON, 3000)).outcome, "written");
  const list = await listSnapshots(adapter);
  assert.equal(list.length, 2);
  assert.ok(list.every((meta) => meta.tags.includes(AUTO_TAG)));
});

test("the rolling limit removes the oldest automatic snapshots and never a manual one", async () => {
  const adapter = browserWith(2);
  const collected = await import("../../src/core/collect.js");
  const manual = await collected.collectSession(adapter, { scope: "all_windows", includeIncognito: false });
  await saveSnapshot(adapter, manual, { name: "Mine", now: new Date(500) });
  for (let run = 0; run < 5; run += 1) {
    setTabs(adapter, 3 + run);
    await runAutoSnapshot(adapter, ON, 1000 * (run + 1));
  }
  const list = await listSnapshots(adapter);
  const autos = list.filter((meta) => meta.tags.includes(AUTO_TAG));
  assert.equal(autos.length, ON.autoSnapshotKeep);
  assert.ok(list.some((meta) => meta.name === "Mine"), "the manual snapshot survives");
  assert.deepEqual(autos.map((meta) => meta.counts.tabs), [7, 6, 5], "the newest are the ones kept");
  assert.equal((await readAutoState(adapter)).removed, 2);
});

test("naming an automatic snapshot takes it out of the series", async () => {
  const adapter = browserWith(2);
  await runAutoSnapshot(adapter, ON, 1000);
  const [auto] = await listSnapshots(adapter);
  await renameSnapshot(adapter, auto?.id ?? "", "Keep this");
  const [renamed] = await listSnapshots(adapter);
  assert.equal(renamed?.tags.includes(AUTO_TAG), false);
});

test("alarms follow the settings", async () => {
  const adapter = browserWith(1);
  await reconcileAlarms(adapter, ON);
  assert.equal(adapter.alarms.get(ALARM_AUTO)?.periodInMinutes, 60);
  await reconcileAlarms(adapter, { ...ON, autoSnapshotHours: 24 });
  assert.equal(adapter.alarms.get(ALARM_AUTO)?.periodInMinutes, 1440);
  await scheduleRecovery(adapter, ON);
  await reconcileAlarms(adapter, { ...OFF, autoSnapshotHours: 0 });
  assert.equal(adapter.alarms.size, 0);
});

test("a new browser session is noticed by the first tab event, even if onStartup never fires", async () => {
  const adapter = browserWith(30);
  adapter.sessionStore.tabspackBoot = 1;
  await writeRecovery(adapter, ON, 1000);
  // Restart: session storage is emptied, the tabs are gone, and onStartup is silent.
  adapter.sessionStore = {};
  adapter.state.windows = [window_({ id: 5, tabs: [tab({ id: 500, url: "chrome://newtab/" })] })];
  await onTabsChanged(adapter, { closing: false });
  assert.equal((await adapter.storageGet({ [PENDING_KEY]: false }))[PENDING_KEY], true, "the copy was set aside");
  assert.ok(adapter.alarms.has("tabspack-startup"));
  await onTabsChanged(adapter, { closing: false });
  assert.match(await onAlarm(adapter, "tabspack-startup"), /30 of 30 tabs not open/);
  // A second event in the same session does not set it aside again.
  await adapter.storageRemove([PENDING_KEY]);
  await onTabsChanged(adapter, { closing: false });
  assert.equal((await adapter.storageGet({ [PENDING_KEY]: false }))[PENDING_KEY], false);
});

/* Recent sessions, B-104 ---------------------------------------------------- */

test("each browser start adds the session that ended to the recent sessions, newest first", async () => {
  const adapter = browserWith(3);
  await writeRecovery(adapter, ON, 1000);
  await beginStartup(adapter, ON);
  await adapter.storageRemove([PENDING_KEY]);
  setTabs(adapter, 5, "b");
  await writeRecovery(adapter, ON, 2000);
  await beginStartup(adapter, ON);
  const recent = await readRecent(adapter);
  assert.deepEqual(recent.map((entry) => [entry.capturedAt, entry.tabs]), [[2000, 5], [1000, 3]]);
});

test("a start with no tab changed since the last one adds nothing new", async () => {
  const adapter = browserWith(3);
  await writeRecovery(adapter, ON, 1000);
  await beginStartup(adapter, ON);
  await beginStartup(adapter, ON);
  assert.equal((await readRecent(adapter)).length, 1);
});

test("the list keeps the newest five, and the same tabs twice are one entry", () => {
  const record = (at: number, signature = `s${at}`) => ({ capturedAt: at, signature, windows: 1, tabs: 1, text: "" });
  let list: ReturnType<typeof rollRecent> = [];
  for (let at = 1; at <= 7; at += 1) list = rollRecent(list, record(at));
  assert.equal(RECENT_KEEP, 5);
  assert.deepEqual(list.map((entry) => entry.capturedAt), [7, 6, 5, 4, 3]);
  list = rollRecent(list, record(8, "s5"));
  assert.deepEqual(list.map((entry) => entry.capturedAt), [8, 7, 6, 4, 3]);
});

test("keeping a recent session makes it a snapshot and takes it out of the rolling list", async () => {
  const adapter = browserWith(4);
  await writeRecovery(adapter, ON, 1000);
  await beginStartup(adapter, ON);
  const meta = await keepRecent(adapter, 1000, "Session until 1 Jan");
  assert.equal(meta?.name, "Session until 1 Jan");
  assert.equal(meta?.counts.tabs, 4);
  assert.deepEqual((await listSnapshots(adapter)).map((entry) => entry.name), ["Session until 1 Jan"]);
  assert.deepEqual(await readRecent(adapter), []);
});

test("a recent session can be deleted on its own", async () => {
  const adapter = browserWith(2);
  await writeRecovery(adapter, ON, 1000);
  await beginStartup(adapter, ON);
  await deleteRecent(adapter, 1000);
  assert.deepEqual(await readRecent(adapter), []);
});
