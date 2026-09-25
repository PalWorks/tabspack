/**
 * Session Buddy, task T-304.
 *
 * The largest installed competitor and closed source, so the shape it exports is
 * the documented one in docs/SPEC.md Table S5 rather than one read from code: an
 * object with a `sessions` array whose entries hold `windows`, each with `tabs`.
 * The reader is written defensively for that reason, and takes whichever fields
 * it recognises rather than assuming a layout.
 *
 * A saved session there is a collection of windows, which is exactly a pack, so
 * the fidelity is high for everything except tab groups, which its format does
 * not carry.
 */
import type { TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import type { Issue } from "../issues.js";
import { warning } from "../issues.js";
import { isObject } from "../schema.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, isoFrom, pack, textOf } from "./types.js";

function sessionList(json: unknown): Record<string, unknown>[] {
  if (!isObject(json)) return [];
  const sessions = json["sessions"];
  return Array.isArray(sessions) ? sessions.filter(isObject) : [];
}

export const sessionBuddyJson: ForeignAdapter = {
  id: "session-buddy-json",
  label: "Session Buddy export",
  fidelity: "high",
  carries: ["Windows", "Tab order", "Pinned tabs"],
  missing: ["Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    const sessions = sessionList(input.json);
    return sessions.length > 0 && sessions.some((session) => Array.isArray(session["windows"]));
  },

  parse(input: AdapterInput): AdapterResult {
    const issues: Issue[] = [];
    const sessions = sessionList(input.json);
    const chosen = sessions[0] as Record<string, unknown>;
    if (sessions.length > 1) {
      issues.push(
        warning(
          "session_buddy.many_sessions",
          "$",
          `This file holds ${sessions.length} saved sessions, and TabsPack imports one file as one pack.`,
          "The first one was read. Export the others from Session Buddy one at a time.",
        ),
      );
    }

    const rawWindows = Array.isArray(chosen?.["windows"]) ? (chosen["windows"] as unknown[]).filter(isObject) : [];
    const windows: TabsPackWindow[] = [];
    rawWindows.forEach((rawWindow) => {
      const rawTabs = Array.isArray(rawWindow["tabs"]) ? (rawWindow["tabs"] as unknown[]).filter(isObject) : [];
      const tabs: TabsPackTab[] = [];
      rawTabs.forEach((raw) => {
        const url = cleanUrl(raw["url"]);
        if (url === "") return;
        tabs.push({
          index: tabs.length,
          url,
          ...(textOf(raw["title"]) ? { title: textOf(raw["title"]) } : {}),
          ...(raw["pinned"] === true ? { pinned: true } : {}),
          ...(textOf(raw["favIconUrl"]) ? { favIconUrl: textOf(raw["favIconUrl"]) } : {}),
        });
      });
      if (tabs.length === 0) return;
      windows.push({ id: `w${windows.length + 1}`, type: "normal", tabs });
    });

    return {
      file: pack(windows, {
        ...(textOf(chosen?.["name"]) ? { name: textOf(chosen["name"]) } : {}),
        ...(isoFrom(chosen?.["created"] ?? chosen?.["modified"])
          ? { exportedAt: isoFrom(chosen["created"] ?? chosen["modified"]) as string }
          : {}),
      }),
      issues,
    };
  },
};
