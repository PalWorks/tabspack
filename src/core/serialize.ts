/**
 * `Session` to `TabsPackFile`, and the file to text.
 *
 * Output is deterministic: keys are written in the order docs/SPEC.md lists
 * them, arrays keep their order, defaults are omitted, and `exportedAt` is the
 * only value that changes between two exports of the same session. Without that
 * property the round trip test in docs/TESTING.md would be meaningless.
 */
import type {
  TabsPackFile,
  TabsPackGroup,
  TabsPackTab,
  TabsPackWindow,
} from "../types/tabspack.js";
import { FORMAT, SCHEMA_VERSION } from "../types/tabspack.js";
import type { Session, SessionGroup, SessionTab, SessionWindow } from "../types/session.js";
import { countSession } from "../types/session.js";
import { isoWithOffset } from "./naming.js";

export interface SerializeOptions {
  /** When false, `data:` favicon URLs are dropped. Remote icon URLs are kept. */
  keepFavicons: boolean;
  /** Overrides the clock. Tests pass a fixed date. */
  exportedAt?: Date;
  name?: string;
  tags?: string[];
}

export function toFile(session: Session, options: SerializeOptions): TabsPackFile {
  const counts = countSession(session);
  const source = withUnknown(
    compact({
      browser: session.source.browser,
      browserVersion: session.source.browserVersion,
      os: session.source.os,
      extensionVersion: session.source.extensionVersion,
      profile: session.source.profile,
      deviceName: session.source.deviceName,
    }),
    session.source.unknown,
  );
  const name = options.name ?? session.name;
  const tags = options.tags ?? session.tags;

  const file: TabsPackFile = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: exportedAtOf(session, options),
    ...(name ? { name } : {}),
    ...(tags && tags.length > 0 ? { tags: [...tags] } : {}),
    ...(Object.keys(source).length > 0 ? { source } : {}),
    counts: { windows: counts.windows, tabs: counts.tabs, groups: counts.groups },
    windows: session.windows.map((win) => serializeWindow(win, options)),
  };
  return withUnknown(file, session.unknown);
}

function serializeWindow(win: SessionWindow, options: SerializeOptions): TabsPackWindow {
  const out: TabsPackWindow = {
    id: win.key,
    ...(win.name ? { name: win.name } : {}),
    ...(win.focused ? { focused: true } : {}),
    ...(win.incognito ? { incognito: true } : {}),
    type: win.type,
    ...(win.state ? { state: win.state } : {}),
    ...(win.bounds && Object.keys(win.bounds).length > 0 ? { bounds: { ...win.bounds } } : {}),
    ...(win.groups.length > 0 ? { groups: win.groups.map(serializeGroup) } : {}),
    tabs: win.tabs.map((tab) => serializeTab(tab, options)),
  };
  return withUnknown(out, win.unknown);
}

function serializeGroup(group: SessionGroup): TabsPackGroup {
  const out: TabsPackGroup = {
    id: group.key,
    ...(group.title ? { title: group.title } : {}),
    ...(group.color ? { color: group.color } : {}),
    ...(group.collapsed ? { collapsed: true } : {}),
  };
  return withUnknown(out, group.unknown);
}

/**
 * A pack read from a file keeps the timestamp text it arrived with, so re
 * exporting it does not restamp it with the reader's timezone. Anything
 * collected from the browser is stamped from the clock.
 */
function exportedAtOf(session: Session, options: SerializeOptions): string {
  if (options.exportedAt) return isoWithOffset(options.exportedAt);
  if (session.exportedAtText) return session.exportedAtText;
  return isoWithOffset(new Date(session.capturedAt));
}

function serializeTab(tab: SessionTab, options: SerializeOptions): TabsPackTab {
  const favicon = keepableFavicon(tab.favIconUrl, options.keepFavicons);
  const out: TabsPackTab = {
    index: tab.index,
    url: tab.url,
    ...(tab.title ? { title: tab.title } : {}),
    ...(tab.pinned ? { pinned: true } : {}),
    ...(tab.active ? { active: true } : {}),
    ...(tab.groupKey ? { groupId: tab.groupKey } : {}),
    ...(favicon ? { favIconUrl: favicon } : {}),
    ...(tab.muted ? { muted: true } : {}),
    ...(tab.discarded ? { discarded: true } : {}),
    ...(tab.openerIndex !== null ? { openerIndex: tab.openerIndex } : {}),
    ...(tab.cookieStoreId !== null ? { cookieStoreId: tab.cookieStoreId } : {}),
    ...(tab.lastAccessedText
      ? { lastAccessed: tab.lastAccessedText }
      : tab.lastAccessed !== null
        ? { lastAccessed: isoWithOffset(new Date(tab.lastAccessed)) }
        : {}),
    ...(tab.notes ? { notes: tab.notes } : {}),
    ...(tab.tags && tab.tags.length > 0 ? { tags: [...tab.tags] } : {}),
  };
  return withUnknown(out, tab.unknown);
}

/**
 * Off means no favicon in the file, on means every favicon including the
 * embedded ones.
 *
 * This used to drop only `data:` icons and keep every remote one whatever the
 * setting said, so a checkbox labelled "Favicon URLs" removed almost nothing
 * when it was cleared. The label is the promise, and the promise is now kept:
 * ADR-032. Embedded icons are still the expensive case, megabytes across a few
 * hundred tabs, which is why the default is off.
 */
export function keepableFavicon(url: string | undefined, keep: boolean): string | undefined {
  if (!url || !keep) return undefined;
  return url;
}

/**
 * Unrecognised fields are written back after the known ones, in sorted order so
 * the output stays deterministic. ADR-004: ignore for behaviour, preserve on
 * rewrite.
 */
function withUnknown<T extends object>(value: T, unknown: Record<string, unknown> | undefined): T {
  if (!unknown) return value;
  const target = value as unknown as Record<string, unknown>;
  for (const key of Object.keys(unknown).sort()) {
    if (!(key in target)) target[key] = unknown[key];
  }
  return value;
}

function compact(input: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/** Two space JSON with a trailing newline, so the file ends like a text file should. */
export function stringify(file: TabsPackFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
