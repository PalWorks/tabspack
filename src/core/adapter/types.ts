/**
 * The boundary between TabsPack and the browser.
 *
 * Nothing outside `src/core/adapter/` may reference `browser.*` or `chrome.*`.
 * Core logic takes a `BrowserAdapter` as a parameter, which is what makes it
 * testable in node and what keeps one codebase serving Chromium and Gecko.
 */

/** A tab as the browser reports it, narrowed to the fields TabsPack reads. */
/** What a badge is telling the user, which decides its colour. */
export type BadgeTone = "working" | "success" | "failure";

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
  downloads: boolean;
  windowBounds: boolean;
  commands: boolean;
  discardOnCreate: boolean | null;
}

/** What `tabs.create` is given. Only the fields TabsPack sets. */
export interface CreateTabRequest {
  windowId?: number;
  url: string;
  /** Omitted so the browser appends, which is what keeps pinned ordering right. */
  index?: number;
  active?: boolean;
  pinned?: boolean;
  openerTabId?: number;
  /** Gecko only. Chromium rejects the property, which is how it is probed. */
  discarded?: boolean;
  /** Gecko shows this on a tab that has never rendered. */
  title?: string;
  cookieStoreId?: string;
}

export interface CreateWindowRequest {
  url?: string | string[];
  focused?: boolean;
  incognito?: boolean;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface UpdateTabRequest {
  active?: boolean;
  openerTabId?: number;
  muted?: boolean;
  pinned?: boolean;
  url?: string;
}

export interface UpdateWindowRequest {
  state?: string;
  focused?: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  /** Gecko only, ignored elsewhere. */
  titlePreface?: string;
}

export interface UpdateGroupRequest {
  title?: string;
  color?: string;
  collapsed?: boolean;
}

export interface DownloadRequest {
  /** A blob or data URL created by the calling page. */
  url: string;
  filename: string;
  saveAs?: boolean;
}

/** A tab that changed id, which is what unloading does on Chromium. */
export interface TabMove {
  from: number;
  to: number;
}

export interface BrowserAdapter {
  platform(): Promise<PlatformInfo>;
  capabilities(): Promise<Capabilities>;
  getWindows(populate: boolean): Promise<RawWindow[]>;
  getCurrentWindow(populate: boolean): Promise<RawWindow>;
  queryTabs(query: TabQuery): Promise<RawTab[]>;
  /** Returns an empty array when the browser has no tab groups API. */
  queryGroups(windowId?: number): Promise<RawGroup[]>;
  /**
   * Creating browser state. Every one of these can reject, and the restore
   * engine treats a rejection as a reportable event rather than a crash: see
   * docs/ARCHITECTURE.md section 6.
   */
  createWindow(request: CreateWindowRequest): Promise<RawWindow>;
  createTab(request: CreateTabRequest): Promise<RawTab>;
  updateTab(tabId: number, request: UpdateTabRequest): Promise<void>;
  removeTabs(tabIds: number[]): Promise<void>;
  /** One tab by id, or null when it is gone. */
  getTab(tabId: number): Promise<RawTab | null>;
  /**
   * Best effort. A browser that refuses leaves the tab loaded, so this answers
   * with the tabs it actually unloaded: the restore report counts those, not
   * the ones it asked for.
   *
   * Chromium hands the tab a **new id** when it unloads it, so each entry says
   * which id became which. A browser that keeps the id answers `from === to`.
   */
  discardTabs(tabIds: number[]): Promise<TabMove[]>;
  /** Returns the new group id, or null when this browser cannot group tabs. */
  groupTabs(request: { tabIds: number[]; windowId?: number }): Promise<number | null>;
  updateGroup(groupId: number, request: UpdateGroupRequest): Promise<void>;
  updateWindow(windowId: number, request: UpdateWindowRequest): Promise<void>;
  /** Whether the browser lets this extension open `file://` URLs. */
  isAllowedFileSchemeAccess(): Promise<boolean>;
  hasPermissions(permissions: string[]): Promise<boolean>;
  requestPermissions(permissions: string[]): Promise<boolean>;
  isAllowedIncognitoAccess(): Promise<boolean>;
  download(request: DownloadRequest): Promise<number | null>;
  storageGet<T extends Record<string, unknown>>(defaults: T): Promise<T>;
  storageSet(values: Record<string, unknown>): Promise<void>;
  storageRemove(keys: string[]): Promise<void>;
  /** Every stored key. `storageGet` only returns the keys it was given. */
  storageGetAll(): Promise<Record<string, unknown>>;
  /** Bytes in use, or null when the browser does not report it. */
  storageBytesInUse(): Promise<number | null>;
  /** Fires when another page or the background changes stored data. */
  onStorageChanged(handler: (keys: string[]) => void): void;
  /**
   * The toolbar badge. `tone` colours it, because four characters cannot say
   * whether something worked: ADR-033.
   */
  setBadge(text: string, durationMs?: number, tone?: BadgeTone): Promise<void>;
  /**
   * The toolbar tooltip, which is where the sentence goes. The badge says that
   * something happened, this says what.
   */
  setActionTitle(title: string): Promise<void>;
  extensionUrl(path: string): string;
  /** A translated string. Synchronous, because the browser's own API is. */
  getMessage(key: string, subs?: string[]): string;
  /** The keyboard commands the browser knows about, with their current keys. */
  listCommands(): Promise<{ name: string; shortcut: string; description: string }[]>;
  /** Opens the extension's own options page, wherever the browser puts it. */
  openOptions(): Promise<void>;
  /** A page of this extension, by its path inside the package. */
  openExtensionPage(path: string): Promise<void>;
  /**
   * An address that is not ours: a store listing, a `mailto:`. Separate from
   * `openExtensionPage` because that one resolves its argument against the
   * extension's own origin, so handing it an absolute URL produces
   * `chrome-extension://<id>/https://...` and opens nothing: ADR-038.
   */
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
}
