/**
 * T-711. The rating ask, which is the feature most likely to turn a good
 * product into an annoying one, so every rule in ADR-036 is pinned here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countUse,
  DEFAULT_RATING_STATE,
  MAX_ASKS,
  markAsked,
  anyListingKnown,
  reviewUrl,
  settle,
  shouldAsk,
  snooze,
  type RatingState,
} from "../../src/core/rating.js";

const NOW = new Date("2026-09-26T08:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function used(times: number, from: RatingState = DEFAULT_RATING_STATE): RatingState {
  let state = from;
  for (let index = 0; index < times; index += 1) state = countUse(state);
  return state;
}

test("a fresh install is never asked", () => {
  assert.equal(shouldAsk(DEFAULT_RATING_STATE, NOW), false);
  assert.equal(shouldAsk(used(7), NOW), false, "seven real uses is still not enough");
});

test("the ask is earned by use, not by time installed", () => {
  assert.equal(shouldAsk(used(8), NOW), true);
  // A year later, with nothing used, still nothing to say.
  assert.equal(shouldAsk(DEFAULT_RATING_STATE, NOW + 365 * DAY), false);
});

test("later means a lot later, and each later is longer", () => {
  const first = snooze(used(8), NOW);
  assert.equal(first.asked, 1);
  assert.equal(shouldAsk(first, NOW + DAY), false, "not tomorrow");
  assert.equal(shouldAsk(used(200, first), NOW + DAY), false, "not even after heavy use the next day");
  assert.equal(
    shouldAsk(used(200, first), NOW + 20 * DAY),
    true,
    "once the fortnight has passed and the higher bar is cleared",
  );

  const second = snooze(used(200, first), NOW + 20 * DAY);
  assert.equal(second.asked, 2);
  assert.equal(
    shouldAsk(used(500, second), NOW + 40 * DAY),
    false,
    "the second later is two months, not two weeks",
  );
  assert.equal(shouldAsk(used(500, second), NOW + 90 * DAY), true);
});

test("rating, or refusing, ends it for good", () => {
  const done = settle(used(500));
  assert.equal(shouldAsk(done, NOW + 10 * 365 * DAY), false);
});

test("it stops by itself after three asks, with nothing to switch off", () => {
  let state = used(1000);
  for (let round = 0; round < MAX_ASKS; round += 1) {
    state = markAsked(state, NOW);
  }
  assert.equal(state.asked, MAX_ASKS);
  assert.equal(shouldAsk(state, NOW + 10 * 365 * DAY), false, "a fourth ask does not exist");
});

test("marking it asked is what stops it being shown twice in one session", () => {
  const ready = used(8);
  assert.equal(shouldAsk(ready, NOW), true);
  assert.equal(shouldAsk(markAsked(ready, NOW), NOW), false);
});

/*
 * An ask that leads nowhere is worse than no ask. The first version built the
 * Chrome link out of the runtime extension id, which every unpacked build also
 * has, so a development install linked confidently to a Web Store page that did
 * not exist. Now only a store that has accepted TabsPack is linked: Chrome.
 */
test("only a store that has accepted TabsPack gets a rating link", () => {
  assert.equal(anyListingKnown(), true, "the Chrome Web Store listing is live");
  assert.equal(reviewUrl("Google Chrome"), "https://chromewebstore.google.com/detail/tabspack-cross-browser-ta/bgomldlmhkecjeceibdphdkoencnghjm/reviews");
  for (const name of ["Microsoft Edge", "Firefox", "Some Other Browser"]) {
    assert.equal(reviewUrl(name), null, `${name} has nowhere to send a rating yet`);
  }
});

/*
 * The shape the panel depends on: once a listing exists, everything above has
 * to still hold. Simulated by driving the same functions the panel drives, in
 * the same order, which a browser test cannot reach without waiting days of use.
 */
test("the whole life of an ask, from install to settled", () => {
  let state = DEFAULT_RATING_STATE;
  let shown = 0;
  const use = (at: number) => {
    state = countUse(state);
    if (shouldAsk(state, at)) {
      shown += 1;
      state = markAsked(state, at);
    }
  };

  for (let i = 0; i < 7; i += 1) use(NOW);
  assert.equal(shown, 0, "nothing before it has been used properly");

  use(NOW);
  assert.equal(shown, 1, "the eighth use earns the first ask");

  for (let i = 0; i < 100; i += 1) use(NOW + DAY);
  assert.equal(shown, 1, "and heavy use the next day earns nothing");

  for (let i = 0; i < 100; i += 1) use(NOW + 30 * DAY);
  assert.equal(shown, 2, "the second comes a fortnight and forty uses later");

  state = settle(state);
  for (let i = 0; i < 1000; i += 1) use(NOW + 400 * DAY);
  assert.equal(shown, 2, "and settling ends it, whatever happens afterwards");
});
