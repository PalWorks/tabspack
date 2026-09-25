/**
 * The real adapter. Every `browser.*` call in TabsPack lives in this file or in
 * `webext.ts`. Feature availability is probed, never inferred from a browser
 * name: see `capabilities()`.
 */
import type {
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
} from "./types.js";
import { UNHANDLED } from "./types.js";
import { browser } from "./webext.js";

const BADGE_COLOR = "#2563eb";
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
  async discardTabs(tabIds: number[]): Promise<void> {
    if (tabIds.length === 0 || typeof browser.tabs.discard !== "function") return;
    for (const tabId of tabIds) {
      try {
        await browser.tabs.discard(tabId);
      } catch {
        /* a tab the browser will not unload stays loaded */
      }
    }
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

  async setBadge(text: string, durationMs?: number): Promise<void> {
    const action = browser.action;
    if (!action) return;
    try {
      await action.setBadgeBackgroundColor({ color: BADGE_COLOR });
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

  async sendMessage<T = unknown>(message: unknown): Promise<T | undefined> {
    try {
      return (await browser.runtime.sendMessage(message)) as T;
    } catch {
      return undefined;
    }
  },

  extensionUrl(path: string): string {
    return browser.runtime.getURL(path);
  },

  async openExtensionPage(path: string): Promise<void> {
    const url = browser.runtime.getURL(path);
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
};

/** Message and lifecycle listeners, for the service worker only. */
export const events = {
  onMessage(
    handler: (message: unknown, senderId: string | undefined) => Promise<unknown> | unknown,
  ): void {
    browser.runtime.onMessage.addListener((message, sender, respond) => {
      if (sender?.id && sender.id !== browser.runtime.id) {
        respond({ ok: false, error: "unauthorized_sender" });
        return false;
      }
      const outcome = handler(message, sender?.id);
      if (outcome === UNHANDLED) return false;
      Promise.resolve(outcome)
        .then((result) => {
          if (result === UNHANDLED) return;
          respond(result);
        })
        .catch((error: unknown) =>
          respond({ ok: false, error: error instanceof Error ? error.message : String(error) }),
        );
      return true;
    });
  },
  onInstalled(handler: (reason: string | undefined) => void): void {
    browser.runtime.onInstalled.addListener((details) => handler(details?.reason));
  },
  /** Keyboard commands, declared in the manifest and rebindable by the user. */
  onCommand(handler: (command: string) => void): void {
    browser.commands?.onCommand?.addListener((command) => handler(command));
  },
};
