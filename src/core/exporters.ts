/**
 * The two one way formats. Neither carries window, order or group information,
 * which is why the interface labels them as one way: see docs/LIMITATIONS.md.
 */
import type { Session } from "../types/session.js";

export interface TextOptions {
  /** ADR-011: titles are off by default and available behind a toggle. */
  includeTitles: boolean;
}

/**
 * One URL per line, or a title line above each URL with a blank line between
 * entries. The titled form is still readable by the M3 URL list importer, which
 * ignores lines that are not URLs, so turning titles on does not create a file
 * TabsPack cannot read back.
 */
export function toUrlList(session: Session, options: TextOptions): string {
  const blocks: string[] = [];
  for (const win of session.windows) {
    for (const tab of win.tabs) {
      if (options.includeTitles && tab.title) blocks.push(`${tab.title}\n${tab.url}`);
      else blocks.push(tab.url);
    }
  }
  const separator = options.includeTitles ? "\n\n" : "\n";
  return blocks.length === 0 ? "" : `${blocks.join(separator)}\n`;
}

/** A flat array of title and URL pairs, for scripts and spreadsheets. */
export function toFlatJson(session: Session): string {
  const rows = session.windows.flatMap((win) =>
    win.tabs.map((tab) => ({ title: tab.title, url: tab.url })),
  );
  return `${JSON.stringify(rows, null, 2)}\n`;
}
