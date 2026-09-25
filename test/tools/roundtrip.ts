/**
 * The round trip harness, task T-209, defined in docs/TESTING.md.
 *
 * Export a known browser state, import the file, restore it into a fresh
 * browser, export again, and compare the two files field by field. This is the
 * product's central claim expressed as an assertion; the real browser half runs
 * in `scripts/smoke.mjs`, and this half runs on every commit.
 *
 * The comparison ignores exactly what docs/TESTING.md says it ignores, and every
 * other exception is named in `IGNORED_TAB_FIELDS` with the reason a browser
 * makes it unavoidable.
 */
import { buildExport } from "../../src/core/export.js";
import { loadPack } from "../../src/core/import.js";
import { DEFAULT_RESTORE_POLICY, restoreSession, type RestoreReport } from "../../src/core/restore.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import { createFakeAdapter, type FakeState } from "./fake-adapter.js";
import type { Scenario } from "./scenarios.js";

/** Not compared at the top level. The first three are the ones TESTING.md names. */
const IGNORED_FILE_FIELDS = new Set(["exportedAt", "source", "counts"]);

/**
 * Not compared on a tab, each because the browser cannot report it after a
 * restore rather than because TabsPack loses it:
 *
 *   favIconUrl    a tab that has not rendered has no icon yet
 *   lastAccessed  the browser stamps it with the moment of the restore
 *   discarded     depends on the discard threshold in force, not on the file
 *   cookieStoreId only Gecko has containers, and the fake browser has none
 *   title         a title belongs to the loaded page, and `tabs.create` has no
 *                 way to set one on Chromium at all. A real browser fills it in
 *                 once the tab loads; Gecko accepts it for an unloaded tab, which
 *                 the Gecko case in the round trip test asserts separately
 */
const IGNORED_TAB_FIELDS = new Set([
  "favIconUrl",
  "lastAccessed",
  "discarded",
  "cookieStoreId",
  "title",
]);

const WHEN = new Date("2026-09-24T08:29:40Z");

export interface RoundTripOutcome {
  original: string;
  reexported: string;
  report: RestoreReport;
  differences: string[];
}

export interface RoundTripOptions {
  scenario: Scenario;
  /** The browser the pack is restored into. Defaults to an empty one. */
  target?: Partial<FakeState>;
  discardThreshold?: number;
}

export async function roundTrip(options: RoundTripOptions): Promise<RoundTripOutcome> {
  const settings = { ...DEFAULT_SETTINGS, dedupe: false, keepFavicons: false };

  const source = createFakeAdapter(options.scenario);
  const first = await buildExport(source, settings, { now: WHEN });

  const loaded = loadPack(first.text, { now: WHEN.getTime() });
  if (!loaded.session) {
    return {
      original: first.text,
      reexported: "",
      report: emptyReport(),
      differences: [`the exported file did not load: ${loaded.issues[0]?.message ?? "unknown"}`],
    };
  }

  const target = createFakeAdapter({ windows: [], groups: [], ...options.target });
  const report = await restoreSession(target, loaded.session, {
    ...DEFAULT_RESTORE_POLICY,
    skipDuplicates: false,
    openPlaceholder: false,
    // The harness compares what came back, so it restores the way the file says
    // rather than the way the product prefers: unloading is a policy, not a
    // property of the pack. TESTING Table X3.
    unloadRestored: false,
    discardThreshold: options.discardThreshold ?? DEFAULT_RESTORE_POLICY.discardThreshold,
    sleep: async () => undefined,
    now: () => WHEN.getTime(),
  });

  const second = await buildExport(target, settings, { now: WHEN });
  const differences = compare(first.text, second.text, report);
  return { original: first.text, reexported: second.text, report, differences };
}

interface FileShape {
  [key: string]: unknown;
  windows?: WindowShape[];
}
interface WindowShape {
  [key: string]: unknown;
  tabs?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
}

/**
 * Field by field, with the two documented exceptions from docs/TESTING.md: a tab
 * whose address no extension may open is absent from the second file, and group
 * ids may be renumbered as long as membership and metadata match.
 */
