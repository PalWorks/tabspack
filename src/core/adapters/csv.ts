/**
 * Comma separated values, task T-304.
 *
 * Written for Session Buddy's CSV export and useful for any spreadsheet: the
 * only requirement is a header row with a column whose name contains "url". A
 * column named window, session or folder becomes the window boundary, because
 * that is the one piece of structure a CSV of tabs usually carries.
 *
 * Fidelity is low and says so. A CSV has no pinned state, no groups, no order
 * beyond its rows.
 */
import type { TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import type { Issue } from "../issues.js";
import { warning } from "../issues.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, pack } from "./types.js";

const URL_COLUMNS = ["url", "address", "link", "href", "location"];
const TITLE_COLUMNS = ["title", "name", "page", "text"];
const WINDOW_COLUMNS = ["window", "folder", "group", "collection", "session"];

/** A tolerant reader: quoted fields, doubled quotes, and CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * The candidate names are tried in order, not the columns, so a file with both a
 * Session and a Window column uses Window: the first name in the list wins,
 * which is what makes the list an order of preference rather than a set.
 */
function columnIndex(header: string[], names: string[]): number {
  const cleaned = header.map((column) => column.trim().toLowerCase());
  for (const candidate of names) {
    const exact = cleaned.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of names) {
    const partial = cleaned.findIndex((name) => name.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function headerOf(input: AdapterInput): string[] | null {
  if (input.json !== undefined) return null;
  const rows = parseCsv(input.text.slice(0, 4000));
  const header = rows[0];
  if (!header || header.length < 2) return null;
  return columnIndex(header, URL_COLUMNS) >= 0 ? header : null;
}

export const csvList: ForeignAdapter = {
  id: "csv",
  label: "CSV with a URL column",
  fidelity: "low",
  carries: ["Addresses", "Titles where the file has them"],
  missing: ["Tab order beyond the row order", "Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    return headerOf(input) !== null;
  },

  parse(input: AdapterInput): AdapterResult {
    const issues: Issue[] = [];
    const rows = parseCsv(input.text);
    const header = rows[0] ?? [];
    const urlAt = columnIndex(header, URL_COLUMNS);
    const titleAt = columnIndex(header, TITLE_COLUMNS);
    const windowAt = columnIndex(header, WINDOW_COLUMNS);

    const byWindow = new Map<string, TabsPackTab[]>();
    let skipped = 0;
    for (const row of rows.slice(1)) {
      const url = cleanUrl(row[urlAt]);
      if (url === "") {
        skipped += 1;
        continue;
      }
      const key = windowAt >= 0 ? (row[windowAt] ?? "").trim() || "1" : "1";
      const tabs = byWindow.get(key) ?? [];
      const title = titleAt >= 0 ? (row[titleAt] ?? "").trim() : "";
      tabs.push({ index: tabs.length, url, ...(title ? { title } : {}) });
      byWindow.set(key, tabs);
    }

    if (skipped > 0) {
      issues.push(
        warning(
          "csv.rows_without_url",
          "$",
          `${skipped} ${skipped === 1 ? "row" : "rows"} in this file had nothing in the address column.`,
          "Those rows were left out. Everything else was read.",
        ),
      );
    }

    const windows: TabsPackWindow[] = [...byWindow.entries()].map(([name, tabs], index) => ({
      id: `w${index + 1}`,
      type: "normal",
      ...(byWindow.size > 1 && name !== "1" ? { name } : {}),
      tabs,
    }));

    return { file: pack(windows), issues };
  },
};
