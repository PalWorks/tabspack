/**
 * Settings and their defaults. Defaults live here only, and are merged on read,
 * so adding a setting never needs a storage migration.
 */
import type { BrowserAdapter } from "./adapter/types.js";
import type { Scope } from "../types/session.js";
import type { RestoreTarget } from "./restore.js";

export type ExportFormat = "tabspack" | "urls" | "flatjson";
export type SortMode = "natural" | "title" | "url" | "domain";
export type Theme = "system" | "light" | "dark";

export interface Settings {
  /** Default capture scope. */
  scope: Scope;
  /** Default export format. */
  format: ExportFormat;
  /**
   * Write titles into the plain text export. On by default: a URL list with no
   * titles is a list of strings nobody can read, and the one reason to export
   * as text is to read it. ADR-011 and ADR-032.
   */
  textIncludeTitles: boolean;
  /**
   * Keep favicon URLs in the file. Off by default, because nothing reads them:
   * the preview does not show icons, no browser lets an extension set one on a
   * restored tab, and the browser fetches the real icon when the page loads.
   * Measured at 7 to 9 percent of a real file for no effect. Kept as a switch
   * because the format is public and another tool may want them. ADR-032.
   */
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
  /**
   * Drop tabs not opened within this many days. `0` is off, and off is the
   * default: a filter that silently removed tabs on first run would be the
   * worst surprise in the product. A pinned tab and a tab with no timestamp are
   * never dropped, whatever this says. B-202.
   */
  staleDays: number;
  /**
   * Recover the real address of a tab a suspender has parked on one of its own
   * pages, on export and on import. ADR-023.
   */
  recoverSuspended: boolean;

  /* Restore policy, FR-403. Every one of these is a real browser trade off. */
  /** Where a restore puts its tabs. */
  restoreTarget: RestoreTarget;
  /**
   * Restore every tab unloaded, rather than only those beyond the threshold.
   * The people who move seventy tabs between browsers are the people who cannot
   * afford seventy pages loading at once: ADR-024.
   */
  unloadRestored: boolean;
  /** Tabs beyond this many are restored unloaded, when `unloadRestored` is off. FR-208. */
  discardThreshold: number;
  /** Tabs created between yields to the browser. */
  restoreBatchSize: number;
  /** Pause between batches, which is what keeps the browser responsive. */
  restoreDelayMs: number;
  /** Skip a tab from the pack that is already open. FR-205. */
  skipOpenDuplicates: boolean;
  /** Open the page listing addresses no extension may open. FR-204. */
  openPlaceholder: boolean;

  /** Light, dark or whatever the operating system says. FR-405. */
  theme: Theme;

  /* Durability, M9. */
  /**
   * Keep one rolling copy of the open tabs, so a crash or a browser that did
   * not restore its session can be recovered, and so the last few sessions
   * are kept (B-104). On at install, with no prompt: B-102, decision D2 as
   * revised by the maintainer on 2026-09-28. It never leaves the device.
   */
  recoveryCopy: boolean;
  /** Hours between automatic snapshots. `0` is off, the default. B-101. */
  autoSnapshotHours: number;
  /** How many automatic snapshots are kept. Older ones are removed: ADR-047. */
  autoSnapshotKeep: number;
}

/** The intervals the Snapshots pane offers. Anything else falls back to off. */
export const AUTO_SNAPSHOT_HOURS = [0, 1, 4, 24] as const;

export const DEFAULT_SETTINGS: Settings = {
  scope: "all_windows",
  format: "tabspack",
  textIncludeTitles: true,
  keepFavicons: false,
  includeIncognito: false,
  dedupe: true,
  webPagesOnly: false,
  skipPinned: false,
  excludeList: "",
  sort: "natural",
  sortDesc: false,
  staleDays: 0,
  recoverSuspended: true,

  restoreTarget: "new_windows",
  unloadRestored: true,
  discardThreshold: 20,
  restoreBatchSize: 8,
  restoreDelayMs: 40,
  skipOpenDuplicates: true,
  openPlaceholder: true,

  theme: "system",

  recoveryCopy: true,
  autoSnapshotHours: 0,
  autoSnapshotKeep: 10,
};

/**
 * Bounds for the numeric settings. A value outside its range falls back to the
 * default rather than being clamped: clamping would silently keep a value the
 * user never chose, and a restore delay of an hour is a typo, not an intention.
 */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  // Ten years. Past that the filter would drop nothing, so a larger number is a
  // typo rather than an intention.
  staleDays: { min: 0, max: 3650 },
  discardThreshold: { min: 0, max: 10_000 },
  restoreBatchSize: { min: 1, max: 100 },
  restoreDelayMs: { min: 0, max: 5_000 },
  autoSnapshotKeep: { min: 1, max: 100 },
};

const STORAGE_KEY = "settings";

export async function loadSettings(adapter: BrowserAdapter): Promise<Settings> {
  const stored = await adapter.storageGet({ [STORAGE_KEY]: {} as Partial<Settings> });
  const raw = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  return mergeSettings(raw);
}

/**
 * Writes are serialised through one chain. Every control on the options page
 * writes the moment it changes, and two of them changing within a millisecond
 * would otherwise both read the same stored object and the second would write
 * the first's change back out.
 */
let writes: Promise<unknown> = Promise.resolve();

export async function saveSettings(
  adapter: BrowserAdapter,
  patch: Partial<Settings>,
): Promise<Settings> {
  const next = writes.then(async () => {
    const current = await loadSettings(adapter);
    const merged = mergeSettings({ ...current, ...patch });
    await adapter.storageSet({ [STORAGE_KEY]: merged });
    return merged;
  });
  // The chain must survive a failed write, or every later write is skipped.
  writes = next.catch(() => undefined);
  return await next;
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
  if (!["new_windows", "current_window"].includes(merged.restoreTarget)) {
    merged.restoreTarget = DEFAULT_SETTINGS.restoreTarget;
  }
  if (!["system", "light", "dark"].includes(merged.theme)) {
    merged.theme = DEFAULT_SETTINGS.theme;
  }
  if (!(AUTO_SNAPSHOT_HOURS as readonly number[]).includes(merged.autoSnapshotHours)) {
    merged.autoSnapshotHours = DEFAULT_SETTINGS.autoSnapshotHours;
  }
  for (const [key, limit] of Object.entries(NUMERIC_LIMITS)) {
    const current = (merged as unknown as Record<string, unknown>)[key];
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    const usable =
      typeof current === "number" &&
      Number.isFinite(current) &&
      current >= limit.min &&
      current <= limit.max;
    (merged as unknown as Record<string, unknown>)[key] = usable ? Math.round(current) : fallback;
  }
  return merged;
}
