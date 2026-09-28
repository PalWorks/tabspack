/**
 * Asking for a rating, task T-711.
 *
 * Every extension does this and most do it badly: on the second launch, before
 * the thing has done anything worth rating, and again every week forever. The
 * rules here are the opposite of that, and they are rules rather than taste
 * because a nag is easy to add later and impossible to take back: ADR-036.
 *
 *   1. **Earned, not timed.** The count is real exports and restores, not days
 *      installed. Someone who installed it and never used it has nothing to
 *      say, and asking them produces the one star that says so.
 *   2. **Never during the work.** The ask appears on the manager page after an
 *      action has finished, never over a running export and never in the popup,
 *      which is a launcher with one job.
 *   3. **Three answers, and two of them end it.** Rate, later, never. "Later"
 *      means a long way later, and each later is longer than the last.
 *   4. **Asked at most three times, ever.** After that it stops by itself, with
 *      no setting to find and no way to be wrong about it.
 *   5. **A click through is treated as done.** No browser tells an extension
 *      whether a review was left, so pretending to know would mean asking
 *      someone who has already written one. Taking them at their word costs a
 *      review that might not exist; not doing it costs their goodwill.
 */

/** Actions that count as having used the product for real. */
export type RatedAction = "export" | "restore";

export interface RatingState {
  /** Exports and restores that finished successfully. */
  uses: number;
  /** How many times the ask has been shown. */
  asked: number;
  /** Epoch milliseconds before which nothing is shown. */
  snoozedUntil: number;
  /** Set once the user rates or declines for good. Nothing is ever shown again. */
  settled: boolean;
}

export const DEFAULT_RATING_STATE: RatingState = {
  uses: 0,
  asked: 0,
  snoozedUntil: 0,
  settled: false,
};

/**
 * Uses required before each ask. Rising, so someone who says "later" has to
 * get a lot more value out of it before being asked again.
 */
const THRESHOLDS = [8, 40, 150];

/** And a floor in real time, so a heavy day cannot trigger two asks. */
const SNOOZE_MS = [14, 60].map((days) => days * 24 * 60 * 60 * 1000);

export const MAX_ASKS = THRESHOLDS.length;

export function countUse(state: RatingState): RatingState {
  return { ...state, uses: state.uses + 1 };
}

/** Whether the ask should be on screen now. */
export function shouldAsk(state: RatingState, now: number): boolean {
  if (state.settled) return false;
  if (state.asked >= MAX_ASKS) return false;
  if (now < state.snoozedUntil) return false;
  return state.uses >= (THRESHOLDS[state.asked] ?? Infinity);
}

/** The ask has been put on screen. Counted here so it cannot be shown twice. */
export function markAsked(state: RatingState, now: number): RatingState {
  const asked = state.asked + 1;
  return {
    ...state,
    asked,
    // The last ask needs no snooze, because there is no ask after it.
    snoozedUntil: now + (SNOOZE_MS[asked - 1] ?? 0),
  };
}

/**
 * "Later". Not "no": the next threshold is a long way off, and there are at
 * most three in a lifetime.
 */
export function snooze(state: RatingState, now: number): RatingState {
  return markAsked(state, now);
}

/** "Rate it" or "no thanks". Either way nothing is ever shown again. */
export function settle(state: RatingState): RatingState {
  return { ...state, settled: true };
}

/**
 * Where a rating goes, per browser, or null when there is nowhere to send them.
 *
 * The first version of this built the Chrome URL out of the runtime extension
 * id, which looks right and is wrong: an unpacked build has a runtime id too,
 * so a development install produced a confident link to a Web Store page that
 * does not exist. An ask that leads nowhere is worse than no ask.
 *
 * So the listings are written down here, once, and each is added only when its
 * store has actually accepted a submission. A browser with no listing is shown
 * nothing at all. Chrome's went live with 1.0.0, confirmed 2026-09-28; Edge and
 * Firefox follow their first acceptance, with the store URLs in the README.
 */
const LISTINGS: { match: string; url: string }[] = [
  { match: "chrome", url: "https://chromewebstore.google.com/detail/tabspack-cross-browser-ta/bgomldlmhkecjeceibdphdkoencnghjm/reviews" },
  // { match: "edge", url: "https://microsoftedge.microsoft.com/addons/detail/<id>" },
  // { match: "firefox", url: "https://addons.mozilla.org/firefox/addon/tabspack/reviews/" },
];

export function reviewUrl(browserName: string): string | null {
  const name = browserName.toLowerCase();
  return LISTINGS.find((listing) => name.includes(listing.match))?.url ?? null;
}

/** True once at least one store listing is known, which is what T-509 produces. */
export function anyListingKnown(): boolean {
  return LISTINGS.length > 0;
}
