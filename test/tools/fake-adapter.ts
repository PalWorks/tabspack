/**
 * A browser that only exists in node. Everything in `src/core/` takes the
 * adapter as a parameter, so the whole export pipeline is testable without a
 * browser: that is the point of the boundary rule in AGENTS.md.
 *
 * Since M2 it also writes. The mutating half models the browser semantics that
 * docs/DOMAIN.md Table D1 warns about, deliberately including the awkward ones,
 * because a fake that is more permissive than a browser proves nothing:
 *
 *   - a pinned tab is clamped into the pinned region, wherever it was asked for
 *   - indices are reassigned after every insertion and removal
 *   - a window with no tabs left closes itself
 *   - `discarded` at creation is rejected unless the capability says otherwise,
 *     which is how Chromium reports it and how the engine probes for it
 *   - the active tab cannot be discarded, and a group holding it cannot collapse
 *   - `windows.create` refuses bounds and a state in the same call
 */
import type {
  BadgeTone,
  BrowserAdapter,
  Capabilities,
  CreateTabRequest,
  CreateWindowRequest,
  DownloadRequest,
  PlatformInfo,
  RawGroup,
  RawTab,
  RawWindow,
  TabQuery,
  UpdateGroupRequest,
  UpdateTabRequest,
  UpdateWindowRequest,
} from "../../src/core/adapter/types.js";

export interface FakeState {
  windows: RawWindow[];
  groups: RawGroup[];
  capabilities?: Partial<Capabilities>;
  platform?: Partial<PlatformInfo>;
  incognitoAllowed?: boolean;
  fileAccessAllowed?: boolean;
  storage?: Record<string, unknown>;
  failDownload?: boolean;
  /** Null makes the browser refuse to report its own usage, as some do. */
  storageBytesInUse?: number | null;
  /** Makes the first `createWindow` with bounds reject, as a window manager can. */
  failBoundsOnce?: boolean;
  /**
   * Agrees to unload a pinned tab and then loads it anyway, which is what
   * Firefox 156 does: measured in the cross browser matrix, ADR-025.
   */
  reloadsPinnedTabs?: boolean;
  /**
   * How many reads a new tab reports `pendingUrl` and no `url` for, which is a
   * navigation on its way. One is the local page it was; a real remote page took
   * far more than one, and that difference destroyed a real session: ADR-026.
   */
  commitReads?: number;
  /** A tab whose navigation never commits at all, such as one that downloads. */
  neverCommits?: boolean;
  /**
   * Reports `about:blank` rather than an empty address while a navigation is in
   * flight, which is what Gecko does, and refuses to create a pinned tab
   * discarded, which is what Gecko says in as many words: ADR-027.
   */
  gecko?: boolean;
  /**
   * Whether the browser grants the support relay's host when asked. Default
   * false, because a default install has no host access at all and the
   * interface has to work that way round: ADR-039.
   */
  grantOrigins?: boolean;
  /** The browser's recently closed list. Absent means the permission was never granted. */
  recentlyClosed?: import("../../src/core/adapter/types.js").ClosedItem[];
}

export interface FakeAdapter extends BrowserAdapter {
  downloads: DownloadRequest[];
  copied: string[];
  badges: { text: string; durationMs?: number; tone?: BadgeTone }[];
  /** Every tooltip the surfaces set, in order. */
  actionTitles: string[];
  opened: string[];
  /** Every host permission the interface asked for, in order. */
  originsAsked: string[];
  /** Every mutating call, in order, so a test can assert the sequence. */
  calls: { method: string; detail?: unknown }[];
  storageListeners: ((keys: string[]) => void)[];
  /** Scheduled alarms by name, as the worker left them. */
  alarms: Map<string, { delayInMinutes?: number; periodInMinutes?: number }>;
  restoredClosed: string[];
  state: FakeState;
}

