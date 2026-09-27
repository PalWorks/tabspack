/**
 * Durability, M9: automatic snapshots (B-101) and the recovery copy (B-102).
 *
 * The worker calls these when an alarm or the browser wakes it. It holds no
 * state in memory, because the browser terminates it when idle, so everything
 * it knows between wakes is in `storage.local` under the keys below.
 *
 * Nothing here opens a tab. A recovered session goes to the import preview,
 * and the user restores it from there: DOMAIN business rule 4.
 */
import type { BrowserAdapter } from "./adapter/types.js";
import type { Session } from "../types/session.js";
import { countSession } from "../types/session.js";
import { collectSession } from "./collect.js";
import { loadPack } from "./import.js";
import { stringify, toFile } from "./serialize.js";
import type { Settings } from "./settings.js";
import {
  SOFT_CAP_BYTES,
  defaultSnapshotName,
  deleteSnapshot,
  listSnapshots,
  saveSnapshot,
  usage,
  type SnapshotMeta,
} from "./snapshots.js";
import { lostTabs, signature, worthOffering } from "./compare.js";

/** The one rolling copy of the open tabs. Counted in usage, never listed as a snapshot. */
export const RECOVERY_KEY = "recovery";
/** The copy as it stood when the browser last started, kept until the next start. */
export const PREVIOUS_KEY = "recoveryPrevious";
/** Set on start and cleared once the loss check has run. The copy is not overwritten meanwhile. */
export const PENDING_KEY = "recoveryPending";
/** A loss worth telling the user about, until they act on it or dismiss it. */
export const OFFER_KEY = "recoveryOffer";
/** Whether the recovery copy has been offered after a first export, decision D2. */
export const ASKED_KEY = "recoveryAsked";
/** What the automatic series last did, for the Snapshots pane. */
export const AUTO_STATE_KEY = "autoSnapshotState";

export const ALARM_RECOVERY = "tabspack-recovery";
export const ALARM_STARTUP = "tabspack-startup";
export const ALARM_AUTO = "tabspack-auto";

/**
 * How long after a change the recovery copy is written. Thirty seconds is the
 * shortest alarm Chromium allows; a storm of tab events inside it costs one
 * write, which is the point.
 */
export const RECOVERY_DELAY_MINUTES = 0.5;
/**
 * How long after the browser starts the loss check runs. The browser restores
 * its own session asynchronously, and checking before that settles would
 * report tabs that are about to reappear.
 */
export const STARTUP_DELAY_MINUTES = 0.5;

/** The tag that makes a snapshot automatic, and so part of the rolling series. */
export const AUTO_TAG = "auto";

export interface RecoveryRecord {
  capturedAt: number;
  signature: string;
  windows: number;
  tabs: number;
  /** The session as a TabsPack file, the same text a snapshot stores. */
  text: string;
}

export interface RecoveryOffer {
  /** When the lost session was last captured. */
  capturedAt: number;
  missingTabs: number;
  totalTabs: number;
  wholeWindows: number;
}

export interface AutoState {
  lastAt?: number;
  lastSignature?: string;
  /** Automatic snapshots removed by the rolling limit, ever. ADR-047 says it is counted. */
  removed: number;
  /** Why the last due snapshot was not written, when it was not. */
  blocked?: "full";
}

export function isAuto(meta: SnapshotMeta): boolean {
  return meta.tags.includes(AUTO_TAG);
}

async function captureAll(adapter: BrowserAdapter, settings: Settings, now: number): Promise<Session> {
  return await collectSession(adapter, { scope: "all_windows", includeIncognito: settings.includeIncognito, now });
}

async function read<T>(adapter: BrowserAdapter, key: string): Promise<T | null> {
  const stored = await adapter.storageGet({ [key]: null as unknown });
  return (stored[key] ?? null) as T | null;
}

/* The recovery copy, B-102 ------------------------------------------------- */

export type RecoveryWrite = "off" | "pending" | "empty" | "unchanged" | "written";

/**
 * Writes the rolling copy if the tabs changed. Never writes an empty session:
 * a browser closing its last window reports its tabs closing one by one, and a
 * copy overwritten by that would be a copy of nothing at the one moment it
 * matters.
 */
