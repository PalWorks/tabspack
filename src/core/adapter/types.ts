/**
 * The boundary between TabsPack and the browser.
 *
 * Nothing outside `src/core/adapter/` may reference `browser.*` or `chrome.*`.
 * Core logic takes a `BrowserAdapter` as a parameter, which is what makes it
 * testable in node and what keeps one codebase serving Chromium and Gecko.
 */

/** A tab as the browser reports it, narrowed to the fields TabsPack reads. */
export interface RawTab {
  id?: number;
  index: number;
  windowId?: number;
  /** Empty on a tab that has never rendered. Fall back to `pendingUrl`. */
  url?: string;
  pendingUrl?: string;
  title?: string;
  pinned?: boolean;
  active?: boolean;
  highlighted?: boolean;
  /** Chromium and Gecko report -1 for "no group". */
  groupId?: number;
  favIconUrl?: string;
  mutedInfo?: { muted?: boolean };
  discarded?: boolean;
  openerTabId?: number;
  cookieStoreId?: string;
  /** Epoch milliseconds, not reported by every browser. */
  lastAccessed?: number;
  incognito?: boolean;
}

/** A window as the browser reports it. */
export interface RawWindow {
  id?: number;
  focused?: boolean;
  incognito?: boolean;
  type?: string;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  title?: string;
  tabs?: RawTab[];
}

/** A tab group as the browser reports it. */
export interface RawGroup {
  id: number;
  windowId?: number;
  title?: string;
  color?: string;
  collapsed?: boolean;
}

export interface TabQuery {
  currentWindow?: boolean;
  active?: boolean;
  highlighted?: boolean;
  windowId?: number;
}

/**
 * Provenance only. These values are written into `source` in an exported file
 * and are never used to branch behaviour: capability probes do that.
 */
export interface PlatformInfo {
  browser: string;
  browserVersion: string;
  os: string;
  extensionVersion: string;
}

/**
 * What this browser can actually do. Every field is a probe, never a browser
 * name check. `discardOnCreate` is null because no API reports it; it is
 * resolved empirically the first time a restore needs it.
 */
export interface Capabilities {
  tabGroups: boolean;
  containers: boolean;
  offscreen: boolean;
  downloads: boolean;
  windowBounds: boolean;
  commands: boolean;
  discardOnCreate: boolean | null;
}

export interface DownloadRequest {
  /** A blob or data URL created by the calling page. */
  url: string;
  filename: string;
  saveAs?: boolean;
}

/**
 * Returned by a message handler that is not responsible for a message, so the
 * router stays silent and lets another context answer. The service worker and
 * the offscreen document both receive every runtime message.
 */
export const UNHANDLED = "__tabspack_unhandled__";

export interface BrowserAdapter {
  platform(): Promise<PlatformInfo>;
  capabilities(): Promise<Capabilities>;
  getWindows(populate: boolean): Promise<RawWindow[]>;
  getCurrentWindow(populate: boolean): Promise<RawWindow>;
  queryTabs(query: TabQuery): Promise<RawTab[]>;
  /** Returns an empty array when the browser has no tab groups API. */
  queryGroups(windowId?: number): Promise<RawGroup[]>;
  hasPermissions(permissions: string[]): Promise<boolean>;
  requestPermissions(permissions: string[]): Promise<boolean>;
  isAllowedIncognitoAccess(): Promise<boolean>;
  download(request: DownloadRequest): Promise<number | null>;
  storageGet<T extends Record<string, unknown>>(defaults: T): Promise<T>;
  storageSet(values: Record<string, unknown>): Promise<void>;
  setBadge(text: string, durationMs?: number): Promise<void>;
  sendMessage<T = unknown>(message: unknown): Promise<T | undefined>;
  extensionUrl(path: string): string;
  openExtensionPage(path: string): Promise<void>;
  copyText(text: string): Promise<void>;
}
