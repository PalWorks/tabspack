/**
 * Settings and their defaults. Defaults live here only, and are merged on read,
 * so adding a setting never needs a storage migration.
 */
import type { BrowserAdapter } from "./adapter/types.js";
import type { Scope } from "../types/session.js";

export type ExportFormat = "tabspack" | "urls" | "flatjson";
export type SortMode = "natural" | "title" | "url" | "domain";

export interface Settings {
  /** Default capture scope. */
  scope: Scope;
  /** Default export format. */
  format: ExportFormat;
  /** Write titles into the plain text export. ADR-011. */
  textIncludeTitles: boolean;
  /** Keep favicon URLs in the file. `data:` icons are stripped either way unless this is on. */
  keepFavicons: boolean;
  /** Include private windows. Also requires the browser level incognito grant. */
  includeIncognito: boolean;
  dedupe: boolean;
  webPagesOnly: boolean;
  skipPinned: boolean;
  /** Newline separated wildcard patterns. */
  excludeList: string;
  sort: SortMode;
  sortDesc: boolean;
  /** Milliseconds the toolbar badge shows a count. */
  badgeMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  scope: "all_windows",
  format: "tabspack",
  textIncludeTitles: false,
  keepFavicons: true,
  includeIncognito: false,
  dedupe: true,
  webPagesOnly: false,
  skipPinned: false,
  excludeList: "",
  sort: "natural",
  sortDesc: false,
  badgeMs: 1500,
};

const STORAGE_KEY = "settings";

export async function loadSettings(adapter: BrowserAdapter): Promise<Settings> {
  const stored = await adapter.storageGet({ [STORAGE_KEY]: {} as Partial<Settings> });
  const raw = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  return mergeSettings(raw);
}

export async function saveSettings(
  adapter: BrowserAdapter,
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await loadSettings(adapter);
  const next = mergeSettings({ ...current, ...patch });
  await adapter.storageSet({ [STORAGE_KEY]: next });
  return next;
}

/** Unknown keys are dropped and unknown values fall back to the default. */
export function mergeSettings(raw: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return merged;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
    // Narrowing per key would need a switch of no value: the type check above
    // plus the enum guards below are the contract.
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  if (!["all_windows", "current_window", "current_tab", "selection"].includes(merged.scope)) {
    merged.scope = DEFAULT_SETTINGS.scope;
  }
  if (!["tabspack", "urls", "flatjson"].includes(merged.format)) {
    merged.format = DEFAULT_SETTINGS.format;
  }
  if (!["natural", "title", "url", "domain"].includes(merged.sort)) {
    merged.sort = DEFAULT_SETTINGS.sort;
  }
  if (!Number.isFinite(merged.badgeMs) || merged.badgeMs < 0) {
    merged.badgeMs = DEFAULT_SETTINGS.badgeMs;
  }
  return merged;
}