export async function writeRecovery(adapter: BrowserAdapter, settings: Settings, now = Date.now()): Promise<RecoveryWrite> {
  if (!settings.recoveryCopy) return "off";
  if (await read<boolean>(adapter, PENDING_KEY)) return "pending";
  const session = await captureAll(adapter, settings, now);
  const counts = countSession(session);
  if (counts.tabs === 0) return "empty";
  const sig = signature(session);
  const existing = await read<RecoveryRecord>(adapter, RECOVERY_KEY);
  if (existing?.signature === sig) return "unchanged";
  const record: RecoveryRecord = {
    capturedAt: now,
    signature: sig,
    windows: counts.windows,
    tabs: counts.tabs,
    text: stringify(toFile(session, { keepFavicons: false, exportedAt: new Date(now) })),
  };
  await adapter.storageSet({ [RECOVERY_KEY]: record });
  return "written";
}

/**
 * The browser has started. The copy from before is set aside as the previous
 * session, and the copy stops being written until the loss check has run, so
 * the browser's own restore cannot overwrite the evidence.
 */
export async function beginStartup(adapter: BrowserAdapter, settings: Settings): Promise<boolean> {
  if (!settings.recoveryCopy) return false;
  const copy = await read<RecoveryRecord>(adapter, RECOVERY_KEY);
  if (!copy) return false;
  await adapter.storageSet({ [PREVIOUS_KEY]: copy, [PENDING_KEY]: true });
  return true;
}

/** Reads a stored copy back into a session. Null if it is unreadable. */
export function recordSession(record: RecoveryRecord): Session | null {
  const result = loadPack(record.text, { recoverSuspended: false, now: record.capturedAt });
  return result.ok && result.session ? result.session : null;
}

/**
 * Compares the previous session with what is open now, once the browser's own
 * restore has had time to settle, and records an offer when the loss is worth
 * one. Always clears the pending flag, whatever it finds.
 */
export async function checkStartup(adapter: BrowserAdapter, settings: Settings, now = Date.now()): Promise<RecoveryOffer | null> {
  try {
    const previous = await read<RecoveryRecord>(adapter, PREVIOUS_KEY);
    if (!previous) return null;
    const before = recordSession(previous);
    if (!before) return null;
    const loss = lostTabs(before, await captureAll(adapter, settings, now));
    if (!worthOffering(loss)) {
      await adapter.storageRemove([OFFER_KEY]);
      return null;
    }
    const offer: RecoveryOffer = {
      capturedAt: previous.capturedAt,
      missingTabs: loss.missingTabs,
      totalTabs: loss.totalTabs,
      wholeWindows: loss.wholeWindows,
    };
    await adapter.storageSet({ [OFFER_KEY]: offer });
    return offer;
  } finally {
    await adapter.storageRemove([PENDING_KEY]);
  }
}

export async function readOffer(adapter: BrowserAdapter): Promise<RecoveryOffer | null> {
  return await read<RecoveryOffer>(adapter, OFFER_KEY);
}

export async function dismissOffer(adapter: BrowserAdapter): Promise<void> {
  await adapter.storageRemove([OFFER_KEY]);
}

/**
 * The previous session, and the part of it that is not open now, for the
 * preview. The missing tabs keep their windows and groups, so what is restored
 * looks the way it was.
 */
export async function readPrevious(
  adapter: BrowserAdapter,
  settings: Settings,
  now = Date.now(),
): Promise<{ record: RecoveryRecord; session: Session; missing: Session } | null> {
  const record = await read<RecoveryRecord>(adapter, PREVIOUS_KEY);
  if (!record) return null;
  const session = recordSession(record);
  if (!session) return null;
  const loss = lostTabs(session, await captureAll(adapter, settings, now));
  const windows = loss.missing.map(({ window, tabs }) => {
    const kept = tabs.map((tab, index) => ({ ...tab, index, openerIndex: null }));
    const used = new Set(kept.map((tab) => tab.groupKey).filter(Boolean));
    return { ...window, tabs: kept, groups: window.groups.filter((group) => used.has(group.key)) };
  });
  return { record, session, missing: { ...session, windows } };
}

/* Automatic snapshots, B-101 ----------------------------------------------- */

