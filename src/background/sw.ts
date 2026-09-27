/**
 * The background.
 *
 * It reports what this browser can do when the extension is installed, runs
 * the keyboard commands, and since M9 keeps the recovery copy and the
 * automatic snapshots, which have to happen when no TabsPack page is open. It
 * still holds no state, because the browser terminates it when idle: what it
 * knows between wakes is in storage. It answers no messages, because nothing
 * sends any. See docs/ARCHITECTURE.md section 7.
 *
 * Every listener is registered here, at the top level, synchronously. A
 * listener added later misses the event that woke the worker.
 */
import { events, realAdapter } from "../core/adapter/index.js";
import { capabilityNotices, describeCapabilities } from "../core/capabilities.js";
import { runCommand } from "./commands.js";
import * as durability from "./durability.js";

events.onInstalled((reason) => {
  // An unhandled rejection in a worker is a log line nobody sees.
  report(reason).catch((error: unknown) => console.error("[TabsPack] startup report failed:", error));
  durability.onSettingsChanged(realAdapter).catch(logFailure("alarms"));
});

events.onStartup(() => {
  durability.onStartup(realAdapter).catch(logFailure("startup"));
});

events.onTabsChanged((change) => {
  durability.onTabsChanged(realAdapter, change).catch(logFailure("tab change"));
});

events.onAlarm((name) => {
  durability
    .onAlarm(realAdapter, name)
    .then((detail) => console.info(`[TabsPack] ${detail}`))
    .catch(logFailure(name));
});

realAdapter.onStorageChanged((keys) => {
  if (keys.includes("settings")) durability.onSettingsChanged(realAdapter).catch(logFailure("alarms"));
});

function logFailure(what: string): (error: unknown) => void {
  return (error) => console.error(`[TabsPack] ${what} failed:`, error);
}

/**
 * A keyboard command is the one place the worker does real work, and there is
 * no page open to report into, so the toolbar is the whole interface: a colour
 * and a count on the badge, and the sentence in the tooltip. The detail still
 * goes to the log for anyone who opens the worker: ADR-033.
 */
events.onCommand((command) => {
  void (async () => {
    // Bounded, so a worker killed mid command cannot leave a badge behind.
    await realAdapter.setBadge("…", 120_000, "working").catch(() => undefined);
    try {
      const outcome = await runCommand(realAdapter, command);
      await realAdapter.setBadge(badgeFor(outcome.tabs), 4000, "success");
      await realAdapter.setActionTitle(outcome.detail);
      console.info(`[TabsPack] ${command}: ${outcome.detail}`);
    } catch (error) {
      await realAdapter.setBadge("!", 6000, "failure");
      await realAdapter.setActionTitle(realAdapter.getMessage("badgeExportFailed"));
      console.error(`[TabsPack] ${command} failed:`, error);
    }
  })();
});

function badgeFor(tabs: number): string {
  if (tabs <= 0) return "0";
  return tabs < 100 ? String(tabs) : "99+";
}

/** T-004: the probe reports a capability table on whichever engine is running. */
async function report(reason: string | undefined): Promise<void> {
  const platform = await realAdapter.platform();
  const caps = await realAdapter.capabilities();
  console.info(
    `[TabsPack] ${reason ?? "startup"} on ${platform.browser} ${platform.browserVersion} (${platform.os}), extension ${platform.extensionVersion}\n${describeCapabilities(caps)}`,
  );
  for (const notice of capabilityNotices(caps)) {
    console.info(`[TabsPack] ${notice.id}: ${notice.message}`);
  }
}
