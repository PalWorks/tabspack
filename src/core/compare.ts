/**
 * Comparing sessions: what changed between two snapshots (B-103), which tabs
 * a restart lost (B-102), whether a session changed at all (B-101), and which
 * addresses keep turning up across snapshots (B-201).
 *
 * Pure. Every function takes sessions and returns data, and the interface
 * supplies the words, so all of it is tested in node.
 *
 * Two ways of saying "the same tab" are used, on purpose. Within one browser
 * run a tab is its window, its address and which copy of that address it is
 * (`tabIdentities`), so a tab moved along the strip is not a new tab. Across
 * a restart, or across snapshots taken days apart, window keys mean nothing,
 * so a tab is its address as `dedupeKey` normalises it, counted as a multiset:
 * two copies of a page are two tabs, and losing one of them is a loss.
 */
import type { Session, SessionTab, SessionWindow } from "../types/session.js";
import { dedupeKey, tabIdentities } from "./filters.js";

/* Unchanged or not, B-101 --------------------------------------------------- */

/**
 * A short fingerprint of what a session holds: every tab by identity, whether
 * it is pinned, and which group it is in, by the group's title and colour. Two
 * captures with the same signature are the same session for the purpose of
 * deciding whether a new automatic snapshot is worth writing. A page that only
 * finished loading, or a tab that was merely activated, is not a change.
 */
export function signature(session: Session): string {
  const parts: string[] = [];
  for (const win of session.windows) {
    const groups = new Map(win.groups.map((group) => [group.key, `${group.title ?? ""}/${group.color ?? ""}`]));
    const ids = tabIdentities(win);
    win.tabs.forEach((tab, position) => {
      const group = tab.groupKey ? (groups.get(tab.groupKey) ?? "?") : "";
      parts.push(`${ids[position]}|${tab.pinned ? 1 : 0}|${group}`);
    });
    parts.push("--");
  }
  return hash(parts.join("\n"));
}

/** cyrb53: a fast 53 bit string hash. Not cryptographic, and nothing here needs it to be. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* What a restart lost, B-102 ------------------------------------------------ */

export interface Loss {
  /** Tabs from `previous` with no counterpart open now, window by window. */
  missing: { window: SessionWindow; tabs: SessionTab[] }[];
  missingTabs: number;
  totalTabs: number;
  /** Windows of `previous` none of whose tabs is open now. */
  wholeWindows: number;
}

/** A restart that lost fewer than this many tabs is not worth interrupting anyone for. */
export const LOSS_MIN_TABS = 10;
/** And they must also be at least this share of the session. */
export const LOSS_MIN_SHARE = 0.2;
/** Unless a whole window of at least this many tabs is gone, which is always worth saying. */
export const LOSS_WINDOW_TABS = 3;

export function lostTabs(previous: Session, current: Session): Loss {
  const open = new Map<string, number>();
  for (const win of current.windows) {
    for (const tab of win.tabs) {
      const key = dedupeKey(tab.url);
      open.set(key, (open.get(key) ?? 0) + 1);
    }
  }
  const missing: Loss["missing"] = [];
  let missingTabs = 0;
  let totalTabs = 0;
  let wholeWindows = 0;
  for (const win of previous.windows) {
    const gone: SessionTab[] = [];
    for (const tab of win.tabs) {
      totalTabs += 1;
      const key = dedupeKey(tab.url);
      const left = open.get(key) ?? 0;
      if (left > 0) open.set(key, left - 1);
      else gone.push(tab);
    }
    if (gone.length === 0) continue;
    missing.push({ window: win, tabs: gone });
    missingTabs += gone.length;
    if (gone.length === win.tabs.length && win.tabs.length >= LOSS_WINDOW_TABS) wholeWindows += 1;
  }
  return { missing, missingTabs, totalTabs, wholeWindows };
}

/**
 * Whether a loss is worth an offer. A browser that restored its own session,
 * which is the ordinary case, loses nothing and is offered nothing: an offer
 * that appears after every restart is an offer nobody reads.
 */
export function worthOffering(loss: Loss): boolean {
  if (loss.wholeWindows > 0) return true;
  return loss.missingTabs >= LOSS_MIN_TABS && loss.missingTabs >= loss.totalTabs * LOSS_MIN_SHARE;
}

/* What changed between two snapshots, B-103 --------------------------------- */

export interface TabRef {
  url: string;
  title: string;
}

export interface SessionDiff {
  /** In `after` and not in `before`. */
  added: TabRef[];
  /** In `before` and not in `after`. */
  removed: TabRef[];
  /** In both, in a different window, by the window's position. */
  moved: TabRef[];
  /** In both, in a different group, by the group's title and colour. */
  regrouped: TabRef[];
}

interface Placed {
  tab: SessionTab;
  window: number;
  group: string;
}

function placements(session: Session): Map<string, Placed[]> {
  const out = new Map<string, Placed[]>();
  session.windows.forEach((win, position) => {
    const groups = new Map(win.groups.map((group) => [group.key, `${group.title ?? ""}/${group.color ?? ""}`]));
    for (const tab of win.tabs) {
      const key = dedupeKey(tab.url);
      const list = out.get(key) ?? [];
      list.push({ tab, window: position, group: tab.groupKey ? (groups.get(tab.groupKey) ?? "") : "" });
      out.set(key, list);
    }
  });
  return out;
}

