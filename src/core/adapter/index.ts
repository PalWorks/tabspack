/**
 * The real adapter. Every `browser.*` call in TabsPack lives in this file or in
 * `webext.ts`. Feature availability is probed, never inferred from a browser
 * name: see `capabilities()`.
 */
import type {
  BadgeTone,
  BrowserAdapter,
  Capabilities,
  ClosedItem,
  CreateTabRequest,
  CreateWindowRequest,
  DownloadRequest,
  PlatformInfo,
  RawGroup,
  RawTab,
  RawWindow,
  TabMove,
  TabQuery,
  UpdateGroupRequest,
  UpdateTabRequest,
  UpdateWindowRequest,
} from "./types.js";
import { browser } from "./webext.js";

/*
 * Badge colours are browser chrome, not page CSS, so they are literals rather
 * than tokens. Chosen from the same palette as `theme.css` and checked against
 * white badge text: ADR-033.
 */
const BADGE_COLOURS: Record<BadgeTone, string> = {
  working: "#2563eb",
  success: "#15803d",
  failure: "#b91c1c",
};
let badgeTimer: ReturnType<typeof setTimeout> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

/**
 * Drops undefined members. Chromium rejects a call carrying a property it does
 * not recognise, and an explicit `undefined` counts as carrying it.
 */
