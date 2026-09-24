/**
 * Reads the browser into a `Session`.
 *
 * Three things here exist because of bugs found in other extensions:
 * `pendingUrl` is honoured so tabs that never rendered are not lost, windows
 * whose type is not `normal` are skipped because their tabs cannot be restored,
 * and group membership is read from the tab rather than guessed from position.
 */
import type { BrowserAdapter, RawGroup, RawTab, RawWindow } from "./adapter/types.js";
import type {
  Session,
  SessionGroup,
  SessionTab,
  SessionWindow,
  Scope,
} from "../types/session.js";
import { GROUP_COLORS, type GroupColor, type WindowState, type WindowType } from "../types/tabspack.js";

export interface CollectOptions {
  scope: Scope;
  includeIncognito: boolean;
  /** Supplied by tests. Defaults to the real clock. */
  now?: number;
}

export async function collectSession(
  adapter: BrowserAdapter,
  options: CollectOptions,
): Promise<Session> {
  const platform = await adapter.platform();
  const caps = await adapter.capabilities();
  const rawWindows = await gatherWindows(adapter, options.scope);

  const windows: SessionWindow[] = [];
  for (const rawWindow of rawWindows) {
    if (windowType(rawWindow) !== "normal") continue;
    if (rawWindow.incognito === true && !options.includeIncognito) continue;

    const rawTabs = [...(rawWindow.tabs ?? [])].sort((a, b) => a.index - b.index);
    const usable = rawTabs.filter((tab) => tabUrl(tab) !== "");
    if (usable.length === 0) continue;

    const groups = caps.tabGroups ? await adapter.queryGroups(rawWindow.id) : [];
    windows.push(buildWindow(rawWindow, usable, groups, windows.length + 1));
  }

  return {
    windows,
    source: {
      browser: platform.browser,
      browserVersion: platform.browserVersion,
      os: platform.os,
      extensionVersion: platform.extensionVersion,
    },
    capturedAt: options.now ?? Date.now(),
  };
}

async function gatherWindows(adapter: BrowserAdapter, scope: Scope): Promise<RawWindow[]> {
  switch (scope) {
    case "all_windows":
      return await adapter.getWindows(true);
    case "current_window":
      return [await adapter.getCurrentWindow(true)];
    case "current_tab":
    case "selection": {
      const meta = await adapter.getCurrentWindow(false);
      const tabs = await adapter.queryTabs(
        scope === "current_tab"
          ? { currentWindow: true, active: true }
          : { currentWindow: true, highlighted: true },
      );
      return [{ ...meta, tabs }];
    }
    default:
      return await adapter.getWindows(true);
  }
}

function buildWindow(
  raw: RawWindow,
  rawTabs: RawTab[],
  rawGroups: RawGroup[],
  ordinal: number,
): SessionWindow {
  const groupKeys = new Map<number, string>();
  const groups: SessionGroup[] = [];

  const tabs: SessionTab[] = [];
  const indexByTabId = new Map<number, number>();

  rawTabs.forEach((raw, position) => {
    if (raw.id !== undefined) indexByTabId.set(raw.id, position);
  });

  rawTabs.forEach((rawTab, position) => {
    let groupKey: string | undefined;
    const rawGroupId = rawTab.groupId;
    if (typeof rawGroupId === "number" && rawGroupId >= 0) {
      let key = groupKeys.get(rawGroupId);
      if (key === undefined) {
        key = `g${groups.length + 1}`;
        groupKeys.set(rawGroupId, key);
        const meta = rawGroups.find((group) => group.id === rawGroupId);
        // Membership is kept even when the tab groups API is unavailable, so a
        // later restore on a capable browser is not lossy. Title and colour are
        // only written when they were actually read: inventing a colour would
        // put a value in the file that no browser ever reported.
        groups.push({
          key,
          ...(meta?.title ? { title: meta.title } : {}),
          ...(meta ? { color: normaliseColor(meta.color), collapsed: meta.collapsed === true } : {}),
        });
      }
      groupKey = key;
    }

    const opener = rawTab.openerTabId;
    const openerIndex =
      opener !== undefined && indexByTabId.has(opener) ? (indexByTabId.get(opener) as number) : null;

    tabs.push({
      index: position,
      url: tabUrl(rawTab),
      title: rawTab.title ?? "",
      pinned: rawTab.pinned === true,
      active: rawTab.active === true,
      muted: rawTab.mutedInfo?.muted === true,
      discarded: rawTab.discarded === true,
      ...(groupKey ? { groupKey } : {}),
      ...(rawTab.favIconUrl ? { favIconUrl: rawTab.favIconUrl } : {}),
      openerIndex: openerIndex === position ? null : openerIndex,
      cookieStoreId: rawTab.cookieStoreId ?? null,
      lastAccessed: typeof rawTab.lastAccessed === "number" ? rawTab.lastAccessed : null,
    });
  });

  return {
    key: `w${ordinal}`,
    ...(raw.title ? { name: raw.title } : {}),
    focused: raw.focused === true,
    incognito: raw.incognito === true,
    type: "normal",
    ...(windowState(raw) ? { state: windowState(raw) as WindowState } : {}),
    ...(hasBounds(raw)
      ? {
          bounds: {
            ...(raw.left !== undefined ? { left: raw.left } : {}),
            ...(raw.top !== undefined ? { top: raw.top } : {}),
            ...(raw.width !== undefined ? { width: raw.width } : {}),
            ...(raw.height !== undefined ? { height: raw.height } : {}),
          },
        }
      : {}),
    groups,
    tabs,
  };
}

/** An unloaded tab reports an empty `url` and carries the target in `pendingUrl`. */
export function tabUrl(tab: RawTab): string {
  const url = typeof tab.url === "string" ? tab.url.trim() : "";
  if (url !== "") return url;
  const pending = typeof tab.pendingUrl === "string" ? tab.pendingUrl.trim() : "";
  return pending;
}

function windowType(raw: RawWindow): WindowType {
  const type = raw.type ?? "normal";
  return type === "popup" || type === "app" ? type : "normal";
}

function windowState(raw: RawWindow): WindowState | undefined {
  const state = raw.state;
  if (state === "normal" || state === "minimized" || state === "maximized" || state === "fullscreen") {
    return state;
  }
  return undefined;
}

function hasBounds(raw: RawWindow): boolean {
  return (
    raw.left !== undefined ||
    raw.top !== undefined ||
    raw.width !== undefined ||
    raw.height !== undefined
  );
}

/** An unknown colour falls back to grey rather than failing, per SPEC section 6. */
export function normaliseColor(color: string | undefined): GroupColor {
  if (color && (GROUP_COLORS as readonly string[]).includes(color)) return color as GroupColor;
  return "grey";
}
