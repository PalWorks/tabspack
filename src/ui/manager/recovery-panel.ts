/**
 * Durability on the manager page, M9.
 *
 * Three surfaces, one module, because they read and write the same state:
 *
 *   - the recovery offer at the top of the Export pane, after a start that
 *     lost tabs (B-102)
 *   - the one-time ask after a first export, because the recovery copy is off
 *     at install and a setting nobody finds protects nobody (decision D2)
 *   - the Automatic protection card on the Snapshots pane: the recovery copy,
 *     automatic snapshots and their rolling limit (B-101, ADR-047), the
 *     previous session, and the browser's own recently closed list
 *
 * Nothing here opens a tab. Every session goes to the import preview first.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import {
  ASKED_KEY,
  AUTO_STATE_KEY,
  OFFER_KEY,
  PREVIOUS_KEY,
  dismissOffer,
  isAuto,
  readAutoState,
  readOffer,
  readPrevious,
  recordSession,
  type RecoveryRecord,
} from "../../core/durability.js";
import { saveSettings, type Settings } from "../../core/settings.js";
import { listSnapshots } from "../../core/snapshots.js";
import type { Session } from "../../types/session.js";
import { clear, el, icon, ICON, must } from "../shared/dom.js";
import { t } from "../shared/i18n.js";
import { renderError, renderNote, clearReport } from "../shared/report-view.js";
import { tabs as tabsPhrase } from "../shared/wording.js";

export interface RecoveryHooks {
  /** Hands a session to the import preview. */
  preview(session: Session, label: string): Promise<void>;
}

export interface RecoveryPanel {
  /** Called after a successful export: the moment to offer the recovery copy, once. */
  askAfterExport(): void;
  paint(latest: Settings): void;
}

