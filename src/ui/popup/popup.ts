/**
 * The popup is a launcher: counts, a scope, one primary action. Anything that
 * needs thought lives on the manager page, per docs/DESIGN.md section 1.
 */
import { realAdapter } from "../../core/adapter/index.js";
import { buildExport, collectFiltered } from "../../core/export.js";
import { buildExportReport, totalRemoved } from "../../core/report.js";
import { loadSettings, saveSettings, type ExportFormat, type Settings } from "../../core/settings.js";
import { countSession } from "../../types/session.js";
import type { Scope } from "../../types/session.js";
import { must } from "../shared/dom.js";
import { applyI18n, t } from "../shared/i18n.js";
import { applyTheme } from "../shared/theme.js";
import { countsLine, tabs as tabsPhrase } from "../shared/wording.js";
import { clearReport, renderError, renderExportReport, renderNote } from "../shared/report-view.js";
import { savePayload, copyPayload } from "../shared/save.js";
import { initSegmented } from "../shared/segmented.js";
import { initNotifier } from "../shared/notify.js";
import { readOffer } from "../../core/durability.js";

const adapter = realAdapter;

const ui = {
  summary: must<HTMLParagraphElement>("#summary"),
  scope: must<HTMLDivElement>("#scope"),
  exportButton: must<HTMLButtonElement>("#export"),
  copyButton: must<HTMLButtonElement>("#copy"),
  format: must<HTMLSelectElement>("#format"),
  report: must<HTMLDivElement>("#report"),
  importButton: must<HTMLButtonElement>("#import"),
  settings: must<HTMLButtonElement>("#open-settings"),
};

let settings: Settings;
let available = 0;
const notify = initNotifier(adapter);
/** Repaints the scope control when a setting changes somewhere else. */
let selectScope: (value: string) => void = () => undefined;

// A failure while wiring the page would otherwise leave it looking ready and
// doing nothing.
void start().catch((error: unknown) => renderError(ui.report, t("startupFailed", describe(error))));

async function start(): Promise<void> {
  applyI18n();
  settings = await loadSettings(adapter);
  applyTheme(settings.theme);
  ui.format.value = settings.format;

  selectScope = initSegmented(ui.scope, settings.scope, (value) => {
    settings.scope = value as Scope;
    void saveSettings(adapter, { scope: settings.scope });
    clearReport(ui.report);
    void refresh();
  });

  ui.format.addEventListener("change", () => {
    settings.format = ui.format.value as ExportFormat;
    void saveSettings(adapter, { format: settings.format });
  });

  ui.exportButton.addEventListener("click", () => void run("save"));
  ui.copyButton.addEventListener("click", () => void run("copy"));
  /**
   * Import is a second primary path, but it cannot happen here: a popup closes
   * when a file picker takes focus, so the button opens the manager already on
   * the import task rather than opening a picker this window will not survive.
   */
  ui.importButton.addEventListener("click", () => void adapter.openExtensionPage("manager.html#import"));
  // A start that lost tabs, B-102. The manager holds the offer and the preview.
  void readOffer(adapter).then((offer) => {
    if (!offer) return;
    must<HTMLParagraphElement>("#recovery-text").textContent = t("recoveryOfferTitle", tabsPhrase(offer.missingTabs));
    must<HTMLDivElement>("#recovery").hidden = false;
  });
  must<HTMLButtonElement>("#recovery-open").addEventListener("click", () => void adapter.openExtensionPage("manager.html"));
  ui.settings.addEventListener("click", () => void adapter.openOptions());

  // The options page may be open in another tab while this popup is.
  adapter.onStorageChanged((keys) => {
    if (!keys.includes("settings")) return;
    void (async () => {
      const latest = await loadSettings(adapter);
      if (JSON.stringify(latest) === JSON.stringify(settings)) return;
      settings = latest;
      applyTheme(settings.theme);
      ui.format.value = settings.format;
      selectScope(settings.scope);
      await refresh();
    })();
  });

  await refresh();
}

/** Counts for the current scope, so the primary button states what it will do. */
async function refresh(): Promise<void> {
  try {
    const { session, removed } = await collectFiltered(adapter, settings);
    const counts = countSession(session);
    available = counts.tabs;
    ui.summary.textContent = countsLine(counts);
    ui.exportButton.textContent =
      counts.tabs === 0 ? t("exportButton") : t("exportButtonCount", tabsPhrase(counts.tabs));
    setEnabled(counts.tabs > 0);
    if (counts.tabs === 0) {
      renderNote(ui.report, t(totalRemoved(removed) > 0 ? "filtersEmptiedScope" : "nothingInScope"));
    }
  } catch (error) {
    available = 0;
    setEnabled(false);
    ui.summary.textContent = t("tabsUnavailable");
    renderError(ui.report, describe(error));
  }
}

async function run(mode: "save" | "copy"): Promise<void> {
  if (available === 0) return;
  const button = mode === "save" ? ui.exportButton : ui.copyButton;
  const label = button.textContent ?? "";
  setEnabled(false);
  button.textContent = t("working");
  button.setAttribute("aria-busy", "true");
  clearReport(ui.report);
  notify.working("export");

  try {
    const payload = await buildExport(adapter, settings);
    const outcome = mode === "save" ? await savePayload(adapter, payload) : await copyPayload(adapter, payload);
    if (outcome.error) {
      renderError(ui.report, outcome.error);
      notify.failed("export", t("badgeExportFailed"));
      return;
    }
    const report = buildExportReport({
      session: payload.session,
      removed: payload.removed,
      recovered: payload.recovered,
      format: payload.format,
      bytes: payload.bytes,
      filename: payload.filename,
      saved: outcome.saved,
    });
    renderExportReport(ui.report, report);
    notify.done(
      "export",
      report.tabs,
      outcome.saved
        ? t("badgeExported", tabsPhrase(report.tabs), report.filename)
        : t("badgeCopied", tabsPhrase(report.tabs)),
    );
  } catch (error) {
    renderError(ui.report, describe(error));
    notify.failed("export", t("badgeExportFailed"));
  } finally {
    button.removeAttribute("aria-busy");
    button.textContent = label;
    setEnabled(available > 0);
  }
}

/** Export and copy need tabs in scope. Import and settings never do. */
function setEnabled(enabled: boolean): void {
  ui.exportButton.disabled = !enabled;
  ui.copyButton.disabled = !enabled;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