const ref = (tab: SessionTab): TabRef => ({ url: tab.url, title: tab.title });

export function diffSessions(before: Session, after: Session): SessionDiff {
  const was = placements(before);
  const now = placements(after);
  const diff: SessionDiff = { added: [], removed: [], moved: [], regrouped: [] };
  for (const [key, list] of now) {
    const earlier = was.get(key) ?? [];
    list.forEach((placed, copy) => {
      const match = earlier[copy];
      if (!match) {
        diff.added.push(ref(placed.tab));
        return;
      }
      if (match.window !== placed.window) diff.moved.push(ref(placed.tab));
      else if (match.group !== placed.group) diff.regrouped.push(ref(placed.tab));
    });
  }
  for (const [key, list] of was) {
    const later = now.get(key) ?? [];
    for (let copy = later.length; copy < list.length; copy += 1) {
      const placed = list[copy];
      if (placed) diff.removed.push(ref(placed.tab));
    }
  }
  return diff;
}

export function isEmptyDiff(diff: SessionDiff): boolean {
  return diff.added.length + diff.removed.length + diff.moved.length + diff.regrouped.length === 0;
}

/**
 * Runs of consecutive snapshots with nothing between them, oldest first in
 * `ordered`. The newest of each run is kept and the rest are proposed for
 * deletion, which the user confirms. The signature is the comparison, so the
 * bodies need reading once, not once per pair.
 */
export function tidyCandidates(ordered: { id: string; signature: string }[]): string[] {
  const remove: string[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (current && next && current.signature === next.signature) remove.push(current.id);
  }
  return remove;
}

/* Addresses across snapshots, B-201 ----------------------------------------- */

export interface OverlapEntry {
  url: string;
  title: string;
  /** Snapshot ids holding it, newest first as given. */
  snapshots: string[];
}

/** An address has to be in at least this many snapshots to be worth listing. */
export const OVERLAP_MIN = 3;

/**
 * Addresses found in `min` or more snapshots, most widespread first. A page
 * open twice in one snapshot counts once for that snapshot: the question is
 * how many snapshots carry it, not how many tabs.
 */
export function overlap(entries: { id: string; session: Session }[], min = OVERLAP_MIN): OverlapEntry[] {
  const found = new Map<string, OverlapEntry>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const win of entry.session.windows) {
      for (const tab of win.tabs) {
        const key = dedupeKey(tab.url);
        if (seen.has(key)) continue;
        seen.add(key);
        const known = found.get(key) ?? { url: tab.url, title: tab.title, snapshots: [] };
        known.snapshots.push(entry.id);
        found.set(key, known);
      }
    }
  }
  return [...found.values()]
    .filter((entry) => entry.snapshots.length >= min)
    .sort((a, b) => b.snapshots.length - a.snapshots.length || a.url.localeCompare(b.url));
}

/**
 * Several snapshots as one, every address once. The newest keeps its windows,
 * groups and order, because it is the one closest to how the user works now;
 * anything found only in older ones goes into one extra window at the end, in
 * the order it was first met. Nothing is dropped except a repeat.
 */
export function combine(newestFirst: Session[], name: string, now = Date.now()): Session {
  const seen = new Set<string>();
  const windows: SessionWindow[] = [];
  const [newest, ...older] = newestFirst;
  if (newest) {
    for (const win of newest.windows) {
      const tabs = win.tabs.filter((tab) => {
        const key = dedupeKey(tab.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (tabs.length > 0) windows.push({ ...win, key: `w${windows.length + 1}`, tabs: reindex(tabs) });
    }
  }
  const extra: SessionTab[] = [];
  for (const session of older) {
    for (const win of session.windows) {
      for (const tab of win.tabs) {
        const key = dedupeKey(tab.url);
        if (seen.has(key)) continue;
        seen.add(key);
        // Its group belonged to another window in another snapshot.
        const { groupKey: _dropped, ...loose } = tab;
        extra.push({ ...loose, pinned: false, active: false, openerIndex: null });
      }
    }
  }
  if (extra.length > 0) {
    windows.push({ key: `w${windows.length + 1}`, focused: false, incognito: false, type: "normal", groups: [], tabs: reindex(extra) });
  }
  return { windows: windows.map(keepUsedGroups), source: newest?.source ?? {}, capturedAt: now, name };
}

/** A session of just these tabs, in one window, for opening a diff list in the preview. */
export function sessionOfTabs(tabs: TabRef[], name: string, now = Date.now()): Session {
  const list: SessionTab[] = tabs.map((tab, index) => ({
    index,
    url: tab.url,
    title: tab.title,
    pinned: false,
    active: index === 0,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: null,
  }));
  return {
    windows: list.length > 0 ? [{ key: "w1", focused: true, incognito: false, type: "normal", groups: [], tabs: list }] : [],
    source: {},
    capturedAt: now,
    name,
  };
}

function reindex(tabs: SessionTab[]): SessionTab[] {
  // Opener links pointed into windows that no longer exist in this shape.
  return tabs.map((tab, index) => ({ ...tab, index, openerIndex: null }));
}

function keepUsedGroups(win: SessionWindow): SessionWindow {
  const used = new Set(win.tabs.map((tab) => tab.groupKey).filter(Boolean));
  return { ...win, groups: win.groups.filter((group) => used.has(group.key)) };
}
