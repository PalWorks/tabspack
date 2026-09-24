/**
 * The real adapter. Every `browser.*` call in TabsPack lives in this file or in
 * `webext.ts`. Feature availability is probed, never inferred from a browser
 * name: see `capabilities()`.
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
} from "./types.js";
import { UNHANDLED } from "./types.js";
import { browser } from "./webext.js";

const BADGE_COLOR = "#2563eb";
const OFFSCREEN_PATH = "offscreen.html";
let badgeTimer: ReturnType<typeof setTimeout> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
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
      offscreen: typeof browser.offscreen?.createDocument === "function",
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

  async copyText(text: string): Promise<void> {
    const clipboard = (globalThis.navigator as { clipboard?: { writeText(t: string): Promise<void> } })
      ?.clipboard;
    if (typeof document !== "undefined" && clipboard) {
      await clipboard.writeText(text);
      return;
    }
    await copyViaOffscreen(text);
  },
};

/**
 * Clipboard write from the service worker, which has no DOM. The offscreen
 * document closes itself once the write completes.
 */
async function copyViaOffscreen(text: string): Promise<void> {
  const offscreen = browser.offscreen;
  if (!offscreen) throw new Error("This browser cannot copy from the background.");
  if (!(await offscreen.hasDocument())) {
    await offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["CLIPBOARD"],
      justification: "Write the exported tab list to the clipboard.",
    });
  }
  const response = (await browser.runtime.sendMessage({
    type: "OFFSCREEN_COPY",
    text,
  })) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "The clipboard write failed.");
}

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
};
