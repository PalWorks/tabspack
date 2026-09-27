/**
 * The worker's half of durability, M9: what happens when a tab changes, when
 * the browser starts, when an alarm fires, and when a setting changes.
 *
 * Every entry point reads the settings afresh, because the worker keeps
 * nothing between wakes. When both features are off, a tab event costs one
 * storage read and nothing else.
 */
import type { BrowserAdapter } from "../core/adapter/types.js";
import {
  ALARM_AUTO,
  ALARM_RECOVERY,
  ALARM_STARTUP,
  STARTUP_DELAY_MINUTES,
  beginStartup,
  checkStartup,
  reconcileAlarms,
  runAutoSnapshot,
  scheduleRecovery,
  writeRecovery,
} from "../core/durability.js";
import { loadSettings } from "../core/settings.js";

/** A recovery offer stays on the toolbar until the user acts on it. */
const OFFER_BADGE = "↺";

export async function onTabsChanged(adapter: BrowserAdapter, change: { closing: boolean }): Promise<void> {
  // A window closing, which is also what a browser shutting down looks like,
  // must never be what the copy remembers. The next real change writes it.
  if (change.closing) return;
  const settings = await loadSettings(adapter);
  await scheduleRecovery(adapter, settings);
}

export async function onStartup(adapter: BrowserAdapter): Promise<void> {
  const settings = await loadSettings(adapter);
  await reconcileAlarms(adapter, settings);
  if (await beginStartup(adapter, settings)) {
    await adapter.alarmCreate(ALARM_STARTUP, { delayInMinutes: STARTUP_DELAY_MINUTES });
  }
}

export async function onAlarm(adapter: BrowserAdapter, name: string): Promise<string> {
  const settings = await loadSettings(adapter);
  if (name === ALARM_RECOVERY) {
    const outcome = await writeRecovery(adapter, settings);
    // Still waiting on the start check: try again once it has run.
    if (outcome === "pending") await scheduleRecovery(adapter, settings);
    return `recovery copy: ${outcome}`;
  }
  if (name === ALARM_STARTUP) {
    const offer = await checkStartup(adapter, settings);
    if (offer) {
      await adapter.setBadge(OFFER_BADGE, 0, "working");
      await adapter.setActionTitle(adapter.getMessage("recoveryBadgeTitle", [String(offer.missingTabs)]));
    }
    await scheduleRecovery(adapter, settings);
    return offer ? `startup: ${offer.missingTabs} of ${offer.totalTabs} tabs not open, offered` : "startup: nothing lost";
  }
  if (name === ALARM_AUTO) {
    const { outcome, removed } = await runAutoSnapshot(adapter, settings);
    if (outcome === "full") await adapter.setActionTitle(adapter.getMessage("autoSnapshotFullTitle"));
    return `automatic snapshot: ${outcome}${removed.length > 0 ? `, ${removed.length} older removed` : ""}`;
  }
  return `unknown alarm ${name}`;
}

export async function onSettingsChanged(adapter: BrowserAdapter): Promise<void> {
  await reconcileAlarms(adapter, await loadSettings(adapter));
}
