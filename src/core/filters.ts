/**
 * The filter pipeline. Pure, and applied in one fixed order so that a count in
 * the report always means the same thing:
 *
 *   1. web pages only   drop anything that is not http or https
 *   2. skip pinned      drop pinned tabs
 *   3. exclude list     drop URLs matching a wildcard pattern
 *   4. dedupe           keep the first occurrence of a URL across the session
 *   5. sort             within a window, pinned tabs first, then the sort mode
 *
 * Sorting runs last and partitions on `pinned`, because restoring a tab before
 * the pinned tabs exist puts it in the wrong place: see docs/DOMAIN.md.
 */
import type { Session, SessionTab, SessionWindow } from "../types/session.js";
import type { Settings, SortMode } from "./settings.js";

export interface FilterCounts {
  scheme: number;
  pinned: number;
  excluded: number;
  duplicate: number;
}

export interface FilterResult {
  session: Session;
  removed: FilterCounts;
}

export type FilterSettings = Pick<
  Settings,
  "dedupe" | "webPagesOnly" | "skipPinned" | "excludeList" | "sort" | "sortDesc"
>;

export function applyFilters(session: Session, settings: FilterSettings): FilterResult {
  const removed: FilterCounts = { scheme: 0, pinned: 0, excluded: 0, duplicate: 0 };
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

/** One wildcard pattern per line. `*` matches any run of characters. */
export function compileExcludeList(list: string): RegExp[] {
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const escaped = line.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`, "i");
    });
}
