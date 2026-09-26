/**
 * Tab age, B-202.
 *
 * A user with three hundred tabs keeps all three hundred because they cannot
 * see which ones died months ago. Every pack already carries `lastAccessed` per
 * tab: it is collected, serialized and in the schema. Nothing read it until
 * this file.
 *
 * Pure, like the rest of `src/core/`: a session in, counts out, no adapter and
 * no DOM. The clock is a parameter so a test is not at the mercy of the day it
 * runs on.
 *
 * **The rule that shapes the whole module: unknown is not old.**
 * `tabs.lastAccessed` is not guaranteed. `collect.ts` writes `null` when the
 * browser does not offer one, a tab read back from someone else's file may
 * never have had one, and every foreign format except Tab Session Manager
 * carries no timestamp at all. Treating an absent timestamp as an old one would
 * have the product advise a user to throw away tabs it knows nothing about. So
 * unknown is a band of its own, it is never counted as stale, and no filter
 * built on this file may drop it.
 */
import type { Session, SessionTab } from "../types/session.js";

const DAY_MS = 86_400_000;

/**
 * The windows the report speaks in. Bands rather than a raw age per tab,
 * because a list of three hundred ages is the same problem as a list of three
 * hundred tabs.
 */
export interface AgeBands {
  /** Used today. */
  today: number;
  /** Within the last week, excluding today. */
  week: number;
  /** Within the last month, excluding the last week. */
  month: number;
  /** Within the last quarter, excluding the last month. */
  quarter: number;
  /** Older than a quarter. */
  older: number;
  /** No timestamp at all. Never counted as old: see the file comment. */
  unknown: number;
}

export interface StalenessReport {
  bands: AgeBands;
  /** Tabs with a timestamp. `total - known` is `bands.unknown`. */
  known: number;
  total: number;
  /**
   * The oldest timestamp seen, or null when nothing had one. Milliseconds, so
   * the caller decides how to say it.
   */
  oldest: number | null;
}

/** The choices the interface offers, in days. */
export const STALE_WINDOWS = [30, 90, 180, 365] as const;

/** What the interface starts at once the user turns the filter on. */
export const DEFAULT_STALE_DAYS = 90;

/**
 * True when this tab has not been used within `days` and may be dropped.
 *
 * Two exemptions, and both are deliberate.
 *
 * A tab with no timestamp is never stale. There is no evidence about it, and
 * the absence of evidence is not evidence of age.
 *
 * A pinned tab is never stale. Pinning is the user saying they want this tab
 * kept, and a pinned tab is often one nobody clicks for months precisely
 * because it is always there. An old timestamp on it says nothing about whether
 * it is wanted.
 */
export function isStale(tab: SessionTab, days: number, now: number): boolean {
  if (days <= 0) return false;
  if (tab.pinned) return false;
  if (tab.lastAccessed === null) return false;
  return now - tab.lastAccessed > days * DAY_MS;
}

/**
 * How old the tabs in a session are. Counts only; the words are the interface's
 * job, per ADR-022.
 */
export function stalenessOf(session: Session, now: number = Date.now()): StalenessReport {
  const bands: AgeBands = { today: 0, week: 0, month: 0, quarter: 0, older: 0, unknown: 0 };
  let known = 0;
  let total = 0;
  let oldest: number | null = null;

  for (const win of session.windows) {
    for (const tab of win.tabs) {
      total += 1;
      if (tab.lastAccessed === null) {
        bands.unknown += 1;
        continue;
      }
      known += 1;
      if (oldest === null || tab.lastAccessed < oldest) oldest = tab.lastAccessed;

      const age = now - tab.lastAccessed;
      if (age < DAY_MS) bands.today += 1;
      else if (age < 7 * DAY_MS) bands.week += 1;
      else if (age < 30 * DAY_MS) bands.month += 1;
      else if (age < 90 * DAY_MS) bands.quarter += 1;
      else bands.older += 1;
    }
  }

  return { bands, known, total, oldest };
}

/**
 * How many tabs a given window would call stale, without filtering anything.
 * This is what the export pane states before the user commits, so the number
 * they read is the number the filter would remove.
 */
export function countStale(session: Session, days: number, now: number = Date.now()): number {
  if (days <= 0) return 0;
  let count = 0;
  for (const win of session.windows) {
    for (const tab of win.tabs) if (isStale(tab, days, now)) count += 1;
  }
  return count;
}

/**
 * Whether there is anything worth saying about age.
 *
 * Nothing is said when no tab has a timestamp, because the answer would be a
 * row of zeroes and an unknown count, and nothing is said when everything was
 * used this week, because a line that always appears is a line nobody reads.
 */
export function worthReporting(report: StalenessReport): boolean {
  if (report.known === 0) return false;
  return report.bands.month + report.bands.quarter + report.bands.older > 0;
}