const DEFAULT_CAPABILITIES: Capabilities = {
  tabGroups: true,
  containers: false,
  downloads: true,
  windowBounds: true,
  commands: true,
  discardOnCreate: null,
  alarms: true,
  sessions: false,
};

const DEFAULT_PLATFORM: PlatformInfo = {
  browser: "Chrome",
  browserVersion: "141.0.0.0",
  os: "linux",
  extensionVersion: "0.0.1",
};

export function createFakeAdapter(state: FakeState): FakeAdapter {
  const storage: Record<string, unknown> = { ...(state.storage ?? {}) };
  let nextTabId = 10_000;
  /**
   * Tabs whose navigation has not committed yet, and how many more reads each
   * needs before it does. A real Chromium reports `pendingUrl` and no `url` for
   * one of these, and loses the address altogether if it is unloaded in that
   * state: ADR-025 and ADR-026.
   */
  const uncommitted = new Map<number, number>();
  let nextWindowId = 100;
  let nextGroupId = 900;
  let boundsFailed = false;

  const caps = (): Capabilities => ({ ...DEFAULT_CAPABILITIES, ...(state.capabilities ?? {}) });

  const windowOf = (windowId: number): RawWindow => {
    const found = state.windows.find((win) => win.id === windowId);
    if (!found) throw new Error(`No window with id ${windowId}.`);
    return found;
  };

  const tabsOf = (win: RawWindow): RawTab[] => {
    win.tabs ??= [];
    return win.tabs;
  };

  const findTab = (tabId: number): { win: RawWindow; tab: RawTab } => {
    for (const win of state.windows) {
      const tab = tabsOf(win).find((candidate) => candidate.id === tabId);
      if (tab) return { win, tab };
    }
    throw new Error(`No tab with id ${tabId}.`);
  };

  /** Pinned tabs hold the lowest indices, and indices are always contiguous. */
  const normalise = (win: RawWindow): void => {
    const tabs = tabsOf(win);
    const pinned = tabs.filter((tab) => tab.pinned === true);
    const rest = tabs.filter((tab) => tab.pinned !== true);
    const ordered = [...pinned, ...rest];
    ordered.forEach((tab, index) => {
      tab.index = index;
    });
    win.tabs = ordered;
  };

  const adapter: FakeAdapter = {
    state,
    downloads: [],
    copied: [],
    badges: [],
    actionTitles: [],
    opened: [],
    originsAsked: [],
    calls: [],
    storageListeners: [],
    alarms: new Map(),
    restoredClosed: [],

    async platform() {
      return { ...DEFAULT_PLATFORM, ...(state.platform ?? {}) };
    },
    async capabilities() {
      return caps();
    },
    async getWindows() {
      return state.windows;
    },
    async getCurrentWindow() {
      const focused = state.windows.find((win) => win.focused) ?? state.windows[0];
      if (!focused) throw new Error("No window is open.");
      return focused;
    },
    async queryTabs(query: TabQuery) {
      const focused = state.windows.find((win) => win.focused) ?? state.windows[0];
      const scoped =
        query.windowId !== undefined
          ? tabsOf(windowOf(query.windowId))
          : query.currentWindow === true || query.active === true || query.highlighted === true
            ? ((focused?.tabs ?? []) as RawTab[])
            : state.windows.flatMap((win) => tabsOf(win));
      if (query.active) return scoped.filter((tab) => tab.active);
      if (query.highlighted) return scoped.filter((tab) => tab.highlighted || tab.active);
      return scoped;
    },
    async queryGroups(windowId?: number) {
      if (!caps().tabGroups) return [];
      return state.groups.filter((group: RawGroup) =>
        windowId === undefined ? true : group.windowId === windowId,
      );
    },

    async createWindow(request: CreateWindowRequest) {
      adapter.calls.push({ method: "createWindow", detail: request });
      const hasBounds =
        request.left !== undefined ||
        request.top !== undefined ||
        request.width !== undefined ||
        request.height !== undefined;
      if (hasBounds && request.state !== undefined && request.state !== "normal") {
        throw new Error("The state cannot be combined with left, top, width or height.");
      }
      if (hasBounds && state.failBoundsOnce && !boundsFailed) {
        boundsFailed = true;
        throw new Error("The window manager refused those bounds.");
      }
      const id = (nextWindowId += 1);
      if (request.focused !== false) for (const win of state.windows) win.focused = false;
      const url = Array.isArray(request.url) ? request.url[0] : request.url;
      const win: RawWindow = {
        id,
        focused: request.focused !== false,
        incognito: request.incognito === true,
        type: "normal",
        state: request.state ?? "normal",
        ...(request.left !== undefined ? { left: request.left } : {}),
        ...(request.top !== undefined ? { top: request.top } : {}),
        ...(request.width !== undefined ? { width: request.width } : {}),
        ...(request.height !== undefined ? { height: request.height } : {}),
        tabs: [
          {
            id: (nextTabId += 1),
            index: 0,
            windowId: id,
            url: url ?? "about:blank",
            title: "",
            active: true,
            pinned: false,
            groupId: -1,
          },
        ],
      };
      state.windows.push(win);
      return win;
    },

    async createTab(request: CreateTabRequest) {
      adapter.calls.push({ method: "createTab", detail: request });
      if (request.discarded !== undefined && caps().discardOnCreate !== true) {
        throw new Error("Unexpected property: 'discarded'.");
      }
      /*
       * Gecko's own words, and a refusal about this request rather than about
       * the browser. An engine that reads it as the second downgrades every tab
       * after it, which is the defect in ADR-027.
       */
      if (request.discarded === true && request.pinned === true) {
        throw new Error("Pinned tabs cannot be created and discarded.");
      }
      const win = request.windowId === undefined ? await adapter.getCurrentWindow(false) : windowOf(request.windowId);
      const tabs = tabsOf(win);
      const tab: RawTab = {
        id: (nextTabId += 1),
        windowId: win.id,
        index: tabs.length,
        url: request.url,
        ...(request.title !== undefined ? { title: request.title } : { title: "" }),
        pinned: request.pinned === true,
        active: request.active === true,
        discarded: request.discarded === true,
        groupId: -1,
        ...(request.openerTabId !== undefined ? { openerTabId: request.openerTabId } : {}),
        ...(request.cookieStoreId !== undefined ? { cookieStoreId: request.cookieStoreId } : {}),
      };
      if (tab.active) for (const other of tabs) other.active = false;
      // A tab created unloaded was never navigating, so there is nothing to wait for.
      if (tab.discarded !== true && tab.id !== undefined) {
        uncommitted.set(tab.id, state.neverCommits === true ? Infinity : (state.commitReads ?? 1));
      }
      tabs.push(tab);
      normalise(win);
      return tab;
    },

    async updateTab(tabId: number, request: UpdateTabRequest) {
      adapter.calls.push({ method: "updateTab", detail: { tabId, request } });
      const { win, tab } = findTab(tabId);
      if (request.active === true) {
        for (const other of tabsOf(win)) other.active = false;
        tab.active = true;
        tab.discarded = false;
      }
      if (request.muted !== undefined) tab.mutedInfo = { muted: request.muted };
      if (request.openerTabId !== undefined) tab.openerTabId = request.openerTabId;
      if (request.pinned !== undefined) {
        tab.pinned = request.pinned;
        normalise(win);
      }
      if (request.url !== undefined) tab.url = request.url;
    },

    async removeTabs(tabIds: number[]) {
      adapter.calls.push({ method: "removeTabs", detail: tabIds });
      for (const tabId of tabIds) {
        const { win } = findTab(tabId);
        win.tabs = tabsOf(win).filter((tab) => tab.id !== tabId);
        normalise(win);
      }
      // A window with nothing left in it closes, which is why the restore engine
      // removes the placeholder tab only after a real tab exists.
      state.windows = state.windows.filter((win) => tabsOf(win).length > 0);
    },

    async getTab(tabId: number) {
      try {
        const { tab } = findTab(tabId);
        /*
         * A freshly created tab reports the address it is on its way to and no
         * address of its own until its navigation commits. Modelled because
         * Chromium does exactly this, and because a tab unloaded in that state
         * loses its address for good: ADR-025, and ADR-026 for the `pendingUrl`,
         * which is the half that was missing and cost a real session.
         */
        const left = uncommitted.get(tabId);
        if (left !== undefined) {
          if (left <= 1) uncommitted.delete(tabId);
          else uncommitted.set(tabId, left - 1);
          return state.gecko === true
            ? { ...tab, url: "about:blank", title: "", pendingUrl: tab.url ?? "" }
            : { ...tab, url: "", title: "", pendingUrl: tab.url ?? "" };
        }
        return tab;
      } catch {
        return null;
      }
    },

    /**
     * Chromium replaces the tab when it unloads it, so the id changes, and a tab
     * unloaded before its navigation committed comes back blank for good. Both
     * are modelled here because both were measured in a real browser, and both
     * were defects until 2026-09-25: ADR-025.
     */
    async discardTabs(tabIds: number[]) {
      adapter.calls.push({ method: "discardTabs", detail: tabIds });
      const moved: { from: number; to: number }[] = [];
      for (const tabId of tabIds) {
        const { tab } = findTab(tabId);
        // A browser will not unload the tab in front of the user, and the report
        // has to say what happened rather than what was asked for.
        if (tab.active === true) continue;
        if (uncommitted.has(tabId)) {
          tab.url = "";
          tab.title = "";
          uncommitted.delete(tabId);
        }

        // Firefox loads a pinned tab straight after agreeing to unload it.
        tab.discarded = state.reloadsPinnedTabs === true && tab.pinned === true ? false : true;
        const to = (nextTabId += 1);
        tab.id = to;
        uncommitted.delete(tabId);
        moved.push({ from: tabId, to });
      }
      return moved;
    },

    async groupTabs(request: { tabIds: number[]; windowId?: number }) {
      adapter.calls.push({ method: "groupTabs", detail: request });
      if (!caps().tabGroups || request.tabIds.length === 0) return null;
      const owners = new Set(request.tabIds.map((tabId) => findTab(tabId).win.id));
      if (owners.size > 1) throw new Error("A tab group cannot span windows.");
      const windowId = [...owners][0] as number;
      const groupId = (nextGroupId += 1);
      for (const tabId of request.tabIds) findTab(tabId).tab.groupId = groupId;
      state.groups.push({ id: groupId, windowId, title: "", color: "grey", collapsed: false });
      return groupId;
    },

    async updateGroup(groupId: number, request: UpdateGroupRequest) {
      adapter.calls.push({ method: "updateGroup", detail: { groupId, request } });
      const group = state.groups.find((candidate) => candidate.id === groupId);
      if (!group) throw new Error(`No group with id ${groupId}.`);
      if (request.collapsed === true) {
        const holdsActive = state.windows
          .flatMap((win) => tabsOf(win))
          .some((tab) => tab.groupId === groupId && tab.active === true);
        if (holdsActive) throw new Error("A group holding the active tab cannot be collapsed.");
      }
      if (request.title !== undefined) group.title = request.title;
      if (request.color !== undefined) group.color = request.color;
      if (request.collapsed !== undefined) group.collapsed = request.collapsed;
    },

    async updateWindow(windowId: number, request: UpdateWindowRequest) {
      adapter.calls.push({ method: "updateWindow", detail: { windowId, request } });
      const win = windowOf(windowId);
      if (request.state !== undefined) win.state = request.state;
      if (request.focused === true) {
        for (const other of state.windows) other.focused = false;
        win.focused = true;
      }
      for (const key of ["left", "top", "width", "height"] as const) {
        const value = request[key];
        if (value !== undefined) win[key] = value;
      }
    },

    async isAllowedFileSchemeAccess() {
      return state.fileAccessAllowed ?? false;
    },
    async hasPermissions() {
      return true;
    },
    async requestPermissions() {
      return true;
    },
    async hasOrigins(origins: string[]) {
      adapter.originsAsked.push(...origins);
      return state.grantOrigins ?? false;
    },
    async requestOrigins(origins: string[]) {
      adapter.originsAsked.push(...origins);
      return state.grantOrigins ?? false;
    },
    async isAllowedIncognitoAccess() {
      return state.incognitoAllowed ?? false;
    },
    async download(request: DownloadRequest) {
      if (state.failDownload) throw new Error("Downloads are unavailable.");
      adapter.downloads.push(request);
      return adapter.downloads.length;
    },
    async storageGet<T extends Record<string, unknown>>(defaults: T) {
      return { ...defaults, ...storage } as T;
    },
    async storageSet(values: Record<string, unknown>) {
      Object.assign(storage, values);
      for (const listener of adapter.storageListeners) listener(Object.keys(values));
    },
    async storageRemove(keys: string[]) {
      for (const key of keys) delete storage[key];
    },
    async storageGetAll() {
      return { ...storage };
    },
    onStorageChanged(handler: (keys: string[]) => void) {
      adapter.storageListeners.push(handler);
    },
    async alarmGet(name: string) {
      const found = adapter.alarms.get(name);
      return found ? { name, scheduledTime: 0, ...(found.periodInMinutes ? { periodInMinutes: found.periodInMinutes } : {}) } : null;
    },
    async alarmCreate(name: string, when: { delayInMinutes?: number; periodInMinutes?: number }) {
      adapter.alarms.set(name, { ...when });
    },
    async alarmClear(name: string) {
      adapter.alarms.delete(name);
    },
    async recentlyClosed() {
      return state.recentlyClosed ? state.recentlyClosed.map((item) => ({ ...item, tabs: [...item.tabs] })) : null;
    },
    async restoreClosed(sessionId: string) {
      adapter.restoredClosed.push(sessionId);
    },
    async storageBytesInUse() {
      if (state.storageBytesInUse === null) return null;
      return new TextEncoder().encode(JSON.stringify(storage)).length;
    },
    async setBadge(text: string, durationMs?: number, tone?: BadgeTone) {
      adapter.badges.push({ text, durationMs, tone });
    },
    async setActionTitle(title: string) {
      adapter.actionTitles.push(title);
    },
    extensionUrl(path: string) {
      return `chrome-extension://fake/${path}`;
    },
    getMessage(key: string) {
      return key;
    },
    async listCommands() {
      return [];
    },
    async openOptions() {
      // Settings are a pane of the manager page now, not a page: ADR-028.
      adapter.opened.push("manager.html#settings");
    },
    async openExternal(url: string) {
      adapter.opened.push(url);
    },
    async openExtensionPage(path: string) {
      adapter.opened.push(path);
    },
    async copyText(text: string) {
      adapter.copied.push(text);
    },
  };
  return adapter;
}

/** Terse builders, so a test reads as the browser state it describes. */
export function tab(overrides: Partial<RawTab> & { url?: string }): RawTab {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 1e6),
    index: overrides.index ?? 0,
    url: overrides.url ?? "https://example.com/",
    title: overrides.title ?? "Example",
    pinned: overrides.pinned ?? false,
    active: overrides.active ?? false,
    ...overrides,
  };
}

export function window_(overrides: Partial<RawWindow>): RawWindow {
  return {
    id: overrides.id ?? 1,
    focused: overrides.focused ?? false,
    incognito: overrides.incognito ?? false,
    type: overrides.type ?? "normal",
    tabs: overrides.tabs ?? [],
    ...overrides,
  };
}

export function group(overrides: Partial<RawGroup> & { id: number }): RawGroup {
  return {
    windowId: 1,
    title: "Group",
    color: "blue",
    collapsed: false,
    ...overrides,
  };
}
