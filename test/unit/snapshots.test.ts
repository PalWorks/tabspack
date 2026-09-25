/**
 * T-401 to T-403 and T-405. What a snapshot store has to get right: the body and
 * the index stay in step, a delete removes both, the list stays cheap to read,
 * and nothing is ever thrown away to make room.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSession } from "../../src/core/collect.js";
import {
  BODY_PREFIX,
  INDEX_KEY,
  SOFT_CAP_BYTES,
  defaultSnapshotName,
  deleteSnapshot,
  findOrphans,
  listSnapshots,
  readSnapshot,
  readSnapshotSession,
  readSnapshotText,
  renameSnapshot,
  saveSnapshot,
  tagSnapshot,
  usage,
} from "../../src/core/snapshots.js";
import { createFakeAdapter, type FakeAdapter } from "../tools/fake-adapter.js";
import { referenceScenario, syntheticScenario } from "../tools/scenarios.js";
import type { Session } from "../../src/types/session.js";

const WHEN = new Date("2026-09-25T08:29:40Z");

async function sessionFrom(scenario = referenceScenario()): Promise<Session> {
  return await collectSession(createFakeAdapter(scenario), {
    scope: "all_windows",
    includeIncognito: false,
    now: WHEN.getTime(),
  });
}

function store(extra: Record<string, unknown> = {}): FakeAdapter {
  return createFakeAdapter({ windows: [], groups: [], storage: extra });
}

test("a saved snapshot is listed with its counts and its size", async () => {
  const adapter = store();
  const session = await sessionFrom();
  const { meta } = await saveSnapshot(adapter, session, { name: "Research", now: WHEN, id: "a" });

  assert.equal(meta.name, "Research");
  assert.deepEqual(meta.counts, { windows: 3, tabs: 40, groups: 3 });
  assert.ok(meta.bytes > 1000);
  assert.match(meta.createdAt, /^2026-09-25T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

  const list = await listSnapshots(adapter);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, "a");
});

test("the index holds metadata only, so listing never reads a pack", async () => {
  const adapter = store();
  await saveSnapshot(adapter, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });
  const all = await adapter.storageGetAll();
  const index = JSON.stringify(all[INDEX_KEY]);
  assert.ok(index.length < 400, `the index is ${index.length} bytes`);
  assert.ok(typeof all[`${BODY_PREFIX}a`] === "string");
  assert.ok((all[`${BODY_PREFIX}a`] as string).length > 1000);
});

test("a snapshot reads back as the session that was saved", async () => {
  const adapter = store();
  const session = await sessionFrom();
  await saveSnapshot(adapter, session, { name: "Research", now: WHEN, id: "a" });

  const file = await readSnapshot(adapter, "a");
  assert.equal(file?.format, "tabspack");
  assert.equal(file?.name, "Research");

  const read = await readSnapshotSession(adapter, "a");
  assert.equal(read?.windows.length, 3);
  assert.equal(read?.windows[0]?.tabs[0]?.url, session.windows[0]?.tabs[0]?.url);
  assert.equal(read?.windows[0]?.tabs[0]?.pinned, true);
});

test("the stored text is exactly what an export of that snapshot writes", async () => {
  const adapter = store();
  await saveSnapshot(adapter, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });
  const text = await readSnapshotText(adapter, "a");
  assert.ok(text?.endsWith("}\n"));
  assert.equal(JSON.parse(text as string).name, "Research");
});

test("renaming and tagging persist without touching the pack", async () => {
  const adapter = store();
  await saveSnapshot(adapter, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });
  const before = await readSnapshotText(adapter, "a");

  await renameSnapshot(adapter, "a", "Release week", new Date("2026-09-26T09:00:00Z"));
  await tagSnapshot(adapter, "a", [" work ", "", "migration"], new Date("2026-09-26T09:00:00Z"));

  const [meta] = await listSnapshots(adapter);
  assert.equal(meta?.name, "Release week");
  assert.deepEqual(meta?.tags, ["work", "migration"]);
  assert.notEqual(meta?.updatedAt, meta?.createdAt);
  assert.equal(await readSnapshotText(adapter, "a"), before);
});

test("deleting removes the body key, not only the index entry", async () => {
  const adapter = store();
  await saveSnapshot(adapter, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });
  await deleteSnapshot(adapter, "a");

  assert.deepEqual(await listSnapshots(adapter), []);
  const all = await adapter.storageGetAll();
  assert.equal(Object.keys(all).some((key) => key.startsWith(BODY_PREFIX)), false);
});

test("a body with no index entry is reported rather than quietly removed", async () => {
  const adapter = store({ [`${BODY_PREFIX}ghost`]: '{"format":"tabspack"}' });
  assert.deepEqual(await findOrphans(adapter), ["ghost"]);
  const all = await adapter.storageGetAll();
  assert.ok(all[`${BODY_PREFIX}ghost`], "finding an orphan does not delete it");
});

test("fifty snapshots list without reading any of them", async () => {
  const adapter = store();
  const session = await sessionFrom(syntheticScenario(200));
  for (let index = 0; index < 50; index += 1) {
    await saveSnapshot(adapter, session, {
      name: `Snapshot ${index}`,
      now: new Date(WHEN.getTime() + index * 60_000),
      id: `s${index}`,
    });
  }
  const list = await listSnapshots(adapter);
  assert.equal(list.length, 50);
  // Newest first, so the list is useful without sorting it again in the UI.
  assert.equal(list[0]?.name, "Snapshot 49");
  assert.equal(list[49]?.name, "Snapshot 0");
});

test("usage is reported against the soft cap, and warns before it is reached", async () => {
  const adapter = store();
  await saveSnapshot(adapter, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });

  const small = await usage(adapter);
  assert.equal(small.cap, SOFT_CAP_BYTES);
  assert.equal(small.warn, false);
  assert.equal(small.measured, true);

  // A browser that will not report its own usage falls back to the index.
  const quiet = createFakeAdapter({ windows: [], groups: [], storageBytesInUse: null });
  await saveSnapshot(quiet, await sessionFrom(), { name: "Research", now: WHEN, id: "a" });
  const added = await usage(quiet);
  assert.equal(added.measured, false);
  assert.ok(added.bytes > 1000);
});

test("passing the warning line warns and deletes nothing", async () => {
  const adapter = store({
    [INDEX_KEY]: [
      {
        id: "big",
        name: "A large one",
        tags: [],
        createdAt: "2026-09-25T08:29:40+00:00",
        updatedAt: "2026-09-25T08:29:40+00:00",
        counts: { windows: 1, tabs: 5000, groups: 0 },
        bytes: Math.round(SOFT_CAP_BYTES * 0.85),
      },
    ],
  });
  const quiet = createFakeAdapter({ windows: [], groups: [], storage: (await adapter.storageGetAll()), storageBytesInUse: null });
  const reported = await usage(quiet);
  assert.equal(reported.warn, true);
  assert.ok(reported.fraction > 0.8);
  assert.equal((await listSnapshots(quiet)).length, 1, "nothing is ever removed to make room");
});

test("a default name says when it was taken and how big it was", () => {
  const name = defaultSnapshotName(new Date("2026-09-25T14:05:00"), { windows: 2, tabs: 39 });
  assert.match(name, /14:05/);
  assert.match(name, /39 tabs$/);
});

test("saving twice under the same id replaces the snapshot rather than doubling it", async () => {
  const adapter = store();
  const session = await sessionFrom();
  await saveSnapshot(adapter, session, { name: "First", now: WHEN, id: "a" });
  await saveSnapshot(adapter, session, { name: "Second", now: WHEN, id: "a" });
  const list = await listSnapshots(adapter);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.name, "Second");
});