export type AutoRun = "off" | "empty" | "unchanged" | "full" | "written";

export async function readAutoState(adapter: BrowserAdapter): Promise<AutoState> {
  return (await read<AutoState>(adapter, AUTO_STATE_KEY)) ?? { removed: 0 };
}

/**
 * Writes an automatic snapshot if the tabs changed since the last one, then
 * keeps the newest `autoSnapshotKeep` automatic snapshots and removes older
 * ones: ADR-047. A manual snapshot is never removed. If there is no room even
 * after the oldest automatic ones are gone, nothing is written and the state
 * says why, which the Snapshots pane shows.
 */
export async function runAutoSnapshot(adapter: BrowserAdapter, settings: Settings, now = Date.now()): Promise<{ outcome: AutoRun; removed: string[] }> {
  if (settings.autoSnapshotHours <= 0) return { outcome: "off", removed: [] };
  const state = await readAutoState(adapter);
  const session = await captureAll(adapter, settings, now);
  const counts = countSession(session);
  if (counts.tabs === 0) return { outcome: "empty", removed: [] };
  const sig = signature(session);
  if (state.lastSignature === sig) return { outcome: "unchanged", removed: [] };

  const removed: string[] = [];
  const bytes = new TextEncoder().encode(stringify(toFile(session, { keepFavicons: false, exportedAt: new Date(now) }))).length;
  const oldestAutoFirst = (await listSnapshots(adapter)).filter(isAuto).reverse();
  let room = SOFT_CAP_BYTES - (await usage(adapter)).bytes;
  while (room < bytes && oldestAutoFirst.length > 0) {
    const oldest = oldestAutoFirst.shift() as SnapshotMeta;
    await deleteSnapshot(adapter, oldest.id);
    removed.push(oldest.id);
    room += oldest.bytes;
  }
  if (room < bytes) {
    await adapter.storageSet({ [AUTO_STATE_KEY]: { ...state, removed: state.removed + removed.length, blocked: "full" } satisfies AutoState });
    return { outcome: "full", removed };
  }

  const when = new Date(now);
  await saveSnapshot(adapter, session, {
    name: adapter.getMessage("autoSnapshotName", [defaultSnapshotName(when, counts)]) || `Automatic, ${defaultSnapshotName(when, counts)}`,
    tags: [AUTO_TAG],
    now: when,
  });
  const series = (await listSnapshots(adapter)).filter(isAuto);
  for (const extra of series.slice(settings.autoSnapshotKeep)) {
    await deleteSnapshot(adapter, extra.id);
    removed.push(extra.id);
  }
  const next: AutoState = { lastAt: now, lastSignature: sig, removed: state.removed + removed.length };
  await adapter.storageSet({ [AUTO_STATE_KEY]: next });
  return { outcome: "written", removed };
}

/* Alarms --------------------------------------------------------------------- */

/**
 * Brings the alarms in line with the settings: the automatic series has a
 * repeating alarm when it is on and none when it is off, and a pending
 * recovery write is dropped when the copy is turned off. Called on install, on
 * start, and whenever the settings change.
 */
export async function reconcileAlarms(adapter: BrowserAdapter, settings: Settings): Promise<void> {
  const period = settings.autoSnapshotHours * 60;
  const current = await adapter.alarmGet(ALARM_AUTO);
  if (period <= 0) {
    if (current) await adapter.alarmClear(ALARM_AUTO);
  } else if (current?.periodInMinutes !== period) {
    await adapter.alarmCreate(ALARM_AUTO, { delayInMinutes: period, periodInMinutes: period });
  }
  if (!settings.recoveryCopy) {
    await adapter.alarmClear(ALARM_RECOVERY);
    await adapter.storageRemove([PENDING_KEY]);
  }
}

/** A tab changed: write the copy once things are quiet, if nothing is already scheduled. */
export async function scheduleRecovery(adapter: BrowserAdapter, settings: Settings): Promise<boolean> {
  if (!settings.recoveryCopy) return false;
  if (await adapter.alarmGet(ALARM_RECOVERY)) return false;
  await adapter.alarmCreate(ALARM_RECOVERY, { delayInMinutes: RECOVERY_DELAY_MINUTES });
  return true;
}
