/**
 * B-202. Tab age, the bands, and the two exemptions that matter more than the
 * feature: a tab with no timestamp and a pinned tab are never called stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STALE_DAYS,
  STALE_WINDOWS,
  countStale,
  isStale,
  stalenessOf,
  worthReporting,
} from "../../src/core/staleness.js";
import { applyFilters } from "../../src/core/filters.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import type { Session, SessionTab } from "../../src/types/session.js";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const DAY = 86_400_000;
const OFF = { ...DEFAULT_SETTINGS, dedupe: false };

/** Age in days rather than a timestamp, because that is what the test is about. */
function tabOf(overrides: Partial<SessionTab> & { index: number; daysAgo?: number | null }): SessionTab {
  const { daysAgo, ...rest } = overrides;
  return {
    url: `https://example.com/${overrides.index}`,
    title: `tab ${overrides.index}`,
    pinned: false,
    active: false,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: daysAgo === undefined || daysAgo === null ? null : NOW - daysAgo * DAY,
    ...rest,
  };
}

function sessionOf(tabs: SessionTab[]): Session {
  return {
    windows: [{ key: "w1", focused: true, incognito: false, type: "normal", groups: [], tabs }],
    source: {},
    capturedAt: 0,
  };
}

test("bands count each tab once, in the window it belongs to", () => {
  const report = stalenessOf(
    sessionOf([
      tabOf({ index: 0, daysAgo: 0 }),
      tabOf({ index: 1, daysAgo: 3 }),
      tabOf({ index: 2, daysAgo: 20 }),
      tabOf({ index: 3, daysAgo: 60 }),
      tabOf({ index: 4, daysAgo: 400 }),
      tabOf({ index: 5, daysAgo: null }),
    ]),
    NOW,
  );
  assert.deepEqual(report.bands, { today: 1, week: 1, month: 1, quarter: 1, older: 1, unknown: 1 });
  assert.equal(report.total, 6);
  assert.equal(report.known, 5);
  assert.equal(report.oldest, NOW - 400 * DAY);
});

test("a band boundary belongs to the younger band", () => {
  // Exactly seven days is "this month", not "this week": the week band is
  // strictly under 7 days, so no tab can fall between two bands or into both.
  const report = stalenessOf(
    sessionOf([tabOf({ index: 0, daysAgo: 7 }), tabOf({ index: 1, daysAgo: 6.9 })]),
    NOW,
  );
  assert.equal(report.bands.week, 1);
  assert.equal(report.bands.month, 1);
});

test("a session with no timestamps at all reports unknown and nothing else", () => {
  const report = stalenessOf(sessionOf([tabOf({ index: 0 }), tabOf({ index: 1 })]), NOW);
  assert.equal(report.known, 0);
  assert.equal(report.bands.unknown, 2);
  assert.equal(report.oldest, null);
  assert.equal(worthReporting(report), false, "nothing to say when nothing is known");
});

test("nothing is said when every tab is recent", () => {
  const report = stalenessOf(
    sessionOf([tabOf({ index: 0, daysAgo: 0 }), tabOf({ index: 1, daysAgo: 4 })]),
    NOW,
  );
  assert.equal(worthReporting(report), false);
});

test("something is said as soon as one tab is a month old", () => {
  const report = stalenessOf(
    sessionOf([tabOf({ index: 0, daysAgo: 0 }), tabOf({ index: 1, daysAgo: 29 })]),
    NOW,
  );
  assert.equal(worthReporting(report), true);
});

test("a tab with no timestamp is never stale, at any window", () => {
  const tab = tabOf({ index: 0 });
  for (const days of STALE_WINDOWS) {
    assert.equal(isStale(tab, days, NOW), false, `${days} days`);
  }
});

test("a pinned tab is never stale, however old", () => {
  const tab = tabOf({ index: 0, pinned: true, daysAgo: 2000 });
  assert.equal(isStale(tab, 30, NOW), false);
});