function compact(request: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Browser name and version for the `source` block of an exported file. This is
 * provenance written into a document, not a behaviour switch, which is why
 * reading the user agent here does not break the no sniffing rule.
 */
async function detectBrowser(): Promise<{ name: string; version: string }> {
  if (typeof browser.runtime.getBrowserInfo === "function") {
    try {
      const info = await browser.runtime.getBrowserInfo();
      return { name: info.name, version: info.version };
    } catch {
      /* fall through to the user agent */
    }
  }
  const nav = globalThis.navigator as
    | { userAgent?: string; userAgentData?: { brands?: { brand: string; version: string }[] } }
    | undefined;
  const brands = nav?.userAgentData?.brands ?? [];
  const named = brands.find(
    (b) => !/not.a.brand/i.test(b.brand) && !/^chromium$/i.test(b.brand),
  );
  if (named) return { name: named.brand, version: named.version };
  const ua = nav?.userAgent ?? "";
  const match =
    /(Edg|OPR|Vivaldi|Firefox|Chrome)\/([\d.]+)/.exec(ua) ?? null;
  if (!match) return { name: "unknown", version: "unknown" };
  const label = { Edg: "Microsoft Edge", OPR: "Opera" }[match[1] ?? ""] ?? match[1] ?? "unknown";
  return { name: label, version: match[2] ?? "unknown" };
}

export const realAdapter: BrowserAdapter = {
  async platform(): Promise<PlatformInfo> {
    const detected = await detectBrowser();
    let os = "unknown";
    if (typeof browser.runtime.getPlatformInfo === "function") {
      try {
        os = (await browser.runtime.getPlatformInfo()).os;
      } catch {
        /* keep unknown */
      }
    }
    return {
      browser: detected.name,
      browserVersion: detected.version,
      os,
      extensionVersion: browser.runtime.getManifest().version,
    };
  },

  async capabilities(): Promise<Capabilities> {
    return {
      tabGroups: typeof browser.tabGroups?.query === "function",
      containers: typeof browser.contextualIdentities !== "undefined",
      downloads: typeof browser.downloads?.download === "function",
      windowBounds: typeof browser.windows?.update === "function",
      commands: typeof browser.commands?.getAll === "function",
      alarms: typeof browser.alarms?.create === "function",
      sessions: typeof browser.sessions?.getRecentlyClosed === "function",
      // No API reports whether tabs.create accepts `discarded`. Resolved when a
      // restore first needs it, in M2.
      discardOnCreate: null,
    };
  },

  async getWindows(populate: boolean): Promise<RawWindow[]> {
    const windows = await browser.windows.getAll({ populate });
    return windows as RawWindow[];
  },

  async getCurrentWindow(populate: boolean): Promise<RawWindow> {
    const win = await browser.windows.getCurrent({ populate });
    return win as RawWindow;
  },

  async queryTabs(query: TabQuery): Promise<RawTab[]> {
    const tabs = await browser.tabs.query(asRecord(query));
    return tabs as RawTab[];
  },

  async queryGroups(windowId?: number): Promise<RawGroup[]> {
    if (typeof browser.tabGroups?.query !== "function") return [];
    try {
      const query = windowId === undefined ? {} : { windowId };
      const groups = await browser.tabGroups.query(query);
      return groups as RawGroup[];
    } catch {
      return [];
    }
  },

  async createWindow(request: CreateWindowRequest): Promise<RawWindow> {
    const created = await browser.windows.create(compact(request as unknown as Record<string, unknown>));
    return created as RawWindow;
  },

  async createTab(request: CreateTabRequest): Promise<RawTab> {
    const created = await browser.tabs.create(compact(request as unknown as Record<string, unknown>));
    return created as RawTab;
  },

  async updateTab(tabId: number, request: UpdateTabRequest): Promise<void> {
    await browser.tabs.update(tabId, compact(request as unknown as Record<string, unknown>));
  },

  async removeTabs(tabIds: number[]): Promise<void> {
    if (tabIds.length === 0) return;
    await browser.tabs.remove(tabIds);
  },

  /**
   * Discarding is a courtesy to the machine, never a requirement of the restore,
   * so a browser that refuses leaves the tab loaded and the restore continues.
   */
  async getTab(tabId: number): Promise<RawTab | null> {
    try {
      return (await browser.tabs.get(tabId)) as RawTab;
    } catch {
      return null;
    }
  },

  /**
   * Chromium answers with a **new tab object**, because unloading replaces the
   * tab and its id; Gecko answers with nothing and keeps the id. Both are
   * reported the same way, so the caller never has to know which engine it is
   * on: see ADR-025.
   */
  async discardTabs(tabIds: number[]): Promise<TabMove[]> {
    if (tabIds.length === 0 || typeof browser.tabs.discard !== "function") return [];
    const moved: TabMove[] = [];
    for (const tabId of tabIds) {
      try {
        const result = (await browser.tabs.discard(tabId)) as { id?: number } | undefined;
        moved.push({ from: tabId, to: typeof result?.id === "number" ? result.id : tabId });
      } catch {
        /* a tab the browser will not unload stays loaded, and is not counted */
      }
    }
    return moved;
  },

  async groupTabs(request: { tabIds: number[]; windowId?: number }): Promise<number | null> {
    if (typeof browser.tabs.group !== "function" || request.tabIds.length === 0) return null;
    try {
      const options: Record<string, unknown> = { tabIds: request.tabIds };
      if (request.windowId !== undefined) options["createProperties"] = { windowId: request.windowId };
      return await browser.tabs.group(options);
    } catch {
      return null;
    }
  },

  async updateGroup(groupId: number, request: UpdateGroupRequest): Promise<void> {
    if (typeof browser.tabGroups?.update !== "function") return;
    await browser.tabGroups.update(groupId, compact(request as unknown as Record<string, unknown>));
  },

  async updateWindow(windowId: number, request: UpdateWindowRequest): Promise<void> {
    await browser.windows.update(windowId, compact(request as unknown as Record<string, unknown>));
  },

  async isAllowedFileSchemeAccess(): Promise<boolean> {
    try {
      const fn = browser.extension?.isAllowedFileSchemeAccess;
      if (typeof fn !== "function") return false;
      return await fn.call(browser.extension);
    } catch {
      return false;
    }
  },

  async hasPermissions(permissions: string[]): Promise<boolean> {
    try {
      return await browser.permissions.contains({ permissions });
    } catch {
      return false;
    }
  },

  async requestPermissions(permissions: string[]): Promise<boolean> {
    try {
      return await browser.permissions.request({ permissions });
    } catch {
      return false;
    }
  },

  async hasOrigins(origins: string[]): Promise<boolean> {
    try {
      return await browser.permissions.contains({ origins });
    } catch {
      return false;
    }
  },

  async requestOrigins(origins: string[], dataCollection: string[] = []): Promise<boolean> {
    try {
      /*
       * Firefox's built-in data consent, which AMO requires of new extensions:
       * a manifest that declares optional data collection has to ask for it at
       * the moment it is used. Detected from our own manifest, synchronously,
       * so the request stays inside the click that caused it.
       */
      const gecko = (browser.runtime.getManifest() as { browser_specific_settings?: { gecko?: { data_collection_permissions?: unknown } } })
        .browser_specific_settings?.gecko;
      const consent = gecko?.data_collection_permissions !== undefined && dataCollection.length > 0;
      return await browser.permissions.request(consent ? { origins, data_collection: dataCollection } : { origins });
    } catch {
      // A browser that refuses the call outright is a browser with no host
      // access, which the caller handles the same way as a declined prompt.
      return false;
    }
  },

  async isAllowedIncognitoAccess(): Promise<boolean> {
    try {
      const fn = browser.extension?.isAllowedIncognitoAccess;
      if (typeof fn !== "function") return false;
      return await fn.call(browser.extension);
    } catch {
      return false;
    }
  },

  async download(request: DownloadRequest): Promise<number | null> {
    if (typeof browser.downloads?.download !== "function") return null;
    return await browser.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: request.saveAs ?? false,
    });
  },

  async storageGet<T extends Record<string, unknown>>(defaults: T): Promise<T> {
    const stored = await browser.storage.local.get(defaults);
    return { ...defaults, ...stored } as T;
  },

  async storageSet(values: Record<string, unknown>): Promise<void> {
    await browser.storage.local.set(values);
  },

  async storageRemove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await browser.storage.local.remove(keys);
  },

  /**
   * `get(null)` is the only form that returns everything: `get({})` returns an
   * empty object, which is a trap worth naming here rather than rediscovering.
   */
  async storageGetAll(): Promise<Record<string, unknown>> {
    return await browser.storage.local.get(null);
  },

  onStorageChanged(handler: (keys: string[]) => void): void {
    browser.storage.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;
      handler(Object.keys(changes ?? {}));
    });
  },

  async storageBytesInUse(): Promise<number | null> {
    const fn = browser.storage.local.getBytesInUse;
    if (typeof fn !== "function") return null;
    try {
      return await fn.call(browser.storage.local, null);
    } catch {
      return null;
    }
  },

  async setBadge(text: string, durationMs?: number, tone: BadgeTone = "working"): Promise<void> {
    const action = browser.action;
    if (!action) return;
    try {
      await action.setBadgeBackgroundColor({ color: BADGE_COLOURS[tone] });
      // Not every engine has this, and a missing text colour is not a failure.
      await action.setBadgeTextColor?.({ color: "#ffffff" }).catch(() => undefined);
      await action.setBadgeText({ text });
    } catch {
      return;
    }
    if (badgeTimer) clearTimeout(badgeTimer);
    if (text !== "" && durationMs && durationMs > 0) {
      badgeTimer = setTimeout(() => {
        action.setBadgeText({ text: "" }).catch(() => undefined);
        badgeTimer = null;
      }, durationMs);
    }
  },

  /**
   * The tooltip on the toolbar icon. It is the only place a full sentence fits
   * on the toolbar, so it carries what happened while the badge carries that
   * something did. Cleared back to the extension name by passing an empty
   * string: ADR-033.
   */
  async setActionTitle(title: string): Promise<void> {
    const action = browser.action;
    if (!action?.setTitle) return;
    try {
      await action.setTitle({ title: title === "" ? realAdapter.getMessage("brandName") : title });
    } catch {
      return;
    }
  },

  extensionUrl(path: string): string {
    return browser.runtime.getURL(path);
  },

  /**
   * An empty string means the key is missing from `_locales/en/messages.json`,
   * and the key itself is returned so a missing string is visible on screen
   * rather than being an invisible gap.
   */
  getMessage(key: string, subs?: string[]): string {
    const found = browser.i18n?.getMessage(key, subs) ?? "";
    return found === "" ? key : found;
  },

  async listCommands(): Promise<{ name: string; shortcut: string; description: string }[]> {
    if (typeof browser.commands?.getAll !== "function") return [];
    try {
      const commands = (await browser.commands.getAll()) as {
        name?: string;
        shortcut?: string;
        description?: string;
      }[];
      return commands
        .filter((command) => typeof command.name === "string" && !command.name.startsWith("_"))
        .map((command) => ({
          name: command.name as string,
          shortcut: command.shortcut ?? "",
          description: command.description ?? "",
        }));
    } catch {
      return [];
    }
  },

  /**
   * Settings are a pane of the manager page, not a page of their own: ADR-028.
   * `runtime.openOptionsPage` is not used, because a browser that finds a
   * manager tab already open focuses it without changing the fragment, and the
   * user who pressed the gear would land on whatever pane it was showing.
   */
  async openOptions(): Promise<void> {
    await realAdapter.openExtensionPage("manager.html#settings");
  },

  async openExtensionPage(path: string): Promise<void> {
    const url = browser.runtime.getURL(path);
    await browser.tabs.create({ url });
  },

  /**
   * An address that is not ours, opened as it was given. `mailto:` hands off to
   * the operating system's mail client and may open no tab at all, which is
   * success rather than failure, so a refusal is reported by throwing and the
   * caller decides what to say: ADR-038.
   */
  async openExternal(url: string): Promise<void> {
    await browser.tabs.create({ url });
  },

  /**
   * The clipboard is only ever written from a page. The background has no DOM and
   * no clipboard, and nothing in TabsPack asks it to copy: see ADR-021.
   */
  async copyText(text: string): Promise<void> {
    const clipboard = (globalThis.navigator as { clipboard?: { writeText(t: string): Promise<void> } })
      ?.clipboard;
    if (typeof document === "undefined" || !clipboard) {
      throw new Error("Copying works from the TabsPack pages, not from the background.");
    }
    await clipboard.writeText(text);
  },

  async sessionGet(key: string) {
    const area = browser.storage.session;
    if (!area) return null;
    try {
      return (await area.get(key))[key] ?? null;
    } catch {
      return null;
    }
  },

  async sessionSet(values: Record<string, unknown>) {
    await browser.storage.session?.set(values).catch(() => undefined);
  },

  async alarmGet(name: string) {
    const found = await browser.alarms?.get(name);
    return found ? { name: found.name, scheduledTime: found.scheduledTime, ...(found.periodInMinutes ? { periodInMinutes: found.periodInMinutes } : {}) } : null;
  },

  async alarmCreate(name, when) {
    await browser.alarms?.create(name, compact(when));
  },

  async alarmClear(name: string) {
    await browser.alarms?.clear(name);
  },

  async recentlyClosed() {
    if (typeof browser.sessions?.getRecentlyClosed !== "function") return null;
    try {
      const raw = await browser.sessions.getRecentlyClosed({ maxResults: 25 });
      return raw.map((entry) => closedItem(asRecord(entry)));
    } catch {
      return null;
    }
  },

  async restoreClosed(sessionId: string) {
    await browser.sessions?.restore(sessionId);
  },
};

