/**
 * The support form, tasks T-710 and T-715.
 *
 * There are two ways a message can leave, and the order between them is the
 * whole design:
 *
 *   **Send** posts the message to the relay in `server/support-worker/`, which
 *   holds the mail key so the extension does not have to. This is first
 *   because it is the one that works for everybody. The browser asks for the
 *   relay's origin the first time, since TabsPack ships with no host access at
 *   all, and declining is a supported answer rather than an error.
 *
 *   **Use my email app** hands the same message to the user's own mail client,
 *   which is what the first version did for everyone. It stays because it is
 *   the route that needs nothing from us, and because it is where Send falls
 *   back to when the relay is unreachable, busy, refused or not permitted. A
 *   message is never lost to a failure: worst case it ends on the clipboard
 *   and the page says so.
 *
 * What is sent is what is on screen, either way. The message is composed once,
 * in `core/support.ts`, shown in full, and neither route adds a field to it.
 * `scripts/lint.mjs` still forbids `fetch` everywhere in `src/` except
 * `core/relay.ts`, so that claim is checked rather than trusted. ADR-035,
 * ADR-039.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import { RELAY_PERMISSION, sendViaRelay, type RelayOutcome } from "../../core/relay.js";
import {
  composeSupportMessage,
  isSendable,
  mailtoUrl,
  replyToLooksUsable,
  type ComposedMessage,
  type SupportContext,
  type SupportDraft,
  type SupportTopic,
} from "../../core/support.js";
import type { Settings } from "../../core/settings.js";
import { must } from "../shared/dom.js";
import { t } from "../shared/i18n.js";
import { clearReport, renderError, renderNote, renderSuccess } from "../shared/report-view.js";
import { initSegmented } from "../shared/segmented.js";

/** Where support mail goes, by either route. */
const SUPPORT_ADDRESS = "support@palworks.ai";

