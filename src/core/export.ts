/**
 * Export orchestration: collect, filter, serialize, describe. It takes the
 * adapter as a parameter and touches no DOM, so the whole pipeline is testable
 * in node. Writing the file is the caller's job, because Blob and anchor are
 * page APIs: see `src/ui/shared/save.ts`.
 */
import type { BrowserAdapter } from "./adapter/types.js";
import type { Session } from "../types/session.js";
import type { ExportFormat, Settings } from "./settings.js";
import type { FilterCounts } from "./filters.js";
import { applyFilters } from "./filters.js";
import { collectSession } from "./collect.js";
import { unsuspendSession } from "./unsuspend.js";
import { stringify, toFile } from "./serialize.js";
import { toFlatJson, toUrlList } from "./exporters.js";
import { exportFilename, textFilename } from "./naming.js";

export interface ExportPayload {
  format: ExportFormat;
  text: string;
  filename: string;
  mime: string;
  bytes: number;
  session: Session;
  removed: FilterCounts;
  /** Tabs whose real address was recovered from a suspender. ADR-023. */
  recovered: number;
}

export interface BuildExportOptions {
  /** Overrides the clock. Tests pass a fixed date. */
  now?: Date;
}

export async function buildExport(
  adapter: BrowserAdapter,
  settings: Settings,
  options: BuildExportOptions = {},
): Promise<ExportPayload> {
  const when = options.now ?? new Date();
  const { session, removed, recovered } = await collectFiltered(adapter, settings, when);
  return renderExport(session, removed, settings, when, recovered);
}

/**
 * Collect and filter without serializing. The popup uses this to show a count
 * before the user commits, so the primary button can say what it will do.
 */
export async function collectFiltered(
  adapter: BrowserAdapter,
  settings: Settings,
  when: Date = new Date(),
): Promise<{ session: Session; removed: FilterCounts; recovered: number }> {
  const collected = await collectSession(adapter, {
    scope: settings.scope,
    includeIncognito: settings.includeIncognito,
    now: when.getTime(),
  });
  /*
   * Recovery runs before the filters, never after. A suspended tab reads as an
   * extension page, so web-pages-only would drop it, dedupe would not see it as
   * the same page as the live copy, and a sort by address would file it under
   * the suspender. Every one of those is wrong about the tab the user has.
   */
  const { session: real, recovered } = settings.recoverSuspended
    ? unsuspendSession(collected)
    : { session: collected, recovered: 0 };
  return { ...applyFilters(real, settings), recovered };
}

/** The serialization half, split out so tests can drive it without an adapter. */
export function renderExport(
  session: Session,
  removed: FilterCounts,
  settings: Settings,
  when: Date,
  recovered = 0,
): ExportPayload {
  let text: string;
  let filename: string;
  let mime: string;

  switch (settings.format) {
    case "urls":
      text = toUrlList(session, { includeTitles: settings.textIncludeTitles });
      filename = textFilename(when, "txt");
      mime = "text/plain;charset=utf-8";
      break;
    case "flatjson":
      text = toFlatJson(session);
      filename = textFilename(when, "json");
      mime = "application/json;charset=utf-8";
      break;
    case "tabspack":
    default:
      text = stringify(toFile(session, { keepFavicons: settings.keepFavicons, exportedAt: when }));
      filename = exportFilename(when);
      mime = "application/json;charset=utf-8";
      break;
  }

  return {
    format: settings.format,
    text,
    filename,
    mime,
    bytes: byteLength(text),
    session,
    removed,
    recovered,
  };
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
