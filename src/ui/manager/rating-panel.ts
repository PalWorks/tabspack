/**
 * The rating ask on the manager page, task T-711.
 *
 * The rules are in `core/rating.ts` and ADR-036. This is only the surface, and
 * it holds to the one rule that is about placement rather than timing: the ask
 * appears **after** an action has finished, at the top of the pane the user is
 * already looking at, and it never covers anything. It is the callout component
 * in its quiet tone, not a dialog, because a modal asking for a favour right
 * after you did some work is the pattern this is deliberately not.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import {
  countUse,
  DEFAULT_RATING_STATE,
  markAsked,
  reviewUrl,
  settle,
  shouldAsk,
  snooze,
  type RatedAction,
  type RatingState,
} from "../../core/rating.js";
import { el, icon, ICON } from "../shared/dom.js";
import { t } from "../shared/i18n.js";

const STORAGE_KEY = "rating";

export interface RatingAsk {
  /** Called when an export or a restore has finished successfully. */
  used(action: RatedAction): void;
}

export function initRatingAsk(hosts: HTMLElement[], adapter: BrowserAdapter): RatingAsk {
  let state: RatingState = DEFAULT_RATING_STATE;
  let link: string | null = null;
  let ready = false;

  /*
   * Built once per pane, because the ask has to appear where the user already
   * is: an export ends on Export and a restore ends on Import, and neither
   * should move the user somewhere else to be asked a favour.
   */
  for (const host of hosts) {
    const glyph = icon(ICON.check, 18);
    glyph.classList.add("callout-icon");
    const title = el("p", { class: "callout-title", text: t("ratingTitle") });
    const text = el("p", { class: "callout-text", text: t("ratingText") });
    const body = el("div", { class: "callout-body" });
    body.appendChild(title);
    body.appendChild(text);

    const rate = el("button", { class: "btn btn-primary", text: t("ratingRate") });
    rate.type = "button";
    const later = el("button", { class: "btn btn-secondary", text: t("ratingLater") });
    later.type = "button";
    const never = el("button", { class: "btn btn-secondary", text: t("ratingNever") });
    never.type = "button";
    const actions = el("div", { class: "callout-actions" });
    actions.appendChild(rate);
    actions.appendChild(later);
    actions.appendChild(never);

    host.classList.add("callout");
    host.dataset.tone = "quiet";
    host.setAttribute("role", "status");
    host.appendChild(glyph);
    host.appendChild(body);
    host.appendChild(actions);
    host.hidden = true;

    rate.addEventListener("click", () => {
      if (link) void adapter.openExternal(link).catch(() => undefined);
      void close(settle(state));
    });
    later.addEventListener("click", () => void close(snooze(state, Date.now())));
    never.addEventListener("click", () => void close(settle(state)));
  }

  void load();

  async function load(): Promise<void> {
    const stored = await adapter
      .storageGet({ [STORAGE_KEY]: DEFAULT_RATING_STATE })
      .catch(() => ({ [STORAGE_KEY]: DEFAULT_RATING_STATE }));
    state = { ...DEFAULT_RATING_STATE, ...(stored[STORAGE_KEY] as Partial<RatingState>) };

    /*
     * An ask with nowhere to go is worse than no ask, so the link is resolved
     * before anything can be shown, and it is null until a store listing
     * actually exists: ADR-036.
     */
    const platform = await adapter.platform().catch(() => null);
    link = platform ? reviewUrl(platform.browser) : null;
    ready = true;
  }

  /*
   * Writes are serialised through one chain, the same way `core/settings.ts`
   * does it. Two actions finishing within a millisecond of each other, which a
   * keyboard export and a restore can, would otherwise both read the same
   * state, both decide to ask, and the count would be wrong in both directions.
   */
  let writes: Promise<unknown> = Promise.resolve();

  function save(next: RatingState): Promise<void> {
    state = next;
    writes = writes.then(() => adapter.storageSet({ [STORAGE_KEY]: next }).catch(() => undefined));
    return writes.then(() => undefined);
  }

  async function close(next: RatingState): Promise<void> {
    for (const host of hosts) host.hidden = true;
    await save(next);
  }

  return {
    used(_action: RatedAction): void {
      void (async () => {
        if (!ready || link === null) return;
        // Decided against the state this call produced, not against a read that
        // another call may already have moved on from.
        const counted = countUse(state);
        await save(counted);
        if (!shouldAsk(counted, Date.now())) return;
        // Counted as asked the moment it is on screen, so a second export in
        // the same session does not put it up twice.
        await save(markAsked(counted, Date.now()));
        // Shown on every pane that can trigger it; whichever one the user is
        // looking at is the one they see, and answering it closes both.
        for (const host of hosts) host.hidden = false;
      })();
    },
  };
}
