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
  /** Tabs whose real address was recovered from a suspender. ADR-023. */
  recovered: number;
  /**
   * Groups the file carries with no name and no colour, which is what happens
   * without the `tabGroups` permission: the namespace does not exist, so the
   * collector never reads one. Counted so the report can say it rather than let
   * the user find out at restore time: ADR-030.
   */
  unnamedGroups: number;
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
  recovered?: number;
}): ExportReport {
  const counts = countSession(input.session);
  const unnamedGroups = input.session.windows.reduce(
    (sum, win) => sum + win.groups.filter((group) => (group.title ?? "") === "" && !group.color).length,
    0,
  );
  return {
    ok: true,
    format: input.format,
    windows: counts.windows,
    tabs: counts.tabs,
    groups: counts.groups,
    bytes: input.bytes,
    filename: input.filename,
    removed: input.removed,
    recovered: input.recovered ?? 0,
    unnamedGroups,
    saved: input.saved,
  };
}

export function totalRemoved(removed: FilterCounts): number {
  return removed.scheme + removed.pinned + removed.stale + removed.excluded + removed.duplicate + removed.unticked;
}

/**
 * What each filter dropped, as data rather than as a sentence. The interface
 * turns these into words, because the words are translated and this decision is
 * not: see `src/ui/shared/wording.ts` and ADR-022.
 */
export type RemovedKind = "duplicate" | "pinned" | "stale" | "scheme" | "excluded" | "unticked";

export function removedParts(removed: FilterCounts): { kind: RemovedKind; count: number }[] {
  const parts: { kind: RemovedKind; count: number }[] = [];
  if (removed.duplicate > 0) parts.push({ kind: "duplicate", count: removed.duplicate });
  if (removed.pinned > 0) parts.push({ kind: "pinned", count: removed.pinned });
  if (removed.stale > 0) parts.push({ kind: "stale", count: removed.stale });
  if (removed.scheme > 0) parts.push({ kind: "scheme", count: removed.scheme });
  if (removed.excluded > 0) parts.push({ kind: "excluded", count: removed.excluded });
  if (removed.unticked > 0) parts.push({ kind: "unticked", count: removed.unticked });
  return parts;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



/* Import and restore, task T-207 ----------------------------------------- */

/**
 * What the interface says after a restore. Built here rather than in the DOM
 * layer so the wording is unit tested: every number in it is a number the user
 * can check against their own tab strip, which is the trust model of this
 * product.
 */
export type RestoreDetail =
  | "windows"
  | "groups"
  | "duplicates"
  | "unopenable"
  | "ungrouped"
  | "unloaded";

export interface RestoreSummary {
  tone: "success" | "warn" | "error";
  /** `failed` and `nothing` carry no count. */
  headline: "restored" | "nothing" | "failed";
  restored: number;
  details: { kind: RestoreDetail; count: number }[];
}

/** The shape of what happened. The interface supplies the words. */
export function describeRestore(report: RestoreReport): RestoreSummary {
  const details: { kind: RestoreDetail; count: number }[] = [];
  if (report.windows > 0) details.push({ kind: "windows", count: report.windows });
  if (report.groups > 0) details.push({ kind: "groups", count: report.groups });
  if (report.duplicates > 0) details.push({ kind: "duplicates", count: report.duplicates });
  if (report.unopenable.length > 0) details.push({ kind: "unopenable", count: report.unopenable.length });
  if (report.ungrouped > 0) details.push({ kind: "ungrouped", count: report.ungrouped });
  if (report.discarded > 0) details.push({ kind: "unloaded", count: report.discarded });

  if (!report.ok && report.restored === 0) {
    return { tone: "error", headline: "failed", restored: 0, details };
  }
  if (report.restored === 0) {
    return { tone: "warn", headline: "nothing", restored: 0, details };
  }
  return {
    tone: report.unopenable.length > 0 || report.ungrouped > 0 || !report.ok ? "warn" : "success",
    headline: "restored",
    restored: report.restored,
    details,
  };
}

/**
 * The one line a preview shows about what a source format could carry, task
 * T-310. Two clauses, never one run on sentence: what came through, and what the
 * source format has no way to hold. An adapter that declares nothing missing is
 * claiming a full fidelity import, which only a TabsPack file can do.
 *
 * The adapter's own label and its lists of fields are the translatable parts,
 * and they travel with the adapter; the frame comes from the interface.
 */
export function describeFidelity(
  source: SourceInfo,
  frame: { complete: (label: string) => string; partial: (label: string, carried: string, missing: string) => string } = {
    complete: (label) => `${label}. Everything in it can be restored.`,
    partial: (label, carried, missing) =>
      `${label}. Carried: ${carried}. Not carried by this format: ${missing}.`,
  },
): string {
  if (source.missing.length === 0) return frame.complete(source.label);
  return frame.partial(source.label, source.carries.join(", "), source.missing.join(", "));
}