test("the window is exclusive: a tab exactly at the boundary is kept", () => {
  assert.equal(isStale(tabOf({ index: 0, daysAgo: 90 }), 90, NOW), false);
  assert.equal(isStale(tabOf({ index: 0, daysAgo: 90.5 }), 90, NOW), true);
});

test("a window of zero is off and drops nothing", () => {
  assert.equal(isStale(tabOf({ index: 0, daysAgo: 5000 }), 0, NOW), false);
  assert.equal(countStale(sessionOf([tabOf({ index: 0, daysAgo: 5000 })]), 0, NOW), 0);
});

test("countStale agrees with what the filter removes", () => {
  const session = sessionOf([
    tabOf({ index: 0, daysAgo: 1 }),
    tabOf({ index: 1, daysAgo: 200 }),
    tabOf({ index: 2, daysAgo: 300 }),
    tabOf({ index: 3, daysAgo: 400, pinned: true }),
    tabOf({ index: 4, daysAgo: null }),
  ]);
  const predicted = countStale(session, DEFAULT_STALE_DAYS, NOW);
  const filtered = applyFilters(session, { ...OFF, staleDays: DEFAULT_STALE_DAYS }, { now: NOW });
  assert.equal(predicted, 2, "two stale, the pinned and the undated one exempt");
  assert.equal(filtered.removed.stale, predicted, "the report must promise what the filter does");
  assert.equal(filtered.session.windows[0]?.tabs.length, 3);
});

test("the filter keeps the pinned and the undated tab it was told to drop around", () => {
  const filtered = applyFilters(
    sessionOf([
      tabOf({ index: 0, daysAgo: 999, pinned: true }),
      tabOf({ index: 1, daysAgo: null }),
      tabOf({ index: 2, daysAgo: 999 }),
    ]),
    { ...OFF, staleDays: 30 },
    { now: NOW },
  );
  const urls = filtered.session.windows[0]?.tabs.map((tab) => tab.url) ?? [];
  assert.deepEqual(urls, ["https://example.com/0", "https://example.com/1"]);
  assert.equal(filtered.removed.stale, 1);
});

test("a stale duplicate is counted once, as stale, because staleness runs first", () => {
  const filtered = applyFilters(
    sessionOf([
      tabOf({ index: 0, url: "https://example.com/same", daysAgo: 400 }),
      tabOf({ index: 1, url: "https://example.com/same", daysAgo: 400 }),
    ]),
    { ...DEFAULT_SETTINGS, dedupe: true, staleDays: 90 },
    { now: NOW },
  );
  assert.equal(filtered.removed.stale, 2);
  assert.equal(filtered.removed.duplicate, 0, "both were gone before dedupe looked");
  assert.equal(filtered.session.windows.length, 0);
});

test("staleness composes with the other filters without double counting", () => {
  const filtered = applyFilters(
    sessionOf([
      tabOf({ index: 0, url: "chrome://settings/", daysAgo: 400 }),
      tabOf({ index: 1, url: "https://example.com/old", daysAgo: 400 }),
      tabOf({ index: 2, url: "https://example.com/new", daysAgo: 1 }),
    ]),
    { ...OFF, webPagesOnly: true, staleDays: 90 },
    { now: NOW },
  );
  // The chrome:// tab was dropped by the scheme filter, so it is not also
  // counted as stale even though it is.
  assert.equal(filtered.removed.scheme, 1);
  assert.equal(filtered.removed.stale, 1);
  assert.equal(filtered.session.windows[0]?.tabs.length, 1);
});

test("the default is off, so a first run removes nothing", () => {
  assert.equal(DEFAULT_SETTINGS.staleDays, 0);
});

test("the offered windows are the ones the interface shows", () => {
  assert.deepEqual([...STALE_WINDOWS], [30, 90, 180, 365]);
  assert.ok(STALE_WINDOWS.includes(DEFAULT_STALE_DAYS as (typeof STALE_WINDOWS)[number]));
});
