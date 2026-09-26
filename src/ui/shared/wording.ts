/**
 * Where numbers become sentences, task T-503.
 *
 * `src/core/report.ts` decides what happened and returns it as data; this turns
 * that data into the words a person reads, through `_locales`. Keeping the two
 * apart is what lets the decisions stay unit tested in node while the wording
 * stays translatable: ADR-022.
 */
import type { FilterCounts } from "../../core/filters.js";
import { removedParts, type RestoreSummary } from "../../core/report.js";
import { describeFidelity as frameFidelity } from "../../core/report.js";
import type { SourceInfo } from "../../core/import.js";
import type { StalenessReport } from "../../core/staleness.js";
import { plural, t } from "./i18n.js";

export function tabs(count: number): string {
  return plural(count, "tabs");
}

export function windows(count: number): string {
  return plural(count, "windows");
}

export function groups(count: number): string {
  return plural(count, "groups");
}

/** "2 windows · 37 tabs · 3 groups", the live summary both surfaces show. */
export function countsLine(counts: { windows: number; tabs: number; groups: number }): string {
  const parts = [windows(counts.windows), tabs(counts.tabs)];
  if (counts.groups > 0) parts.push(groups(counts.groups));
  return parts.join(" · ");
}

/** One phrase per filter that dropped something, each a complete clause. */
export function removedPhrases(removed: FilterCounts): string[] {
  return removedParts(removed).map((part) =>
    plural(part.count, `removed_${part.kind}`),
  );
}

/**
 * "Last opened: 12 today · 40 this week · 55 over 3 months ago · 8 with no date".
 *
 * Only the bands with something in them appear, so the line is as short as the
 * truth allows. The unknown band is last and is never left out when it is not
 * zero: a count the product cannot vouch for is the one it must not hide. B-202.
 */
export function ageLine(report: StalenessReport): string {
  const bands = report.bands;
  const parts: string[] = [];
  if (bands.today > 0) parts.push(plural(bands.today, "age_today"));
  if (bands.week > 0) parts.push(plural(bands.week, "age_week"));
  if (bands.month > 0) parts.push(plural(bands.month, "age_month"));
  if (bands.quarter > 0) parts.push(plural(bands.quarter, "age_quarter"));
  if (bands.older > 0) parts.push(plural(bands.older, "age_older"));
  if (bands.unknown > 0) parts.push(plural(bands.unknown, "age_unknown"));
  return `${t("ageLabel")}: ${parts.join(" · ")}`;
}

export function restoreHeadline(summary: RestoreSummary): string {
  if (summary.headline === "failed") return t("restoreFailedHeadline");
  if (summary.headline === "nothing") return t("restoreNothingHeadline");
  return t("restoreHeadline", tabs(summary.restored));
}

export function restoreDetails(summary: RestoreSummary): string[] {
  if (summary.headline === "nothing" && summary.details.length === 0) {
    return [t("restoreNothingDetail")];
  }
  return summary.details.map((detail) => plural(detail.count, `restore_${detail.kind}`));
}

export function fidelityLine(source: SourceInfo): string {
  return frameFidelity(source, {
    complete: (label) => t("fidelityComplete", label),
    partial: (label, carried, missing) => t("fidelityPartial", label, carried, missing),
  });
}