/**
 * A recently closed entry. Chromium reports `lastModified` in seconds and Gecko
 * in milliseconds, so anything that could only be seconds is scaled.
 */
function closedItem(entry: Record<string, unknown>): ClosedItem {
  const stamp = typeof entry["lastModified"] === "number" ? entry["lastModified"] : 0;
  const closedAt = stamp > 0 && stamp < 1e11 ? stamp * 1000 : stamp;
  const tabOf = (value: unknown): { url: string; title: string; sessionId?: string } => {
    const tab = asRecord(value);
    return {
      url: typeof tab["url"] === "string" ? tab["url"] : "",
      title: typeof tab["title"] === "string" ? tab["title"] : "",
      ...(typeof tab["sessionId"] === "string" ? { sessionId: tab["sessionId"] } : {}),
    };
  };
  if (entry["window"]) {
    const win = asRecord(entry["window"]);
    const tabs = Array.isArray(win["tabs"]) ? win["tabs"].map(tabOf) : [];
    return {
      sessionId: typeof win["sessionId"] === "string" ? win["sessionId"] : null,
      closedAt,
      kind: "window",
      tabs: tabs.map(({ url, title }) => ({ url, title })),
    };
  }
  const tab = tabOf(entry["tab"]);
  return { sessionId: tab.sessionId ?? null, closedAt, kind: "tab", tabs: [{ url: tab.url, title: tab.title }] };
}

