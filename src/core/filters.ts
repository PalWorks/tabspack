/**
 * The filter pipeline. Pure, and applied in one fixed order so that a count in
 * the report always means the same thing:
 *
 *   1. web pages only   drop anything that is not http or https
 *   2. skip pinned      drop pinned tabs
 *   3. stale            drop tabs not opened within a chosen window
 *   4. exclude list     drop URLs matching a wildcard pattern
 *   5. dedupe           keep the first occurrence of a URL across the session
 *   6. sort             within a window, pinned tabs first, then the sort mode
 *
 * Staleness sits with the other two intrinsic properties of a tab, its scheme
 * and its pinned state, rather than with the exclude list, which is a pattern
 * somebody typed. It runs before dedupe so that a stale duplicate is counted
 * once, as stale, which is the reason it was dropped.
 *
 * Sorting runs last and partitions on `pinned`, because restoring a tab before
 * the pinned tabs exist puts it in the wrong place: see docs/DOMAIN.md.
 */
import type { Session, SessionTab, SessionWindow } from "../types/session.js";
import type { Settings, SortMode } from "./settings.js";
import { isStale } from "./staleness.js";

export interface FilterCounts {
  scheme: number;
  pinned: number;
  /** Not opened within `staleDays`. B-202. */
  stale: number;
  excluded: number;
  duplicate: number;
  /** Unticked by the user in the export preview. Applied after every filter. */
  unticked: number;
}

export interface FilterResult {
  session: Session;
  removed: FilterCounts;
}

export type FilterSettings = Pick<
  Settings,
  "dedupe" | "webPagesOnly" | "skipPinned" | "staleDays" | "excludeList" | "sort" | "sortDesc"
>;

export interface FilterOptions {
  /** Overrides the clock, which only the staleness step reads. Tests fix it. */
  now?: number;
}

