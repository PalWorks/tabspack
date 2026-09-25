/**
 * Netscape bookmark files, task T-307.
 *
 * Every browser exports bookmarks in this format, which makes it the universal
 * fallback input: a person who cannot export their session can always export
 * their bookmarks. Folders become windows, links become tabs.
 *
 * Parsed with a small scanner rather than a DOM parser, because `src/core/` runs
 * in node under test and must never depend on a document. The format is machine
 * generated and has not changed since Netscape wrote it, so the shape is safe to
 * scan; anything unrecognised is skipped rather than guessed at.
 */
import type { TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import type { Issue } from "../issues.js";
import { warning } from "../issues.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, pack } from "./types.js";

const DOCTYPE = /<!DOCTYPE\s+NETSCAPE-Bookmark-file-1/i;
const TOKEN = /<(\/?)(DL|H3|A)\b([^>]*)>/gi;
const HREF = /href\s*=\s*"([^"]*)"/i;

/** The five entities a bookmark file actually uses, plus numeric references. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => safeChar(parseInt(digits, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

export const netscapeBookmarks: ForeignAdapter = {
  id: "netscape",
  label: "Browser bookmarks",
  fidelity: "low",
  carries: ["Addresses", "Titles", "Each folder as a window"],
  missing: ["Tab order beyond the file order", "Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    return input.json === undefined && DOCTYPE.test(input.text);
  },

  parse(input: AdapterInput): AdapterResult {
    const issues: Issue[] = [];
    const text = input.text;
    const folders: string[] = [];
    const byFolder = new Map<string, TabsPackTab[]>();
    let pendingFolder: string | null = null;
    let loose = 0;

    TOKEN.lastIndex = 0;
    let token = TOKEN.exec(text);
    while (token) {
      const closing = token[1] === "/";
      const tag = (token[2] ?? "").toUpperCase();
      const attributes = token[3] ?? "";
      const contentStart = TOKEN.lastIndex;

      if (tag === "H3" && !closing) {
        const end = text.indexOf("</H3", contentStart);
        const title = decodeEntities(text.slice(contentStart, end < 0 ? contentStart : end)).trim();
        pendingFolder = title === "" ? "Bookmarks" : title;
      } else if (tag === "DL" && !closing) {
        folders.push(pendingFolder ?? (folders.length === 0 ? "Bookmarks" : (folders.at(-1) as string)));
        pendingFolder = null;
      } else if (tag === "DL" && closing) {
        folders.pop();
      } else if (tag === "A" && !closing) {
        const href = HREF.exec(attributes)?.[1] ?? "";
        const url = cleanUrl(decodeEntities(href));
        const end = text.indexOf("</A", contentStart);
        const title = decodeEntities(text.slice(contentStart, end < 0 ? contentStart : end)).trim();
        if (url !== "") {
          const folder = folders.at(-1) ?? "Bookmarks";
          // Depth one is the file's own outer list, which is not a folder the
          // user made: a link there was filed nowhere.
          if (folders.length <= 1) loose += 1;
          const tabs = byFolder.get(folder) ?? [];
          tabs.push({ index: tabs.length, url, ...(title ? { title } : {}) });
          byFolder.set(folder, tabs);
        }
      }
      token = TOKEN.exec(text);
    }

    if (loose > 0) {
      issues.push(
        warning(
          "netscape.loose_links",
          "$",
          `${loose} ${loose === 1 ? "bookmark was" : "bookmarks were"} outside any folder.`,
          "They were kept together in one window.",
        ),
      );
    }

    const windows: TabsPackWindow[] = [...byFolder.entries()]
      .filter(([, tabs]) => tabs.length > 0)
      .map(([name, tabs], index) => ({
        id: `w${index + 1}`,
        type: "normal",
        name,
        tabs,
      }));

    return { file: pack(windows), issues };
  },
};
