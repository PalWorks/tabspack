/**
 * Report objects. Returned values, never log lines, because rule 4 of the design
 * principles is that nothing the product drops is silent.
 */
import type { FilterCounts } from "./filters.js";
import type { ExportFormat } from "./settings.js";
import type { Session } from "../types/session.js";
import { countSession } from "../types/session.js";

export interface ExportReport {
  ok: true;
  format: ExportFormat;
  windows: number;
  tabs: number;
  groups: number;
  bytes: number;
  filename: string;
  removed: FilterCounts;
  /** True when the file was written, false when it was only copied. */
  saved: boolean;
}

export interface FailureReport {
  ok: false;
  error: string;
}

export type Report = ExportReport | FailureReport;

export function buildExportReport(input: {
  session: Session;
  removed: FilterCounts;
  format: ExportFormat;
  bytes: number;
  filename: string;
  saved: boolean;
}): ExportReport {
  const counts = countSession(input.session);
  return {
    ok: true,
    format: input.format,
    windows: counts.windows,
    tabs: counts.tabs,
    groups: counts.groups,
    bytes: input.bytes,
    filename: input.filename,
    removed: input.removed,
    saved: input.saved,
  };
}

export function totalRemoved(removed: FilterCounts): number {
  return removed.scheme + removed.pinned + removed.excluded + removed.duplicate;
}

/** One sentence naming every filter that dropped something, or an empty string. */
export function describeRemoved(removed: FilterCounts): string {
  const parts: string[] = [];
  if (removed.duplicate > 0) parts.push(`${plural(removed.duplicate, "duplicate")}`);
  if (removed.pinned > 0) parts.push(`${removed.pinned} pinned`);
  if (removed.scheme > 0) parts.push(`${removed.scheme} not a web page`);
  if (removed.excluded > 0) parts.push(`${removed.excluded} excluded`);
  if (parts.length === 0) return "";
  return `${parts.join(", ")} skipped`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
