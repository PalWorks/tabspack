/**
 * Tab Session Manager, task T-303.
 *
 * The largest open source competitor, and the fidelity bar. Its export is an
 * array of its internal session objects: windows keyed by the browser's window
 * id, each holding tabs keyed by the browser's tab id, with the window geometry
 * in a parallel `windowsInfo` map and any tab groups in a flat `tabGroups`
 * array. Shape read from its own `src/background/save.js`.
 *
 * Process local ids as keys is exactly the mistake docs/SPEC.md section 1 names,
 * and it is why order here comes from each tab's `index` rather than from the
 * order of the keys.
 */
import type { TabsPackGroup, TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import { GROUP_COLORS, type GroupColor } from "../../types/tabspack.js";
import type { Issue } from "../issues.js";
import { jsonPath, warning } from "../issues.js";
import { isObject } from "../schema.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, isoFrom, pack, textOf } from "./types.js";

function sessions(json: unknown): Record<string, unknown>[] {
  const list = Array.isArray(json) ? json : [json];
  return list.filter(isObject);
}

function looksLikeSession(value: unknown): boolean {
  if (!isObject(value)) return false;
  return isObject(value["windows"]) && (isObject(value["windowsInfo"]) || typeof value["tabsNumber"] === "number");
}

export const tabSessionManager: ForeignAdapter = {
  id: "tab-session-manager",
  label: "Tab Session Manager",
  fidelity: "high",
  carries: ["Windows", "Tab order", "Pinned tabs", "Active tab", "Tab groups", "Window size and state"],
  missing: [],

  detect(input: AdapterInput): boolean {
    const list = Array.isArray(input.json) ? input.json : [input.json];
    return list.length > 0 && list.every(looksLikeSession) && list.some(looksLikeSession);
  },

  parse(input: AdapterInput): AdapterResult {
    const issues: Issue[] = [];
    const found = sessions(input.json);
    const chosen = found[0] as Record<string, unknown>;
    if (found.length > 1) {
      issues.push(
        warning(
          "tsm.many_sessions",
          "$",
          `This file holds ${found.length} saved sessions, and TabsPack imports one file as one pack.`,
          `The newest session, ${describe(found)}, was read. Export the others from Tab Session Manager one at a time.`,
        ),
      );
    }

    const windowsMap = isObject(chosen["windows"]) ? chosen["windows"] : {};
    const infoMap = isObject(chosen["windowsInfo"]) ? chosen["windowsInfo"] : {};
    const groupsById = new Map<number, { key: string; group: TabsPackGroup }>();
    const rawGroups = Array.isArray(chosen["tabGroups"]) ? chosen["tabGroups"] : [];

    const windows: TabsPackWindow[] = [];
    let ordinal = 0;
    for (const windowId of Object.keys(windowsMap)) {
      const tabsMap = windowsMap[windowId];
      if (!isObject(tabsMap)) continue;
      ordinal += 1;
      const key = `w${ordinal}`;

      const rawTabs = Object.values(tabsMap).filter(isObject);
      rawTabs.sort((a, b) => numberOf(a["index"]) - numberOf(b["index"]));

      const groups: TabsPackGroup[] = [];
      const tabs: TabsPackTab[] = [];
      rawTabs.forEach((raw, index) => {
        const url = cleanUrl(raw["url"]);
        if (url === "") return;
        const groupId = numberOf(raw["groupId"], -1);
        let groupKey: string | undefined;
        if (groupId > -1) {
          const known = groupsById.get(groupId);
          if (known && !groups.some((group) => group.id === known.key)) groups.push(known.group);
          if (!known) {
            const meta = rawGroups.filter(isObject).find((group) => numberOf(group["id"], -1) === groupId);
            const created: TabsPackGroup = {
              id: `g${groupsById.size + 1}`,
              ...(textOf(meta?.["title"]) ? { title: textOf(meta?.["title"]) } : {}),
              ...(colourOf(meta?.["color"]) ? { color: colourOf(meta?.["color"]) } : {}),
              ...(meta?.["collapsed"] === true ? { collapsed: true } : {}),
            };
            groupsById.set(groupId, { key: created.id, group: created });
            groups.push(created);
          }
          groupKey = groupsById.get(groupId)?.key;
        }

        tabs.push({
          index,
          url,
          ...(textOf(raw["title"]) ? { title: textOf(raw["title"]) } : {}),
          ...(raw["pinned"] === true ? { pinned: true } : {}),
          ...(raw["active"] === true ? { active: true } : {}),
          ...(groupKey ? { groupId: groupKey } : {}),
          ...(textOf(raw["favIconUrl"]) ? { favIconUrl: textOf(raw["favIconUrl"]) } : {}),
          ...(isObject(raw["mutedInfo"]) && raw["mutedInfo"]["muted"] === true ? { muted: true } : {}),
          ...(raw["discarded"] === true ? { discarded: true } : {}),
          ...(textOf(raw["cookieStoreId"]) ? { cookieStoreId: textOf(raw["cookieStoreId"]) } : {}),
          ...(isoFrom(raw["lastAccessed"]) ? { lastAccessed: isoFrom(raw["lastAccessed"]) as string } : {}),
        });
      });

      if (tabs.length === 0) {
        ordinal -= 1;
        continue;
      }

      const info = isObject(infoMap[windowId]) ? (infoMap[windowId] as Record<string, unknown>) : {};
      const type = textOf(info["type"]);
      if (type !== "" && type !== "normal") {
        issues.push(
          warning(
            "tsm.window_type",
            jsonPath("windows", ordinal - 1),
            `One window in this session was a ${type} window, which no browser can recreate as a tab set.`,
            "Its tabs were kept, and they will be restored into an ordinary window.",
          ),
        );
      }

      windows.push({
        id: key,
        type: "normal",
        ...(info["focused"] === true ? { focused: true } : {}),
        ...(info["incognito"] === true ? { incognito: true } : {}),
        ...(stateOf(info["state"]) ? { state: stateOf(info["state"]) as TabsPackWindow["state"] } : {}),
        ...(boundsOf(info) ? { bounds: boundsOf(info) } : {}),
        ...(groups.length > 0 ? { groups } : {}),
        tabs,
      });
    }

    return {
      file: pack(windows, {
        ...(textOf(chosen["name"]) ? { name: textOf(chosen["name"]) } : {}),
        ...(isoFrom(chosen["date"]) ? { exportedAt: isoFrom(chosen["date"]) as string } : {}),
      }),
      issues,
    };
  },
};

function describe(found: Record<string, unknown>[]): string {
  const name = textOf(found[0]?.["name"]);
  return name === "" ? "the first one in the file" : `"${name}"`;
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function colourOf(value: unknown): GroupColor | undefined {
  const colour = textOf(value).toLowerCase();
  if (colour === "") return undefined;
  return (GROUP_COLORS as readonly string[]).includes(colour) ? (colour as GroupColor) : "grey";
}

function stateOf(value: unknown): string | undefined {
  const state = textOf(value);
  return ["normal", "minimized", "maximized", "fullscreen"].includes(state) ? state : undefined;
}

function boundsOf(info: Record<string, unknown>): TabsPackWindow["bounds"] | undefined {
  const bounds: Record<string, number> = {};
  for (const key of ["left", "top", "width", "height"] as const) {
    const value = info[key];
    if (typeof value === "number" && Number.isFinite(value)) bounds[key] = Math.round(value);
  }
  return Object.keys(bounds).length > 0 ? bounds : undefined;
}
