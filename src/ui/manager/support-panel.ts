/**
 * The support form, task T-710.
 *
 * Two rules hold this together, and both come from the product's one promise:
 *
 *   **What is sent is what is on screen.** The message is composed in
 *   `core/support.ts`, shown in full, and handed to the user's own mail client.
 *   The extension makes no network request, so `PRIVACY.md` stays true as
 *   written rather than gaining an exception.
 *
 *   **No key ships, and no request is made.** Sending mail directly would need
 *   an API key inside a published extension, which anybody can read out of the
 *   package and use to send mail as us. `scripts/lint.mjs` refuses `fetch`
 *   anywhere in the source for the same reason the listing can make the claim
 *   it makes, so the relay in `server/support-worker/` is deliberately not
 *   wired in here: turning it on is an edit to that rule, to `PRIVACY.md`, to
 *   the listings, and a decision record. ADR-035.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import {
  composeSupportMessage,
  isSendable,
  mailtoUrl,
  replyToLooksUsable,
  type SupportContext,
  type SupportDraft,
  type SupportTopic,
} from "../../core/support.js";
import type { Settings } from "../../core/settings.js";
import { must } from "../shared/dom.js";
import { t } from "../shared/i18n.js";
import { clearReport, renderError, renderNote, renderSuccess } from "../shared/report-view.js";
import { initSegmented } from "../shared/segmented.js";

/** Where support mail goes. */
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
    copy: must<HTMLButtonElement>("#support-copy"),
    report: must<HTMLDivElement>("#support-report"),
  };

  let topic: SupportTopic = "broken";
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
  ui.send.addEventListener("click", () => void send());
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
    ui.send.disabled = !isSendable(current) || !usable;
  }

  async function send(): Promise<void> {
    const current = draft();
    const composed = composeSupportMessage(current, context);
    clearReport(ui.report);

    const url = mailtoUrl(SUPPORT_ADDRESS, composed);
    if (url === null) {
      // Refused rather than truncated: half a bug report is worse than none.
      renderNote(ui.report, t("supportTooLong"));
      await copy();
      return;
    }
    try {
      await adapter.openExternal(url);
      renderSuccess(ui.report, t("supportHandedOff", SUPPORT_ADDRESS));
    } catch {
      // No mail client, or the browser refused the handoff. The message still
      // exists and the user can still send it, so say how.
      renderNote(ui.report, t("supportNoMailApp"));
      await copy();
    }
  }

  async function copy(): Promise<void> {
    const composed = composeSupportMessage(draft(), context);
    try {
      await adapter.copyText(`To: ${SUPPORT_ADDRESS}\nSubject: ${composed.subject}\n\n${composed.body}`);
      renderSuccess(ui.report, t("supportCopied", SUPPORT_ADDRESS));
    } catch (error) {
      renderError(ui.report, error instanceof Error ? error.message : t("supportFailed"));
    }
  }
}
