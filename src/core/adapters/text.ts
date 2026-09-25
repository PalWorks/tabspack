/**
 * The two hand made inputs, task T-306: a list of addresses, and a Markdown list
 * of links.
 *
 * These are what a person pastes out of a note, a chat or a model's answer, and
 * they are the reason FR-102 and FR-103 exist. Neither carries structure beyond
 * what is visible, so both declare low fidelity, and the Markdown reader treats a
 * heading as a window boundary because that is the one grouping the format has.
 */
import type { TabsPackTab, TabsPackWindow } from "../../types/tabspack.js";
import type { AdapterInput, AdapterResult, ForeignAdapter } from "./types.js";
import { cleanUrl, pack } from "./types.js";

const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function isComment(line: string): boolean {
  return line.startsWith("#") || line.startsWith("//") || line.startsWith(";");
}

export const markdownLinks: ForeignAdapter = {
  id: "markdown",
  label: "Markdown list of links",
  fidelity: "low",
  carries: ["Addresses", "Titles", "Each heading as a window"],
  missing: ["Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    if (input.json !== undefined) return false;
    MARKDOWN_LINK.lastIndex = 0;
    const links = input.text.match(MARKDOWN_LINK) ?? [];
    return links.length > 0;
  },

  parse(input: AdapterInput): AdapterResult {
    const windows: TabsPackWindow[] = [];
    let tabs: TabsPackTab[] = [];
    let name = "";

    const close = (): void => {
      if (tabs.length === 0) return;
      windows.push({
        id: `w${windows.length + 1}`,
        type: "normal",
        ...(name ? { name } : {}),
        tabs,
      });
      tabs = [];
    };

    for (const line of lines(input.text)) {
      const heading = HEADING.exec(line.trim());
      if (heading) {
        close();
        name = heading[1] ?? "";
        continue;
      }
      MARKDOWN_LINK.lastIndex = 0;
      let match = MARKDOWN_LINK.exec(line);
      let found = false;
      while (match) {
        const url = cleanUrl(match[2]);
        if (url !== "") {
          const title = (match[1] ?? "").trim();
          tabs.push({ index: tabs.length, url, ...(title ? { title } : {}) });
          found = true;
        }
        match = MARKDOWN_LINK.exec(line);
      }
      if (found) continue;
      // A bare address on its own line is still a tab in a list of links.
      const bare = cleanUrl(line.trim().replace(/^[-*+]\s+/, ""));
      if (bare !== "" && !isComment(line.trim())) tabs.push({ index: tabs.length, url: bare });
    }
    close();

    return { file: pack(windows), issues: [] };
  },
};

export const urlList: ForeignAdapter = {
  id: "urls",
  label: "List of addresses",
  fidelity: "low",
  carries: ["Addresses"],
  missing: ["Titles", "Pinned tabs", "Tab groups", "Window size and state"],

  detect(input: AdapterInput): boolean {
    if (input.json !== undefined) return false;
    const body = lines(input.text)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !isComment(line));
    if (body.length === 0) return false;
    const addresses = body.filter((line) => cleanUrl(line) !== "").length;
    // Two lines in five, because TabsPack's own titled text export alternates a
    // title and an address and must read back. A page of prose with a link in it
    // is well under that.
    return addresses > 0 && addresses / body.length >= 0.4;
  },

  /**
   * A line that is not an address is treated as the title of the address on the
   * next line, which is what TabsPack's own titled text export writes and what a
   * person pasting from a browser usually produces.
   */
  parse(input: AdapterInput): AdapterResult {
    const tabs: TabsPackTab[] = [];
    let pendingTitle = "";
    for (const raw of lines(input.text)) {
      const line = raw.trim();
      if (line === "" || isComment(line)) {
        pendingTitle = "";
        continue;
      }
      const url = cleanUrl(line);
      if (url === "") {
        pendingTitle = line;
        continue;
      }
      tabs.push({
        index: tabs.length,
        url,
        ...(pendingTitle ? { title: pendingTitle } : {}),
      });
      pendingTitle = "";
    }
    const windows: TabsPackWindow[] = tabs.length > 0 ? [{ id: "w1", type: "normal", tabs }] : [];
    return { file: pack(windows), issues: [] };
  },
};