/**
 * Lifecycle listeners, for the background only.
 *
 * There is deliberately no message listener. Nothing in TabsPack sends a runtime
 * message: every page has the extension APIs directly, so a router would be a
 * second way to do what the first way already does, and a listener is a surface
 * that has to be defended.
 */
export const events = {
  onInstalled(handler: (reason: string | undefined) => void): void {
    browser.runtime.onInstalled.addListener((details) => handler(details?.reason));
  },
  /** Keyboard commands, declared in the manifest and rebindable by the user. */
  onCommand(handler: (command: string) => void): void {
    browser.commands?.onCommand?.addListener((command) => handler(command));
  },
  /** The browser starting with this profile, which is when a lost session shows. */
  onStartup(handler: () => void): void {
    browser.runtime.onStartup?.addListener(() => handler());
  },
  onAlarm(handler: (name: string) => void): void {
    browser.alarms?.onAlarm.addListener((alarm) => handler(alarm.name));
  },
  /**
   * Any change to what the tab strip holds: a tab opened, closed, moved,
   * attached or detached, or one whose address, title, pinned state or group
   * changed. Loading progress and activation are not changes to the session.
   * A tab closed because its window is closing is reported, with `closing`, so
   * a browser shutting down can be told apart from a person closing tabs.
   */
  onTabsChanged(handler: (change: { closing: boolean }) => void): void {
    const tabs = browser.tabs;
    const changed = (): void => handler({ closing: false });
    tabs.onCreated?.addListener(changed);
    tabs.onMoved?.addListener(changed);
    tabs.onAttached?.addListener(changed);
    tabs.onDetached?.addListener(changed);
    tabs.onRemoved?.addListener((_id, info) => handler({ closing: Boolean(info?.isWindowClosing) }));
    tabs.onUpdated?.addListener((_id, info) => {
      if ("url" in info || "title" in info || "pinned" in info || "groupId" in info) changed();
    });
  },
};
