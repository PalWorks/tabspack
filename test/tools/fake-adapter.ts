/**
 * A browser that only exists in node. Everything in `src/core/` takes the
 * adapter as a parameter, so the whole export pipeline is testable without a
 * browser: that is the point of the boundary rule in AGENTS.md.
 */
import type {
  BrowserAdapter,
  Capabilities,
  DownloadRequest,
  PlatformInfo,
  RawGroup,
  RawTab,
  RawWindow,
  TabQuery,
} from "../../src/core/adapter/types.js";

export interface FakeState {
  windows: RawWindow[];
  groups: RawGroup[];
  capabilities?: Partial<Capabilities>;
  platform?: Partial<PlatformInfo>;
  incognitoAllowed?: boolean;
  storage?: Record<string, unknown>;
  failDownload?: boolean;
}

export interface FakeAdapter extends BrowserAdapter {
  downloads: DownloadRequest[];
  copied: string[];
  badges: { text: string; durationMs?: number }[];
  opened: string[];
  state: FakeState;
}

const DEFAULT_CAPABILITIES: Capabilities = {
  tabGroups: true,
  containers: false,
  offscreen: true,
  downloads: true,
  windowBounds: true,
  commands: true,
  discardOnCreate: null,
};

const DEFAULT_PLATFORM: PlatformInfo = {
  browser: "Chrome",
  browserVersion: "141.0.0.0",
  os: "linux",
  extensionVersion: "0.0.1",
};

export function createFakeAdapter(state: FakeState): FakeAdapter {
  const storage: Record<string, unknown> = { ...(state.storage ?? {}) };
  const adapter: FakeAdapter = {
    state,
    downloads: [],
    copied: [],
    badges: [],
    opened: [],

    async platform() {
      return { ...DEFAULT_PLATFORM, ...(state.platform ?? {}) };
    },
    async capabilities() {
      return { ...DEFAULT_CAPABILITIES, ...(state.capabilities ?? {}) };
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
      const tabs = (focused?.tabs ?? []) as RawTab[];
      if (query.active) return tabs.filter((tab) => tab.active);
      if (query.highlighted) return tabs.filter((tab) => tab.highlighted || tab.active);
      return tabs;
    },
    async queryGroups(windowId?: number) {
      const caps = await adapter.capabilities();
      if (!caps.tabGroups) return [];
      return state.groups.filter((group: RawGroup) =>
        windowId === undefined ? true : group.windowId === windowId,
      );
    },
    async hasPermissions() {
      return true;
    },
    async requestPermissions() {
      return true;
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
    },
    async setBadge(text: string, durationMs?: number) {
      adapter.badges.push({ text, durationMs });
    },
    async sendMessage() {
      return undefined;
    },
    extensionUrl(path: string) {
      return `chrome-extension://fake/${path}`;
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
