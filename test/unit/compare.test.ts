/**
 * M9: comparing sessions. The thresholds are tested on both sides, because an
 * offer that appears after an ordinary restart is as much a defect as one that
 * does not appear after a crash.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOSS_MIN_TABS,
  combine,
  diffSessions,
  isEmptyDiff,
  lostTabs,
  overlap,
  sessionOfTabs,
  signature,
  tidyCandidates,
  worthOffering,
} from "../../src/core/compare.js";
import type { Session, SessionTab, SessionWindow } from "../../src/types/session.js";

function tabOf(url: string, extra: Partial<SessionTab> = {}): SessionTab {
  return {
    index: 0,
    url,
    title: url,
    pinned: false,
    active: false,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: null,
    ...extra,
  };
}

function win(key: string, urls: string[], extra: Partial<SessionWindow> = {}): SessionWindow {
  return {
    key,
    focused: false,
    incognito: false,
    type: "normal",
    groups: [],
    tabs: urls.map((url, index) => tabOf(url, { index })),
    ...extra,
  };
}

function session(...windows: SessionWindow[]): Session {
  return { windows, source: {}, capturedAt: 0 };
}

const urls = (count: number, prefix = "a"): string[] =>
  Array.from({ length: count }, (_, index) => `https://${prefix}.example/${index}`);

test("the signature ignores loading and activation, and sees order, pinning and grouping", () => {
  const base = session(win("w1", urls(4)));
  const same = session(win("w1", urls(4)));
  (same.windows[0] as SessionWindow).tabs[1] = { ...((same.windows[0] as SessionWindow).tabs[1] as SessionTab), active: true, discarded: true };
  assert.equal(signature(base), signature(same));

  const reordered = session(win("w1", [...urls(4)].reverse()));
  assert.notEqual(signature(base), signature(reordered));

  const pinned = session(win("w1", urls(4)));
  (pinned.windows[0] as SessionWindow).tabs[0] = { ...((pinned.windows[0] as SessionWindow).tabs[0] as SessionTab), pinned: true };
  assert.notEqual(signature(base), signature(pinned));

  const grouped = session(win("w1", urls(4), { groups: [{ key: "g1", title: "Work", color: "blue" }] }));
  (grouped.windows[0] as SessionWindow).tabs[2] = { ...((grouped.windows[0] as SessionWindow).tabs[2] as SessionTab), groupKey: "g1" };
  assert.notEqual(signature(base), signature(grouped));
});

test("a browser that restored everything lost nothing and is offered nothing", () => {
  const before = session(win("w1", urls(30)), win("w2", urls(5, "b")));
  const after = session(win("w1", urls(5, "b")), win("w2", urls(30)));
  const loss = lostTabs(before, after);
  assert.equal(loss.missingTabs, 0);
  assert.equal(worthOffering(loss), false);
});

test("the tab threshold is tested on both sides", () => {
  const before = session(win("w1", urls(40)));
  const justUnder = session(win("w1", urls(40).slice(LOSS_MIN_TABS - 1)));
  assert.equal(lostTabs(before, justUnder).missingTabs, LOSS_MIN_TABS - 1);
  assert.equal(worthOffering(lostTabs(before, justUnder)), false);
  const justAt = session(win("w1", urls(40).slice(LOSS_MIN_TABS)));
  assert.equal(worthOffering(lostTabs(before, justAt)), true);
});

test("ten tabs out of a thousand is not a fifth of the session", () => {
  const before = session(win("w1", urls(1000)));
  const after = session(win("w1", urls(1000).slice(12)));
  assert.equal(worthOffering(lostTabs(before, after)), false);
});

test("a whole window gone is always worth saying, if it had a few tabs", () => {
  const before = session(win("w1", urls(100)), win("w2", urls(3, "b")));
  const after = session(win("w1", urls(100)));
  const loss = lostTabs(before, after);
  assert.equal(loss.wholeWindows, 1);
  assert.equal(worthOffering(loss), true);
  const small = lostTabs(session(win("w1", urls(100)), win("w2", urls(2, "b"))), after);
  assert.equal(worthOffering(small), false);
});

test("two copies of a page are two tabs, and losing one is a loss", () => {
  const before = session(win("w1", ["https://x.example/", "https://x.example/"]));
  const after = session(win("w1", ["https://x.example/"]));
  assert.equal(lostTabs(before, after).missingTabs, 1);
});

test("a diff names what was added, removed, moved and regrouped", () => {
  const before = session(
    win("w1", ["https://a.example/", "https://b.example/", "https://c.example/"], { groups: [{ key: "g1", title: "R", color: "red" }] }),
    win("w2", ["https://d.example/"]),
  );
  (before.windows[0] as SessionWindow).tabs[2] = { ...((before.windows[0] as SessionWindow).tabs[2] as SessionTab), groupKey: "g1" };
  const after = session(win("w1", ["https://a.example/", "https://c.example/", "https://e.example/"]), win("w2", ["https://d.example/", "https://b.example/"]));
  const diff = diffSessions(before, after);
  assert.deepEqual(diff.added.map((t) => t.url), ["https://e.example/"]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.moved.map((t) => t.url), ["https://b.example/"]);
  assert.deepEqual(diff.regrouped.map((t) => t.url), ["https://c.example/"]);
  assert.equal(isEmptyDiff(diffSessions(after, after)), true);
  assert.deepEqual(diffSessions(after, before).removed.map((t) => t.url), ["https://e.example/"]);
});

test("tidy keeps the newest of each unchanged run", () => {
  const ordered = [
    { id: "1", signature: "a" },
    { id: "2", signature: "a" },
    { id: "3", signature: "a" },
    { id: "4", signature: "b" },
    { id: "5", signature: "a" },
  ];
  assert.deepEqual(tidyCandidates(ordered), ["1", "2"]);
  assert.deepEqual(tidyCandidates([]), []);
});

test("overlap counts snapshots, not tabs, and lists the most widespread first", () => {
  const shared = "https://shared.example/";
  const entries = [
    { id: "s1", session: session(win("w1", [shared, shared, "https://two.example/"])) },
    { id: "s2", session: session(win("w1", [shared, "https://two.example/"])) },
    { id: "s3", session: session(win("w1", [shared])) },
  ];
  const found = overlap(entries);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]?.snapshots, ["s1", "s2", "s3"]);
  assert.equal(overlap(entries, 2).length, 2);
});

test("combine keeps the newest one's windows and puts the rest in one extra window, each address once", () => {
  const newest = session(win("w1", ["https://a.example/", "https://b.example/"], { groups: [{ key: "g1", title: "G" }] }));
  (newest.windows[0] as SessionWindow).tabs[0] = { ...((newest.windows[0] as SessionWindow).tabs[0] as SessionTab), groupKey: "g1" };
  const older = session(win("w1", ["https://b.example/", "https://c.example/"]), win("w2", ["https://c.example/", "https://d.example/"]));
  const merged = combine([newest, older], "Combined", 5);
  assert.equal(merged.windows.length, 2);
  assert.deepEqual(merged.windows[0]?.tabs.map((t) => t.url), ["https://a.example/", "https://b.example/"]);
  assert.equal(merged.windows[0]?.groups.length, 1);
  assert.deepEqual(merged.windows[1]?.tabs.map((t) => [t.index, t.url, t.groupKey]), [
    [0, "https://c.example/", undefined],
    [1, "https://d.example/", undefined],
  ]);
  assert.equal(merged.name, "Combined");
});

test("a list of tabs becomes a one window session for the preview", () => {
  const made = sessionOfTabs([{ url: "https://a.example/", title: "A" }], "Removed", 1);
  assert.equal(made.windows[0]?.tabs[0]?.active, true);
  assert.equal(sessionOfTabs([], "Nothing").windows.length, 0);
});
