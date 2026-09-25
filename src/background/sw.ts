/**
 * The background.
 *
 * It does two things: it reports what this browser can do when the extension is
 * installed, and it runs the keyboard commands. It holds no state, because the
 * browser terminates it when idle, and it answers no messages, because nothing
 * sends any: every TabsPack page has the extension APIs itself, and a page is
 * where the long running work belongs. See docs/ARCHITECTURE.md section 7.
 */
import { events, realAdapter } from "../core/adapter/index.js";
import { capabilityNotices, describeCapabilities } from "../core/capabilities.js";
import { runCommand } from "./commands.js";

events.onInstalled((reason) => {
  // An unhandled rejection in a worker is a log line nobody sees.
  report(reason).catch((error: unknown) => console.error("[TabsPack] startup report failed:", error));
});

/**
 * A keyboard command is the one place the worker does real work. The badge is
 * the only surface it has, so the count goes there and the detail goes to the
 * log, where a user who opens the worker can read it.
 */
events.onCommand((command) => {
  void (async () => {
    try {
      const outcome = await runCommand(realAdapter, command);
      await realAdapter.setBadge(badgeFor(outcome.tabs), 2000);
      console.info(`[TabsPack] ${command}: ${outcome.detail}`);
    } catch (error) {
      await realAdapter.setBadge("!", 3000);
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
