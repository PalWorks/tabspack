/**
 * Capability reporting. Pure: it formats what the adapter probed and decides
 * which notices the user needs. No browser access, no browser names.
 */
import type { Capabilities } from "./adapter/types.js";

export interface CapabilityNotice {
  id: string;
  message: string;
}

/** A readable table for the service worker log, per task T-004. */
export function describeCapabilities(caps: Capabilities): string {
  const rows: [string, string][] = [
    ["tab groups", yesNo(caps.tabGroups)],
    ["containers", yesNo(caps.containers)],
    ["downloads", yesNo(caps.downloads)],
    ["window bounds", yesNo(caps.windowBounds)],
    ["keyboard commands", yesNo(caps.commands)],
    ["discard on create", caps.discardOnCreate === null ? "unknown" : yesNo(caps.discardOnCreate)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`).join("\n");
}

/**
 * Notices worth showing once. Tab groups are the only capability whose absence
 * changes what an export or a restore can carry.
 */
export function capabilityNotices(caps: Capabilities): CapabilityNotice[] {
  const notices: CapabilityNotice[] = [];
  if (!caps.tabGroups) {
    notices.push({
      id: "no-tab-groups",
      message:
        "This browser does not expose tab group titles or colours. Which tabs belong together is still captured.",
    });
  }
  if (!caps.downloads) {
    notices.push({
      id: "no-downloads",
      message: "This browser blocked the downloads API, so exports are copied instead of saved.",
    });
  }
  return notices;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