export function compare(originalText: string, reexportedText: string, report: RestoreReport): string[] {
  const differences: string[] = [];
  const before = JSON.parse(originalText) as FileShape;
  const after = JSON.parse(reexportedText) as FileShape;

  for (const key of Object.keys(before)) {
    if (IGNORED_FILE_FIELDS.has(key) || key === "windows") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      differences.push(`$.${key}: ${JSON.stringify(before[key])} became ${JSON.stringify(after[key])}`);
    }
  }

  const unopenable = new Set(report.unopenable.map((entry) => entry.url));
  const expected: WindowShape[] = (before.windows ?? [])
    .map((win) => ({
      ...win,
      tabs: (win.tabs ?? []).filter((tab) => !unopenable.has(String(tab["url"]))),
    }))
    .filter((win) => (win.tabs ?? []).length > 0);
  const actual = after.windows ?? [];

  if (expected.length !== actual.length) {
    differences.push(`$.windows: ${expected.length} windows became ${actual.length}`);
    return differences;
  }

  expected.forEach((win, index) => {
    const other = actual[index] as WindowShape;
    // A window that is not in its normal state has no bounds of its own: the
    // window manager decides where a maximized or fullscreen window sits, and
    // `windows.create` refuses bounds and a state in the same call. Recorded in
    // docs/LIMITATIONS.md Table L2.
    const compared =
      win["state"] === undefined || win["state"] === "normal"
        ? ["id", "name", "focused", "incognito", "type", "state", "bounds"]
        : ["id", "name", "focused", "incognito", "type", "state"];
    for (const key of compared) {
      // An absent `type` or `state` means normal, per docs/SPEC.md section 4, so
      // the two spellings of the same thing are not a difference.
      const mine = defaulted(key, win[key]);
      const theirs = defaulted(key, other[key]);
      if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
        differences.push(
          `$.windows[${index}].${key}: ${JSON.stringify(mine)} became ${JSON.stringify(theirs)}`,
        );
      }
    }

    const expectedTabs = win.tabs ?? [];
    const actualTabs = other.tabs ?? [];
    if (expectedTabs.length !== actualTabs.length) {
      differences.push(
        `$.windows[${index}].tabs: ${expectedTabs.length} tabs became ${actualTabs.length}`,
      );
      return;
    }

    expectedTabs.forEach((tab, position) => {
      const otherTab = actualTabs[position] as Record<string, unknown>;
      const keys = new Set([...Object.keys(tab), ...Object.keys(otherTab)]);
      for (const key of keys) {
        if (IGNORED_TAB_FIELDS.has(key)) continue;
        if (key === "index") {
          if (otherTab["index"] !== position) {
            differences.push(`$.windows[${index}].tabs[${position}].index is ${String(otherTab["index"])}`);
          }
          continue;
        }
        if (key === "groupId") {
          const mine = groupOf(win, tab["groupId"]);
          const theirs = groupOf(other, otherTab["groupId"]);
          if (mine !== theirs) {
            differences.push(
              `$.windows[${index}].tabs[${position}].groupId: group ${mine} became group ${theirs}`,
            );
          }
          continue;
        }
        if (JSON.stringify(tab[key]) !== JSON.stringify(otherTab[key])) {
          differences.push(
            `$.windows[${index}].tabs[${position}].${key}: ${JSON.stringify(tab[key])} became ${JSON.stringify(otherTab[key])}`,
          );
        }
      }
    });
  });

  return differences;
}

function defaulted(key: string, value: unknown): unknown {
  if ((key === "type" || key === "state") && value === undefined) return "normal";
  return value;
}

/** A group's identity for comparison: what it looks like, never its id. */
function groupOf(win: WindowShape, groupId: unknown): string {
  if (typeof groupId !== "string") return "none";
  const group = (win.groups ?? []).find((candidate) => candidate["id"] === groupId);
  if (!group) return `missing:${groupId}`;
  return JSON.stringify({
    title: group["title"] ?? "",
    color: group["color"] ?? "",
    collapsed: group["collapsed"] === true,
  });
}

function emptyReport(): RestoreReport {
  return {
    ok: false,
    windows: 0,
    selected: 0,
    restored: 0,
    duplicates: 0,
    unopenable: [],
    ungrouped: 0,
    groups: 0,
    discarded: 0,
    placeholderOpened: false,
    ms: 0,
    issues: [],
  };
}
