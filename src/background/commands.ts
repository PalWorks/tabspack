/**
 * What the keyboard commands do, task T-404.
 *
 * The service worker is a router, and this is the one place it does real work.
 * That is deliberate: the fastest users never open a surface at all, and a
 * command that opens a tab to do its job is not a shortcut. The work is small and
 * bounded, so the worker being terminated afterwards costs nothing.
 */
import type { BrowserAdapter } from "../core/adapter/types.js";
import { buildExport } from "../core/export.js";
import { defaultSnapshotName, saveSnapshot, usage } from "../core/snapshots.js";
import { collectSession } from "../core/collect.js";
import { loadSettings } from "../core/settings.js";
import { countSession } from "../types/session.js";
import { saveFromBackground } from "./save-file.js";

export const COMMANDS = {
  exportAll: "export-all-windows",
  exportCurrent: "export-current-window",
  saveSnapshot: "save-snapshot",
} as const;

export interface CommandOutcome {
  ok: boolean;
  command: string;
  /** Tabs the command acted on, which is what the badge shows. */
  tabs: number;
  detail: string;
}

const MANAGER_PAGE = "manager.html";

export async function runCommand(adapter: BrowserAdapter, command: string): Promise<CommandOutcome> {
  const settings = await loadSettings(adapter);

  if (command === COMMANDS.saveSnapshot) {
    const session = await collectSession(adapter, {
      scope: "all_windows",
      includeIncognito: settings.includeIncognito,
    });
    const counts = countSession(session);
    if (counts.tabs === 0) return { ok: false, command, tabs: 0, detail: "there was nothing to save" };
    const now = new Date();
    const { meta } = await saveSnapshot(adapter, session, {
      name: defaultSnapshotName(now, counts),
      now,
    });
    const room = await usage(adapter);
    return {
      ok: true,
      command,
      tabs: counts.tabs,
      detail: room.warn
        ? `saved as "${meta.name}", and snapshot storage is nearly full`
        : `saved as "${meta.name}"`,
    };
  }

  const scope = command === COMMANDS.exportCurrent ? "current_window" : "all_windows";
  const payload = await buildExport(adapter, { ...settings, scope, format: "tabspack" });
  const counts = countSession(payload.session);
  if (counts.tabs === 0) return { ok: false, command, tabs: 0, detail: "there was nothing to export" };

  const written = await saveFromBackground(adapter, payload, `${MANAGER_PAGE}#export=${scope}`);
  return {
    ok: true,
    command,
    tabs: counts.tabs,
    detail: written.saved ? `saved as ${payload.filename}` : "opened the TabsPack page to finish the export",
  };
}
