/**
 * Report objects. Returned values, never log lines, because rule 4 of the design
 * principles is that nothing the product drops is silent.
 */
import type { FilterCounts } from "./filters.js";
import type { RestoreReport } from "./restore.js";
import type { SourceInfo } from "./import.js";
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

/* Import and restore, task T-207 ----------------------------------------- */

/**
 * What the interface says after a restore. Built here rather than in the DOM
 * layer so the wording is unit tested: every number in it is a number the user
 * can check against their own tab strip, which is the trust model of this
 * product.
 */
export interface RestoreSummary {
  tone: "success" | "warn" | "error";
  headline: string;
  details: string[];
}

export function describeRestore(report: RestoreReport): RestoreSummary {
  const details: string[] = [];
  if (report.windows > 0) details.push(`${plural(report.windows, "window")}`);
  if (report.groups > 0) details.push(`${plural(report.groups, "group")}`);
  if (report.duplicates > 0) details.push(`${report.duplicates} already open`);
  if (report.unopenable.length > 0) details.push(`${report.unopenable.length} cannot be opened`);
  if (report.ungrouped > 0) details.push(`${report.ungrouped} restored ungrouped`);
  if (report.discarded > 0) details.push(`${report.discarded} left unloaded`);

  if (!report.ok && report.restored === 0) {
    return {
      tone: "error",
      headline: "Nothing was restored.",
      details,
    };
  }
  if (report.restored === 0) {
    return {
      tone: "warn",
      headline: "No tabs were restored.",
      details:
        details.length > 0
          ? details
          : ["Every tab in this pack was already open, or was excluded by the selection."],
    };
  }
  return {
    tone: report.unopenable.length > 0 || report.ungrouped > 0 || !report.ok ? "warn" : "success",
    headline: `Restored ${plural(report.restored, "tab")}`,
    details,
  };
}

/**
 * The one line a preview shows about what a source format could carry, task
 * T-310. Two clauses, never one run on sentence: what came through, and what the
 * source format has no way to hold. An adapter that declares nothing missing is
 * claiming a full fidelity import, which only a TabsPack file can do.
 */
export function describeFidelity(source: SourceInfo): string {
  if (source.missing.length === 0) return `${source.label}. Everything in it can be restored.`;
  return `${source.label}. Carried: ${source.carries.join(", ")}. Not carried by this format: ${source.missing.join(
    ", ",
  )}.`;
}
