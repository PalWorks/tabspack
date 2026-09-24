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
import { clearReport, renderError, renderExportReport, renderNote } from "../shared/report-view.js";
import { savePayload, copyPayload } from "../shared/save.js";
import { initSegmented } from "../shared/segmented.js";

const adapter = realAdapter;

const ui = {
  summary: must<HTMLParagraphElement>("#summary"),
  scope: must<HTMLDivElement>("#scope"),
  exportButton: must<HTMLButtonElement>("#export"),
  copyButton: must<HTMLButtonElement>("#copy"),
  format: must<HTMLSelectElement>("#format"),
  report: must<HTMLDivElement>("#report"),
  manager: must<HTMLButtonElement>("#open-manager"),
};

let settings: Settings;
let available = 0;

void start();

async function start(): Promise<void> {
  settings = await loadSettings(adapter);
  ui.format.value = settings.format;

  initSegmented(ui.scope, settings.scope, (value) => {
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
  ui.manager.addEventListener("click", () => void adapter.openExtensionPage("manager.html"));

  await refresh();
}

/** Counts for the current scope, so the primary button states what it will do. */
async function refresh(): Promise<void> {
  try {
    const { session, removed } = await collectFiltered(adapter, settings);
    const counts = countSession(session);
    available = counts.tabs;
    ui.summary.textContent = summarise(counts.windows, counts.tabs, counts.groups);
    ui.exportButton.textContent = counts.tabs === 0 ? "Export" : `Export ${plural(counts.tabs, "tab")}`;
    setEnabled(counts.tabs > 0);
    if (counts.tabs === 0) {
      renderNote(
        ui.report,
        totalRemoved(removed) > 0
          ? "Every tab in this scope was removed by a filter."
          : "There is nothing to export in this scope.",
      );
    }
  } catch (error) {
    available = 0;
    setEnabled(false);
    ui.summary.textContent = "Tabs unavailable";
    renderError(ui.report, describe(error));
  }
}

async function run(mode: "save" | "copy"): Promise<void> {
  if (available === 0) return;
  const button = mode === "save" ? ui.exportButton : ui.copyButton;
  const label = button.textContent ?? "";
  setEnabled(false);
  button.textContent = "Working";
  button.setAttribute("aria-busy", "true");
  clearReport(ui.report);

  try {
    const payload = await buildExport(adapter, settings);
    const outcome = mode === "save" ? await savePayload(adapter, payload) : await copyPayload(adapter, payload);
    if (outcome.error) {
      renderError(ui.report, outcome.error);
      return;
    }
    const report = buildExportReport({
      session: payload.session,
      removed: payload.removed,
      format: payload.format,
      bytes: payload.bytes,
      filename: payload.filename,
      saved: outcome.saved,
    });
    renderExportReport(ui.report, report);
    await adapter.setBadge(badgeText(report.tabs), settings.badgeMs);
  } catch (error) {
    renderError(ui.report, describe(error));
  } finally {
    button.removeAttribute("aria-busy");
    button.textContent = label;
    setEnabled(available > 0);
  }
}

function setEnabled(enabled: boolean): void {
  ui.exportButton.disabled = !enabled;
  ui.copyButton.disabled = !enabled;
}

function summarise(windows: number, tabs: number, groups: number): string {
  const parts = [plural(windows, "window"), plural(tabs, "tab")];
  if (groups > 0) parts.push(plural(groups, "group"));
  return parts.join(" · ");
}

function badgeText(count: number): string {
  if (count <= 0) return "";
  return count < 100 ? String(count) : "99+";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
