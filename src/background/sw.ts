/**
 * The service worker is a router, not a brain. It holds no state, because the
 * browser terminates it when idle. Long running work, including export and the
 * M2 restore, happens on the manager page.
 */
import { events, realAdapter } from "../core/adapter/index.js";
import { UNHANDLED } from "../core/adapter/types.js";
import { capabilityNotices, describeCapabilities } from "../core/capabilities.js";
import { runCommand } from "./commands.js";

const MANAGER_PAGE = "manager.html";

interface Message {
  type?: string;
  text?: string;
  count?: number;
  durationMs?: number;
}

events.onInstalled((reason) => {
  void report(reason);
});

/**
 * A keyboard command is the one place the worker does real work rather than
 * routing. The badge is the only surface it has, so the count goes there and the
 * detail goes to the log, where a user who opens the worker can read it.
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

events.onMessage(async (raw) => {
  const message = (raw ?? {}) as Message;
  switch (message.type) {
    case "OPEN_MANAGER":
      await realAdapter.openExtensionPage(MANAGER_PAGE);
      return { ok: true };

    case "FLASH_BADGE": {
      const count = Number(message.count);
      const text = Number.isFinite(count) && count > 0 ? (count < 100 ? String(count) : "99+") : "";
      await realAdapter.setBadge(text, message.durationMs ?? 1500);
      return { ok: true };
    }

    case "CAPABILITIES":
      return { ok: true, capabilities: await realAdapter.capabilities() };

    default:
      return UNHANDLED;
  }
});

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
