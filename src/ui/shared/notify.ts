/**
 * What the toolbar icon says, from whichever surface did the work.
 *
 * A user reported not being able to tell an export that worked from one that
 * did not, and they were right twice over: the badge was a bare count in one
 * colour, shown only for an export started from the popup, and an import said
 * nothing on the toolbar at all. A manager page behind other windows could
 * finish a restore of two hundred tabs with no sign anywhere: ADR-033.
 *
 * Two signals, and they do different jobs:
 *
 *   The **badge** is four characters and a colour. It answers "did something
 *   happen, and was it fine": blue while working, green with a count when it
 *   worked, red `!` when it did not.
 *
 *   The **tooltip** is a sentence. It answers "what happened", and it is the
 *   only place on the toolbar where that fits.
 *
 * Colour is never the only signal: the count, the `!` and the sentence all
 * change too, which is the rule in docs/DESIGN.md section 6.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";

/** How long a finished state stays on the icon before the badge clears. */
const DONE_MS = 4_000;
const FAILED_MS = 6_000;
/**
 * And a ceiling on the working state, so a page closed mid export cannot leave
 * a `…` on the toolbar for the rest of the session. Longer than any restore
 * measured so far, including two hundred real remote pages at 21 seconds.
 */
const WORKING_MS = 120_000;

export interface Notifier {
  /** Something long enough to notice has started. */
  working(what: "export" | "import"): void;
  /** It worked, and this many tabs were involved. */
  done(what: "export" | "import", tabs: number, sentence: string): void;
  /** It did not work. */
  failed(what: "export" | "import", sentence: string): void;
}

export function initNotifier(adapter: BrowserAdapter): Notifier {
  const say = (text: string, ms: number | undefined, tone: "working" | "success" | "failure", title: string) => {
    // Never awaited by a caller: a toolbar that is slow to paint must not hold
    // up the work it is describing, and a browser that refuses is not an error.
    void adapter.setBadge(text, ms, tone).catch(() => undefined);
    void adapter.setActionTitle(title).catch(() => undefined);
  };

  return {
    working(what) {
      say("…", WORKING_MS, "working", adapter.getMessage(what === "export" ? "badgeExporting" : "badgeImporting"));
    },
    done(what, tabs, sentence) {
      say(count(tabs), DONE_MS, "success", sentence);
    },
    failed(_what, sentence) {
      say("!", FAILED_MS, "failure", sentence);
    },
  };
}

/** Four characters is the whole budget, so anything past 99 is "99+". */
function count(tabs: number): string {
  if (tabs <= 0) return "0";
  return tabs < 100 ? String(tabs) : "99+";
}