export function initRecoveryPanel(adapter: BrowserAdapter, initial: Settings, hooks: RecoveryHooks): RecoveryPanel {
  let settings = initial;
  const ui = {
    offer: must<HTMLDivElement>("#recovery-offer"),
    ask: must<HTMLDivElement>("#recovery-ask"),
    recovery: must<HTMLInputElement>("#opt-recovery"),
    interval: must<HTMLSelectElement>("#opt-auto-interval"),
    keep: must<HTMLInputElement>("#opt-auto-keep"),
    status: must<HTMLParagraphElement>("#auto-status"),
    previous: must<HTMLDivElement>("#previous-session"),
    previousLine: must<HTMLSpanElement>("#previous-line"),
    previousPreview: must<HTMLButtonElement>("#previous-preview"),
    recent: must<HTMLButtonElement>("#recent-closed"),
    recentReport: must<HTMLDivElement>("#recent-report"),
    recentList: must<HTMLUListElement>("#recent-list"),
  };

  /* The offer ------------------------------------------------------------- */

  const offerTitle = el("p", { class: "callout-title" });
  const offerText = el("p", { class: "callout-text" });
  buildCallout(ui.offer, ICON.warn, offerTitle, offerText, [
    [t("recoveryPreview"), "btn btn-primary", () => void previewLost()],
    [t("recoveryDismiss"), "btn btn-secondary", () => void closeOffer()],
  ]);
  ui.offer.dataset.tone = "warn";

  async function paintOffer(): Promise<void> {
    const offer = await readOffer(adapter);
    ui.offer.hidden = offer === null;
    if (!offer) return;
    offerTitle.textContent = t("recoveryOfferTitle", tabsPhrase(offer.missingTabs));
    offerText.textContent = t("recoveryOfferText", readable(offer.capturedAt));
  }

  async function previewLost(): Promise<void> {
    const found = await readPrevious(adapter, settings);
    if (found) await hooks.preview(found.missing, t("autoSnapshotName", readable(found.record.capturedAt)));
    await closeOffer();
  }

  async function closeOffer(): Promise<void> {
    ui.offer.hidden = true;
    await dismissOffer(adapter);
    await adapter.setBadge("", 0);
    await adapter.setActionTitle("");
  }

  /* The ask, once, after a first export ----------------------------------- */

  const askTitle = el("p", { class: "callout-title", text: t("recoveryAskTitle") });
  const askText = el("p", { class: "callout-text", text: t("recoveryAskText") });
  const askActions = buildCallout(ui.ask, ICON.check, askTitle, askText, [
    [
      t("recoveryAskYes"),
      "btn btn-primary",
      () => {
        void saveSettings(adapter, { recoveryCopy: true }).then(() => {
          askText.textContent = t("recoveryAskDone");
          askActions.hidden = true;
          setTimeout(() => (ui.ask.hidden = true), 6000);
        });
      },
    ],
    [t("recoveryAskNo"), "btn btn-secondary", () => (ui.ask.hidden = true)],
  ]);
  ui.ask.dataset.tone = "quiet";

  /* The Automatic protection card ----------------------------------------- */

  ui.recovery.addEventListener("change", () => void saveSettings(adapter, { recoveryCopy: ui.recovery.checked }));
  ui.interval.addEventListener("change", () => void saveSettings(adapter, { autoSnapshotHours: Number(ui.interval.value) }));
  ui.keep.addEventListener("change", () => {
    const value = Number(ui.keep.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      ui.keep.value = String(settings.autoSnapshotKeep);
      return;
    }
    void saveSettings(adapter, { autoSnapshotKeep: value });
  });

  function paintControls(): void {
    ui.recovery.checked = settings.recoveryCopy;
    ui.interval.value = String(settings.autoSnapshotHours);
    ui.keep.value = String(settings.autoSnapshotKeep);
    ui.keep.disabled = settings.autoSnapshotHours === 0;
  }

  async function paintStatus(): Promise<void> {
    if (settings.autoSnapshotHours === 0) {
      ui.status.textContent = "";
      ui.status.hidden = true;
      return;
    }
    ui.status.hidden = false;
    const state = await readAutoState(adapter);
    if (state.blocked === "full") {
      ui.status.textContent = t("autoStatusFull");
      ui.status.dataset.tone = "warn";
      return;
    }
    delete ui.status.dataset.tone;
    const autos = (await listSnapshots(adapter)).filter(isAuto);
    const parts = [autos[0] ? t("autoStatusLast", readable(Date.parse(autos[0].createdAt))) : t("autoStatusNone")];
    if (state.removed > 0) parts.push(t("autoStatusRemoved", String(state.removed)));
    ui.status.textContent = parts.join(" ");
  }

  let previous: RecoveryRecord | null = null;
  async function paintPrevious(): Promise<void> {
    const stored = await adapter.storageGet({ [PREVIOUS_KEY]: null as unknown });
    previous = (stored[PREVIOUS_KEY] ?? null) as RecoveryRecord | null;
    ui.previous.hidden = previous === null;
    if (previous) ui.previousLine.textContent = t("previousSessionLine", tabsPhrase(previous.tabs), readable(previous.capturedAt));
  }
  ui.previousPreview.addEventListener("click", () => {
    if (!previous) return;
    const session = recordSession(previous);
    if (session) void hooks.preview(session, t("autoSnapshotName", readable(previous.capturedAt)));
  });

  /*
   * The permission is asked for inside the click, before anything is awaited,
   * because a browser only shows its prompt for a request made in the gesture
   * that caused it.
   */
  ui.recent.addEventListener("click", () => {
    clearReport(ui.recentReport);
    void adapter
      .requestPermissions(["sessions"])
      .then(async (granted) => {
        if (!granted) {
          renderNote(ui.recentReport, t("recentClosedDenied"));
          return;
        }
        await paintRecent();
      })
      .catch((cause: unknown) => renderError(ui.recentReport, cause instanceof Error ? cause.message : String(cause)));
  });

  async function paintRecent(): Promise<void> {
    const items = await adapter.recentlyClosed();
    clear(ui.recentList);
    if (!items || items.length === 0) {
      ui.recentList.hidden = true;
      renderNote(ui.recentReport, t(items ? "recentClosedEmpty" : "recentClosedDenied"));
      return;
    }
    ui.recentList.hidden = false;
    for (const item of items) {
      const row = el("li", { class: "snapshot recent" });
      const first = item.tabs[0];
      const label = item.kind === "window" ? t("recentWindow", tabsPhrase(item.tabs.length)) : (first?.title || first?.url || "");
      row.appendChild(el("p", { class: "snapshot-title", text: label }));
      const detail = [item.kind === "window" && first ? (first.title || first.url) : (first?.url ?? ""), t("recentClosedAt", readable(item.closedAt))];
      row.appendChild(el("p", { class: "snapshot-meta", text: detail.filter(Boolean).join(" · ") }));
      if (item.sessionId) {
        const reopen = el("button", { class: "btn btn-secondary", text: t("recentReopen") }) as HTMLButtonElement;
        reopen.type = "button";
        const id = item.sessionId;
        reopen.addEventListener("click", () => {
          reopen.disabled = true;
          void adapter
            .restoreClosed(id)
            .then(() => paintRecent())
            .catch((cause: unknown) => renderError(ui.recentReport, cause instanceof Error ? cause.message : String(cause)));
        });
        const actions = el("div", { class: "snapshot-actions" });
        actions.appendChild(reopen);
        row.appendChild(actions);
      }
      ui.recentList.appendChild(row);
    }
  }

  adapter.onStorageChanged((keys) => {
    if (keys.includes(OFFER_KEY)) void paintOffer();
    if (keys.includes(PREVIOUS_KEY)) void paintPrevious();
    if (keys.includes(AUTO_STATE_KEY) || keys.includes("snapshots")) void paintStatus();
  });

  paintControls();
  void paintOffer();
  void paintStatus();
  void paintPrevious();

  return {
    askAfterExport(): void {
      if (settings.recoveryCopy) return;
      void (async () => {
        const stored = await adapter.storageGet({ [ASKED_KEY]: false });
        if (stored[ASKED_KEY] === true) return;
        await adapter.storageSet({ [ASKED_KEY]: true });
        ui.ask.hidden = false;
      })();
    },
    paint(latest: Settings): void {
      settings = latest;
      paintControls();
      void paintStatus();
    },
  };
}

/** The callout shape the rating ask uses: an icon, a title and text, and buttons. */
function buildCallout(
  host: HTMLElement,
  glyphPath: string,
  title: HTMLElement,
  text: HTMLElement,
  buttons: [string, string, () => void][],
): HTMLElement {
  const glyph = icon(glyphPath, 18);
  glyph.classList.add("callout-icon");
  const body = el("div", { class: "callout-body" });
  body.appendChild(title);
  body.appendChild(text);
  const actions = el("div", { class: "callout-actions" });
  for (const [label, className, action] of buttons) {
    const button = el("button", { class: className, text: label }) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", action);
    actions.appendChild(button);
  }
  host.classList.add("callout");
  host.setAttribute("role", "status");
  host.appendChild(glyph);
  host.appendChild(body);
  host.appendChild(actions);
  return actions;
}

function readable(epoch: number): string {
  const when = new Date(epoch);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
