/**
 * A flat JSON array, task T-308.
 *
 * What a script, a spreadsheet export or another extension emits: an array of
 * addresses, or an array of objects each carrying one. It is also what TabsPack's
 * own one way flat JSON export writes, so a file exported that way can be read
 * back in, with the loss the interface warned about at export time.
 */
import type { TabsPackTab } from "../../types/tabspack.js";
import { isObject } from "../schema.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, pack, textOf } from "./types.js";

const URL_KEYS = ["url", "href", "link", "address", "uri", "location"];
const TITLE_KEYS = ["title", "name", "text", "label"];

function urlOf(entry: unknown): string {
  if (typeof entry === "string") return cleanUrl(entry);
  if (!isObject(entry)) return "";
  for (const key of URL_KEYS) {
    const found = cleanUrl(entry[key]);
    if (found !== "") return found;
  }
  return "";
}

function titleOf(entry: unknown): string {
  if (!isObject(entry)) return "";
  for (const key of TITLE_KEYS) {
    const found = textOf(entry[key]);
    if (found !== "") return found;
  }
  return "";
}

export const flatJson: ForeignAdapter = {
  id: "flat-json",
  label: "JSON list of addresses",
  fidelity: "low",
  carries: ["Addresses", "Titles where the file has them"],
  missing: ["Windows", "Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    if (!Array.isArray(input.json) || input.json.length === 0) return false;
    return input.json.filter((entry) => urlOf(entry) !== "").length / input.json.length > 0.6;
  },

  parse(input: AdapterInput): AdapterResult {
    const entries = Array.isArray(input.json) ? input.json : [];
    const tabs: TabsPackTab[] = [];
    for (const entry of entries) {
      const url = urlOf(entry);
      if (url === "") continue;
      const title = titleOf(entry);
      tabs.push({ index: tabs.length, url, ...(title ? { title } : {}) });
    }
    const windows = tabs.length > 0 ? [{ id: "w1", type: "normal" as const, tabs }] : [];
    return { file: pack(windows), issues: [] };
  },
};
