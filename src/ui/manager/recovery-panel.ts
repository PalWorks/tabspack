/**
 * Durability on the manager page, M9.
 *
 * Two surfaces, one module, because they read and write the same state:
 *
 *   - the recovery offer at the top of the Export pane, after a start that
 *     lost tabs (B-102)
 *   - the Automatic protection card on the Snapshots pane: the recovery copy,
 *     on from install with no prompt (decision D2 as revised), automatic
 *     snapshots and their rolling limit (B-101, ADR-047), the recent sessions
 *     (B-104), and the browser's own recently closed list
 *
 * Nothing here opens a tab. Every session goes to the import preview first.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import {
  AUTO_STATE_KEY,
  OFFER_KEY,
  RECENT_KEY,
  RECOVERY_KEY,
  deleteRecent,
  dismissOffer,
  isAuto,
  keepRecent,
  readAutoState,
  readCurrent,
  readOffer,
  readPrevious,
  readRecent,
  recordSession,
  type RecoveryRecord,
} from "../../core/durability.js";
import { saveSettings, type Settings } from "../../core/settings.js";
import { listSnapshots } from "../../core/snapshots.js";
import type { Session } from "../../types/session.js";
import { clear, el, icon, ICON, must } from "../shared/dom.js";
import { t } from "../shared/i18n.js";
import { renderError, renderNote, clearReport } from "../shared/report-view.js";
import { tabs as tabsPhrase, windows as windowsPhrase } from "../shared/wording.js";

export interface RecoveryHooks {
  /** Hands a session to the import preview. */
  preview(session: Session, label: string): Promise<void>;
  /** Saves a TabsPack file's text to disk. */
  save(text: string, filename: string): Promise<void>;
}

export interface RecoveryPanel {
  paint(latest: Settings): void;
}

export function initRecoveryPanel(adapter: BrowserAdapter, initial: Settings, hooks: RecoveryHooks): RecoveryPanel {
  let settings = initial;
  const ui = {
    offer: must<HTMLDivElement>("#recovery-offer"),
    recovery: must<HTMLInputElement>("#opt-recovery"),
    interval: must<HTMLSelectElement>("#opt-auto-interval"),
    keep: must<HTMLInputElement>("#opt-auto-keep"),
    status: must<HTMLParagraphElement>("#auto-status"),
    current: must<HTMLParagraphElement>("#current-session"),
    sessionsReport: must<HTMLDivElement>("#sessions-report"),
    sessions: must<HTMLUListElement>("#recent-sessions"),
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

  /* Recent sessions, B-104 ------------------------------------------------ */

  async function paintCurrent(): Promise<void> {
    const current = settings.recoveryCopy ? await readCurrent(adapter) : null;
    ui.current.hidden = current === null;
    if (current) ui.current.textContent = t("currentSessionLine", tabsPhrase(current.tabs), readable(current.capturedAt));
  }

  async function paintSessions(): Promise<void> {
    const list = await readRecent(adapter);
    clear(ui.sessions);
    if (list.length === 0) {
      ui.sessions.appendChild(el("li", { class: "hint", text: t(settings.recoveryCopy ? "recentSessionsEmpty" : "recentSessionsOff") }));
      return;
    }
    for (const record of list) ui.sessions.appendChild(sessionRow(record));
  }

  function sessionRow(record: RecoveryRecord): HTMLLIElement {
    const name = t("recentSessionName", readable(record.capturedAt));
    const row = el("li", { class: "snapshot recent" }) as HTMLLIElement;
    row.appendChild(el("p", { class: "snapshot-title", text: name }));
    row.appendChild(el("p", { class: "snapshot-meta", text: [windowsPhrase(record.windows), tabsPhrase(record.tabs)].join(" · ") }));
    const actions = el("div", { class: "snapshot-actions" });
    actions.appendChild(
      action(t("previewButton"), async () => {
        const session = recordSession(record);
        if (!session) throw new Error(t("snapshotUnreadable"));
        await hooks.preview(session, name);
      }),
    );
    actions.appendChild(
      action(t("keepRecentButton"), async () => {
        const meta = await keepRecent(adapter, record.capturedAt, name);
        if (!meta) throw new Error(t("snapshotUnreadable"));
        renderNote(ui.sessionsReport, t("keptRecent", meta.name));
      }),
    );
    actions.appendChild(action(t("exportSnapshotButton"), async () => await hooks.save(record.text, `${fileName(record.capturedAt)}.tabspack.json`)));
    actions.appendChild(armedDelete(async () => await deleteRecent(adapter, record.capturedAt)));
    row.appendChild(actions);
    return row;
  }

  function action(label: string, run: () => Promise<void>): HTMLButtonElement {
    const node = el("button", { class: "btn btn-secondary", text: label }) as HTMLButtonElement;
    node.type = "button";
    node.addEventListener("click", () => {
      clearReport(ui.sessionsReport);
      void run().catch((cause: unknown) => renderError(ui.sessionsReport, cause instanceof Error ? cause.message : String(cause)));
    });
    return node;
  }

  /** Two presses, as a snapshot's delete: the button says so in between. */
  function armedDelete(run: () => Promise<void>): HTMLButtonElement {
    const node = el("button", { class: "btn btn-secondary danger", text: t("deleteButton") }) as HTMLButtonElement;
    node.type = "button";
    let timer: ReturnType<typeof setTimeout> | null = null;
    node.addEventListener("click", () => {
      if (node.dataset.armed !== "true") {
        node.dataset.armed = "true";
        node.textContent = t("deleteConfirm");
        timer = setTimeout(() => {
          delete node.dataset.armed;
          node.textContent = t("deleteButton");
        }, 4000);
        return;
      }
      if (timer) clearTimeout(timer);
      void run().catch((cause: unknown) => renderError(ui.sessionsReport, cause instanceof Error ? cause.message : String(cause)));
    });
    return node;
  }

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
    if (keys.includes(RECENT_KEY)) void paintSessions();
    if (keys.includes(RECOVERY_KEY)) void paintCurrent();
    if (keys.includes(AUTO_STATE_KEY) || keys.includes("snapshots")) void paintStatus();
  });

  paintControls();
  void paintOffer();
  void paintStatus();
  void paintCurrent();
  void paintSessions();

  return {
    paint(latest: Settings): void {
      settings = latest;
      paintControls();
      void paintStatus();
      void paintCurrent();
      void paintSessions();
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

/** `tabspack-session-20260926-2231`, the same shape an export's name has. */
function fileName(epoch: number): string {
  const when = new Date(epoch);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `tabspack-session-${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}`;
}

function readable(epoch: number): string {
  const when = new Date(epoch);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
