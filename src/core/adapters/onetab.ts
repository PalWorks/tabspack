/**
 * OneTab, task T-305.
 *
 * A very large installed base and a plain text export: one line per tab as
 * `url | title`, with blank lines separating the lists OneTab calls groups. A
 * list is the closest thing OneTab has to a window, so that is what it becomes,
 * and the preview says so rather than pretending the geometry was in the file.
 */
import type { TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, pack } from "./types.js";

const LINE = /^\s*(\S+)\s*\|\s*(.*)$/;

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function bodyLines(text: string): string[] {
  return lines(text).filter((line) => line.trim() !== "");
}

export const oneTab: ForeignAdapter = {
  id: "onetab",
  label: "OneTab export",
  fidelity: "medium",
  carries: ["Addresses", "Titles", "Each OneTab list as a window"],
  missing: ["Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    if (input.json !== undefined) return false;
    const body = bodyLines(input.text);
    if (body.length === 0) return false;
    const matching = body.filter((line) => {
      const match = LINE.exec(line);
      return match !== null && cleanUrl(match[1]) !== "";
    });
    return matching.length / body.length > 0.6;
  },

  parse(input: AdapterInput): AdapterResult {
    const windows: TabsPackWindow[] = [];
    let tabs: TabsPackTab[] = [];

    const close = (): void => {
      if (tabs.length === 0) return;
      windows.push({ id: `w${windows.length + 1}`, type: "normal", tabs });
      tabs = [];
    };

    for (const line of lines(input.text)) {
      if (line.trim() === "") {
        close();
        continue;
      }
      const match = LINE.exec(line);
      const url = cleanUrl(match ? match[1] : line);
      if (url === "") continue;
      const title = (match?.[2] ?? "").trim();
      tabs.push({ index: tabs.length, url, ...(title ? { title } : {}) });
    }
    close();

    return { file: pack(windows), issues: [] };
  },
};