export function applyFilters(
  session: Session,
  settings: FilterSettings,
  options: FilterOptions = {},
): FilterResult {
  const now = options.now ?? Date.now();
  const removed: FilterCounts = { scheme: 0, pinned: 0, stale: 0, excluded: 0, duplicate: 0, unticked: 0 };
  const patterns = compileExcludeList(settings.excludeList);
  const seen = new Set<string>();

  const windows: SessionWindow[] = [];
  for (const win of session.windows) {
    let tabs = win.tabs;

    if (settings.webPagesOnly) {
      const before = tabs.length;
      tabs = tabs.filter((tab) => /^https?:\/\//i.test(tab.url));
      removed.scheme += before - tabs.length;
    }
    if (settings.skipPinned) {
      const before = tabs.length;
      tabs = tabs.filter((tab) => !tab.pinned);
      removed.pinned += before - tabs.length;
    }
    /*
     * `isStale` is the single place that decides, and it exempts a pinned tab
     * and a tab with no timestamp. Neither exemption is repeated here, so there
     * is one answer to "is this tab old" in the product.
     */
    if (settings.staleDays > 0) {
      const before = tabs.length;
      tabs = tabs.filter((tab) => !isStale(tab, settings.staleDays, now));
      removed.stale += before - tabs.length;
    }
    if (patterns.length > 0) {
      const before = tabs.length;
      tabs = tabs.filter((tab) => !patterns.some((pattern) => pattern.test(tab.url)));
      removed.excluded += before - tabs.length;
    }
    if (settings.dedupe) {
      const before = tabs.length;
      tabs = tabs.filter((tab) => {
        const key = dedupeKey(tab.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      removed.duplicate += before - tabs.length;
    }

    tabs = sortTabs(tabs, settings.sort, settings.sortDesc);
    if (tabs.length === 0) continue;
    windows.push(reindexWindow(win, tabs));
  }

  return { session: { ...session, windows }, removed };
}

/**
 * What a tab is called across two collections of the same browser: its window,
 * its address, and which copy of that address it is in the window. Not its
 * index, which a sort or a newly opened tab changes. The export preview stores
 * the tabs a user unticked under this name, and the export, which collects the
 * tabs again, leaves out exactly those.
 *
 * If a tab cannot be matched, because its window closed or it navigated away,
 * it is exported: a tab the user did not see unticked is never dropped.
 */
export function tabIdentities(win: SessionWindow): string[] {
  const seen = new Map<string, number>();
  return win.tabs.map((tab) => {
    const copy = seen.get(tab.url) ?? 0;
    seen.set(tab.url, copy + 1);
    return `${win.key}\u0000${tab.url}\u0000${copy}`;
  });
}

/** Leaves out the tabs whose identity is in `unticked`. See `tabIdentities`. */
export function dropUnticked(result: FilterResult, unticked: ReadonlySet<string>): FilterResult {
  if (unticked.size === 0) return result;
  let dropped = 0;
  const windows: SessionWindow[] = [];
  for (const win of result.session.windows) {
    const ids = tabIdentities(win);
    const tabs = win.tabs.filter((_, position) => !unticked.has(ids[position] as string));
    dropped += win.tabs.length - tabs.length;
    if (tabs.length === 0) continue;
    windows.push(tabs.length === win.tabs.length ? win : reindexWindow(win, tabs));
  }
  return {
    session: { ...result.session, windows },
    removed: { ...result.removed, unticked: result.removed.unticked + dropped },
  };
}

/**
 * Reassigns contiguous indices, remaps `openerIndex` to the new positions and
 * drops groups that no longer have members, so a filtered session is internally
 * consistent rather than full of dangling references.
 */
function reindexWindow(win: SessionWindow, tabs: SessionTab[]): SessionWindow {
  const oldToNew = new Map<number, number>();
  tabs.forEach((tab, position) => oldToNew.set(tab.index, position));

  const next = tabs.map((tab, position) => ({
    ...tab,
    index: position,
    openerIndex:
      tab.openerIndex !== null && oldToNew.has(tab.openerIndex)
        ? (oldToNew.get(tab.openerIndex) as number)
        : null,
  }));

  const usedGroups = new Set(next.map((tab) => tab.groupKey).filter(Boolean) as string[]);
  return { ...win, tabs: next, groups: win.groups.filter((group) => usedGroups.has(group.key)) };
}

export function sortTabs(tabs: SessionTab[], mode: SortMode, desc: boolean): SessionTab[] {
  if (mode === "natural") {
    const byIndex = [...tabs].sort((a, b) => a.index - b.index);
    return partitionPinned(byIndex);
  }
  const keyed = (tab: SessionTab): string => {
    if (mode === "title") return tab.title || tab.url;
    if (mode === "url") return tab.url;
    return domainOf(tab.url);
  };
  const compare = (a: SessionTab, b: SessionTab): number => {
    const result = keyed(a).localeCompare(keyed(b), undefined, { sensitivity: "base" });
    if (result !== 0) return desc ? -result : result;
    return a.index - b.index;
  };
  const pinned = tabs.filter((tab) => tab.pinned).sort(compare);
  const rest = tabs.filter((tab) => !tab.pinned).sort(compare);
  return [...pinned, ...rest];
}

function partitionPinned(tabs: SessionTab[]): SessionTab[] {
  const pinned = tabs.filter((tab) => tab.pinned);
  const rest = tabs.filter((tab) => !tab.pinned);
  return [...pinned, ...rest];
}

/**
 * Deduplication compares the URL with only the scheme and host lowercased.
 * Nothing else is normalised: two URLs differing by a query or a fragment are
 * different pages, and silently merging them would lose a tab.
 */
export function dedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    return `${scheme}//${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * One wildcard pattern per line. `*` matches any run of characters.
 *
 * The list is bounded on both axes. A pattern is a line somebody typed, and a
 * line of five hundred stars compiles to five hundred `.*` groups, which a
 * regular expression engine can spend a very long time backtracking through on
 * a URL that does not match. The limits cost nobody anything real: the longest
 * useful pattern is a domain with a star at each end.
 */
export const MAX_EXCLUDE_PATTERNS = 200;
export const MAX_PATTERN_LENGTH = 200;

export function compileExcludeList(list: string): RegExp[] {
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .slice(0, MAX_EXCLUDE_PATTERNS)
    .map((line) => line.slice(0, MAX_PATTERN_LENGTH))
    .map((line) => {
      const escaped = line.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*+/g, ".*");
      return new RegExp(`^${escaped}$`, "i");
    });
}