export function initSupportPanel(adapter: BrowserAdapter, settings: Settings): void {
  const ui = {
    topic: must<HTMLDivElement>("#support-topic"),
    message: must<HTMLTextAreaElement>("#support-message"),
    reply: must<HTMLInputElement>("#support-reply"),
    replyHint: must<HTMLSpanElement>("#support-reply-hint"),
    include: must<HTMLInputElement>("#support-include"),
    diagnostics: must<HTMLPreElement>("#support-diagnostics"),
    send: must<HTMLButtonElement>("#support-send"),
    mail: must<HTMLButtonElement>("#support-mail"),
    copy: must<HTMLButtonElement>("#support-copy"),
    report: must<HTMLDivElement>("#support-report"),
  };

  let topic: SupportTopic = "broken";
  /** True while a send is in flight, so a double click cannot send twice. */
  let busy = false;
  let context: SupportContext = {
    extensionVersion: "",
    browser: "",
    browserVersion: "",
    os: "",
    tabGroups: false,
    recoverSuspended: settings.recoverSuspended,
    unloadRestored: settings.unloadRestored,
  };

  initSegmented(ui.topic, topic, (value) => {
    topic = value as SupportTopic;
  });

  ui.message.addEventListener("input", paint);
  ui.reply.addEventListener("input", paint);
  ui.include.addEventListener("change", paint);

  ui.send.addEventListener("click", () => {
    /*
     * Asked for here, first, with nothing awaited before it: Chromium only
     * honours a permission request inside the click that caused it, and an
     * await in between is enough to lose that. Already granted resolves true
     * with no prompt, so this costs nothing on every send after the first.
     */
    const permitted = adapter.requestOrigins([RELAY_PERMISSION]).catch(() => false);
    void send(permitted);
  });
  ui.mail.addEventListener("click", () => void handOff(compose(), null));
  ui.copy.addEventListener("click", () => void copy());

  void load();

  async function load(): Promise<void> {
    const [platform, tabGroups] = await Promise.all([
      adapter.platform().catch(() => null),
      adapter.hasPermissions(["tabGroups"]).catch(() => false),
    ]);
    context = {
      extensionVersion: platform?.extensionVersion ?? "",
      browser: platform?.browser ?? "",
      browserVersion: platform?.browserVersion ?? "",
      os: platform?.os ?? "",
      tabGroups,
      recoverSuspended: settings.recoverSuspended,
      unloadRestored: settings.unloadRestored,
    };
    paint();
  }

  function draft(): SupportDraft {
    return {
      topic,
      message: ui.message.value,
      replyTo: ui.reply.value,
      includeContext: ui.include.checked,
    };
  }

  function compose(): ComposedMessage {
    return composeSupportMessage(draft(), context);
  }

  /**
   * The diagnostics are shown whether or not they are switched on, greyed when
   * they are not, because "include what browser I am using" is only a real
   * choice if you can see what that means.
   */
  function paint(): void {
    const current = draft();
    const composed = composeSupportMessage({ ...current, includeContext: true }, context);
    ui.diagnostics.textContent = composed.diagnostics.join("\n");
    ui.diagnostics.dataset.off = current.includeContext ? "false" : "true";

    const usable = replyToLooksUsable(current.replyTo);
    ui.replyHint.textContent = usable ? t("supportReplyHint") : t("supportReplyBad");
    ui.replyHint.dataset.tone = usable ? "" : "warn";

    const ready = isSendable(current) && usable && !busy;
    ui.send.disabled = !ready;
    ui.mail.disabled = !ready;
  }

  /** The relay first, and the mail client for every outcome that is not `sent`. */
  async function send(permitted: Promise<boolean>): Promise<void> {
    if (busy) return;
    const current = draft();
    const composed = composeSupportMessage(current, context);
    const replyTo = current.replyTo.trim();

    busy = true;
    paint();
    clearReport(ui.report);

    try {
      if (!(await permitted)) {
        // Declined, or a browser with no host permission model to ask. Either
        // way there is a route that needs no permission at all.
        await handOff(composed, t("supportRelayDenied"));
        return;
      }

      renderNote(ui.report, t("supportSending"));
      const outcome = await sendViaRelay({
        subject: composed.subject,
        body: composed.body,
        replyTo,
      });

      if (outcome === "sent") {
        renderSuccess(ui.report, replyTo === "" ? t("supportSentNoReply") : t("supportSentReply", replyTo));
        // Cleared so the same report cannot be sent twice by a second click,
        // and so the pane visibly returns to rest.
        ui.message.value = "";
        return;
      }

      await handOff(composed, reasonFor(outcome));
    } finally {
      busy = false;
      paint();
    }
  }

  function reasonFor(outcome: RelayOutcome): string {
    // `busy` is us, and it is temporary by construction: a cap was hit, not a
    // bug. Everything else is said the same way, because the user's next step
    // is identical and a taxonomy of failures is not their problem.
    return outcome === "busy" ? t("supportRelayBusy") : t("supportRelayFailed");
  }

  /**
   * The mail client route. `why` is the sentence explaining how we got here,
   * or null when the user chose this route themselves and needs no excuse.
   */
  async function handOff(composed: ComposedMessage, why: string | null): Promise<void> {
    const say = (sentence: string) => {
      const full = why === null ? sentence : `${why} ${sentence}`;
      return full;
    };

    const url = mailtoUrl(SUPPORT_ADDRESS, composed);
    if (url === null) {
      // Refused rather than truncated: half a bug report is worse than none.
      renderNote(ui.report, say(t("supportTooLong")));
      await copy(why);
      return;
    }
    try {
      await adapter.openExternal(url);
      if (why === null) renderSuccess(ui.report, t("supportHandedOff", SUPPORT_ADDRESS));
      else renderNote(ui.report, say(t("supportHandedOff", SUPPORT_ADDRESS)));
    } catch {
      // No mail client, or the browser refused the handoff. The message still
      // exists and the user can still send it, so say how.
      renderNote(ui.report, say(t("supportNoMailApp")));
      await copy(why);
    }
  }

  async function copy(why: string | null = null): Promise<void> {
    const composed = compose();
    try {
      await adapter.copyText(`To: ${SUPPORT_ADDRESS}\nSubject: ${composed.subject}\n\n${composed.body}`);
      const sentence = t("supportCopied", SUPPORT_ADDRESS);
      if (why === null) renderSuccess(ui.report, sentence);
      else renderNote(ui.report, `${why} ${sentence}`);
    } catch (error) {
      renderError(ui.report, error instanceof Error ? error.message : t("supportFailed"));
    }
  }
}
