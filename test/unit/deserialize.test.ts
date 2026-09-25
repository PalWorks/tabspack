/**
 * T-202. Reading a file is where a reader either keeps the user's data or quietly
 * loses part of it. Every recovery in here is reported, because an adjustment the
 * user is not told about is indistinguishable from a bug.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fromFile } from "../../src/core/deserialize.js";
import { loadPack } from "../../src/core/import.js";
import type { TabsPackFile } from "../../src/types/tabspack.js";

const NOW = Date.parse("2026-09-24T08:29:40Z");

function file(partial: Record<string, unknown>): TabsPackFile {
  return {
    format: "tabspack",
    schemaVersion: 1,
    exportedAt: "2026-09-24T08:29:40+00:00",
    ...partial,
  } as unknown as TabsPackFile;
}

function read(dir: string, name: string): string {
  return readFileSync(path.join(process.cwd(), "test", "fixtures", dir, name), "utf8");
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

test("unknown fields are kept on the object they were found on", () => {
  const { session } = fromFile(
    file({
      futureTopLevel: { written: "later" },
      windows: [
        {
          id: "w1",
          futureWindowField: 42,
          groups: [{ id: "g1", title: "Work", futureGroupField: true }],
          tabs: [{ index: 0, url: "https://example.com/a", groupId: "g1", futureTabField: ["keep"] }],
        },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(session.unknown, { futureTopLevel: { written: "later" } });
  assert.deepEqual(session.windows[0]?.unknown, { futureWindowField: 42 });
  assert.deepEqual(session.windows[0]?.groups[0]?.unknown, { futureGroupField: true });
  assert.deepEqual(session.windows[0]?.tabs[0]?.unknown, { futureTabField: ["keep"] });
});

test("a group reference that points at nothing loses the reference, not the tab", () => {
  const { session, issues } = fromFile(
    JSON.parse(read("edge", "dangling-group-ref.tabspack.json")) as TabsPackFile,
    { now: NOW },
  );
  const tabs = session.windows[0]?.tabs ?? [];
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0]?.groupKey, "g1");
  assert.equal(tabs[1]?.groupKey, undefined);
  assert.ok(codes(issues).includes("tab.group_missing"));
});

test("the first active tab wins and the rest are reported", () => {
  const { session, issues } = fromFile(
    JSON.parse(read("edge", "two-active-tabs.tabspack.json")) as TabsPackFile,
    { now: NOW },
  );
  const active = (session.windows[0]?.tabs ?? []).filter((tab) => tab.active);
  assert.equal(active.length, 1);
  assert.ok(codes(issues).includes("tab.second_active"));
});

test("duplicate indices fall back to the order in the file", () => {
  const { session, issues } = fromFile(
    JSON.parse(read("edge", "duplicate-index.tabspack.json")) as TabsPackFile,
    { now: NOW },
  );
  assert.deepEqual(
    (session.windows[0]?.tabs ?? []).map((tab) => tab.url),
    ["https://example.com/a", "https://example.com/b"],
  );
  assert.ok(codes(issues).includes("tab.index_duplicate"));
});

test("an index that is not a whole number falls back to the order in the file", () => {
  const { session, issues } = fromFile(
    JSON.parse(read("invalid", "index-not-integer.json")) as TabsPackFile,
    { now: NOW },
  );
  assert.ok((session.windows[0]?.tabs.length ?? 0) > 0);
  assert.ok(codes(issues).includes("tab.index_unusable"));
});

test("tabs are put in index order when the indices are usable", () => {
  const { session } = fromFile(
    file({
      windows: [
        {
          tabs: [
            { index: 2, url: "https://example.com/c" },
            { index: 0, url: "https://example.com/a" },
            { index: 1, url: "https://example.com/b" },
          ],
        },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(
    (session.windows[0]?.tabs ?? []).map((tab) => tab.url),
    ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
  );
});

test("an unknown group colour becomes grey and says so", () => {
  const { session, issues } = fromFile(
    JSON.parse(read("invalid", "unknown-group-color.json")) as TabsPackFile,
    { now: NOW },
  );
  assert.equal(session.windows[0]?.groups[0]?.color, "grey");
  assert.ok(codes(issues).includes("group.color_unknown"));
});

test("the group title shorthand creates or reuses a group", () => {
  const result = loadPack(read("valid", "group-shorthand.tabspack.json"), { now: NOW });
  const win = result.session?.windows[0];
  assert.equal(win?.groups.length, 2, "one declared group plus one created from a title");
  assert.equal(win?.tabs[0]?.groupKey, "g1");
  assert.equal(win?.tabs[1]?.groupKey, "g1", "a title naming a declared group reuses it");
  assert.equal(win?.tabs[2]?.groupKey, "g2");
  assert.equal(win?.groups[1]?.title, "Later");
});

test("opener references are remapped onto the new positions", () => {
  const { session } = fromFile(
    file({
      windows: [
        {
          tabs: [
            { index: 1, url: "https://example.com/child", openerIndex: 0 },
            { index: 0, url: "https://example.com/parent" },
          ],
        },
      ],
    }),
    { now: NOW },
  );
  const tabs = session.windows[0]?.tabs ?? [];
  assert.equal(tabs[0]?.url, "https://example.com/parent");
  assert.equal(tabs[1]?.openerIndex, 0);
});

test("an opener that is not in the window is dropped and reported", () => {
  const { session, issues } = fromFile(
    file({ windows: [{ tabs: [{ index: 0, url: "https://example.com/a", openerIndex: 7 }] }] }),
    { now: NOW },
  );
  assert.equal(session.windows[0]?.tabs[0]?.openerIndex, null);
  assert.ok(codes(issues).includes("tab.opener_missing"));
});

test("counts that disagree with the arrays warn and are ignored", () => {
  const { issues } = fromFile(
    file({ counts: { windows: 1, tabs: 9, groups: 0 }, windows: [{ tabs: [{ url: "https://example.com/" }] }] }),
    { now: NOW },
  );
  const mismatch = issues.find((issue) => issue.code === "counts.mismatch");
  assert.match(mismatch?.message ?? "", /says it holds 9 tabs and it actually holds 1/);
});

test("the same problem on many objects is collapsed into one line", () => {
  const tabs = Array.from({ length: 30 }, (_, index) => ({
    url: `https://example.com/${index}`,
    groupId: "missing",
  }));
  const { issues } = fromFile(file({ windows: [{ tabs }] }), { now: NOW });
  const summary = issues.find((issue) => issue.code === "tab.group_missing.more");
  assert.match(summary?.message ?? "", /appears on 30 objects/);
  assert.ok(issues.length < 10);
});

test("a window with no tabs array is dropped rather than crashing the reader", () => {
  const { session } = fromFile(file({ windows: [{ id: "w1" }] }), { now: NOW });
  assert.equal(session.windows[0]?.tabs.length, 0);
});

test("the export time is kept exactly as the file spelled it", () => {
  const { session } = fromFile(
    file({ exportedAt: "2026-09-24T13:59:40+05:30", windows: [{ tabs: [{ url: "https://example.com/" }] }] }),
    { now: NOW },
  );
  assert.equal(session.exportedAtText, "2026-09-24T13:59:40+05:30");
  assert.equal(session.capturedAt, Date.parse("2026-09-24T13:59:40+05:30"));
});

test("two windows sharing an id are kept apart, because selection addresses tabs by it", () => {
  const { session, issues } = fromFile(
    file({
      windows: [
        { id: "w1", tabs: [{ url: "https://example.com/a" }] },
        { id: "w1", tabs: [{ url: "https://example.com/b" }] },
      ],
    }),
    { now: NOW },
  );
  assert.deepEqual(
    session.windows.map((win) => win.key),
    ["w1", "w1-2"],
  );
  assert.ok(codes(issues).includes("window.duplicate_id"));
});
