/**
 * The manager page. Two tasks, one shell: export on one tab, import and restore on
 * the other. A popup cannot host a file dialog, which is why all file work lives
 * here (ADR-009).
 *
 * This file wires the export task. The import task is `import-panel.ts`, and the
 * preview tree it drives is `preview-tree.ts`.
 *
 * The output panel is the honesty mechanism of the product: the user reads the
 * exact bytes before trusting them.
 */
import { realAdapter } from "../../core/adapter/index.js";
import { buildExport, collectFiltered, type ExportPayload } from "../../core/export.js";
import { buildExportReport, formatBytes, totalRemoved } from "../../core/report.js";
import {
  loadSettings,
  saveSettings,
  type ExportFormat,
  type Settings,
  type SortMode,
} from "../../core/settings.js";
import { countSession } from "../../types/session.js";
import type { Scope } from "../../types/session.js";
import { must } from "../shared/dom.js";
import { applyI18n, t } from "../shared/i18n.js";
import { applyTheme } from "../shared/theme.js";
import { countsLine, tabs as tabsPhrase } from "../shared/wording.js";
import { initTabs } from "../shared/tabs.js";
import { initImportPanel } from "./import-panel.js";
import { initSnapshotPanel } from "./snapshot-panel.js";
import { readSnapshotSession, type SnapshotMeta } from "../../core/snapshots.js";
import { TABSPACK_SOURCE } from "../../core/import.js";
import { clearReport, renderError, renderExportReport, renderNote } from "../shared/report-view.js";
import { copyPayload, savePayload } from "../shared/save.js";
import { initSegmented } from "../shared/segmented.js";

const adapter = realAdapter;

const ui = {
  scope: must<HTMLDivElement>("#scope"),
  format: must<HTMLSelectElement>("#format"),
  formatNote: must<HTMLSpanElement>("#format-note"),
  titles: must<HTMLInputElement>("#opt-titles"),
  favicons: must<HTMLInputElement>("#opt-favicons"),
  incognito: must<HTMLInputElement>("#opt-incognito"),
  incognitoLabel: must<HTMLLabelElement>("#opt-incognito-label"),
  incognitoHint: must<HTMLSpanElement>("#incognito-hint"),
  dedupe: must<HTMLInputElement>("#opt-dedupe"),
  web: must<HTMLInputElement>("#opt-web"),
  pinned: must<HTMLInputElement>("#opt-pinned"),
  sort: must<HTMLSelectElement>("#opt-sort"),
  sortDesc: must<HTMLInputElement>("#opt-sort-desc"),
  exclude: must<HTMLTextAreaElement>("#opt-exclude"),
  exportButton: must<HTMLButtonElement>("#export"),
  copyButton: must<HTMLButtonElement>("#copy"),
  summary: must<HTMLSpanElement>("#summary"),
  report: must<HTMLDivElement>("#report"),
  output: must<HTMLTextAreaElement>("#output"),
  outputMeta: must<HTMLParagraphElement>("#output-meta"),
};

const FORMAT_NOTES: Record<ExportFormat, string> = {
  tabspack: "formatNotePack",
  urls: "formatNoteUrls",
  flatjson: "formatNoteFlat",
};

let settings: Settings;
let available = 0;
/** Repaints the scope control when a setting changes somewhere else. */
let scope: (value: string) => void = () => undefined;

void start().catch((error: unknown) => renderError(ui.report, t("startupFailed", describe(error))));

async function start(): Promise<void> {
  applyI18n();
  settings = await loadSettings(adapter);
  applyTheme(settings.theme);
  paintSettings();
  await gateIncognito();

  const tabs = initTabs(
    must<HTMLDivElement>("#tasks"),
    {
      export: must<HTMLDivElement>("#panel-export"),
      import: must<HTMLDivElement>("#panel-import"),
      snapshots: must<HTMLDivElement>("#panel-snapshots"),
    },
    "export",
  );
  const importPanel = initImportPanel(adapter, settings);

  initSnapshotPanel(adapter, settings, {
    async preview(meta: SnapshotMeta): Promise<void> {
      const session = await readSnapshotSession(adapter, meta.id);
      if (!session) throw new Error("That snapshot could not be read.");
      tabs.select("import");
      await importPanel.showSession(session, TABSPACK_SOURCE, meta.name);
    },
    async save(text: string, filename: string): Promise<void> {
      await savePayload(adapter, {
        format: "tabspack",
        text,
        filename,
        mime: "application/json;charset=utf-8",
        bytes: text.length,
        session: { windows: [], source: {}, capturedAt: 0 },
        removed: { scheme: 0, pinned: 0, excluded: 0, duplicate: 0 },
        recovered: 0,
      });
    },
  });

  watchSettings();
  await runHashAction(tabs.select);

  scope = initSegmented(ui.scope, settings.scope, (value) => {
    settings.scope = value as Scope;
    void persist({ scope: settings.scope });
  });

  ui.format.addEventListener("change", () => {
    settings.format = ui.format.value as ExportFormat;
    ui.formatNote.textContent = t(FORMAT_NOTES[settings.format]);
    void persist({ format: settings.format });
  });

  bindToggle(ui.titles, "textIncludeTitles");
  bindToggle(ui.favicons, "keepFavicons");
  bindToggle(ui.incognito, "includeIncognito");
  bindToggle(ui.dedupe, "dedupe");
  bindToggle(ui.web, "webPagesOnly");
  bindToggle(ui.pinned, "skipPinned");
  bindToggle(ui.sortDesc, "sortDesc");

  ui.sort.addEventListener("change", () => {
    settings.sort = ui.sort.value as SortMode;
    void persist({ sort: settings.sort });
  });

  /**
   * The exclude list is applied when the field loses focus or the user presses
   * enter, not on every keystroke: recollecting every tab on each character
   * would make typing a pattern feel like wading.
   */
  ui.exclude.addEventListener("change", () => {
    settings.excludeList = ui.exclude.value;
    void persist({ excludeList: settings.excludeList });
  });

  ui.exportButton.addEventListener("click", () => void run("save"));
  ui.copyButton.addEventListener("click", () => void run("copy"));

  await refresh();
}

/**
 * Two ways in that carry their intent in the address.
 *
 * `#import` comes from the popup's import button: a popup cannot host a file
 * picker, so it sends the user here, and arriving on the export task would make
 * them pick the task again.
 *
 * `#export=...` comes from a keyboard command on a browser that cannot write a
 * file from the background. Doing it on arrival is the point: the user already
 * asked for it, and the alternative is a page that arrives with a button they
 * have to press again.
 *
 * The hash is cleared either way, so a reload is a plain visit rather than a
 * repeat of an action the user asked for once.
 */
async function runHashAction(select: (id: string) => void): Promise<void> {
  if (location.hash === "#import") {
    history.replaceState(null, "", location.pathname);
    select("import");
    // The user pressed import one screen ago. Landing on the control that opens
    // the picker makes the next step one key, and shows where the task begins.
    must<HTMLButtonElement>("#choose-file").focus();
    return;
  }
  const match = /^#export=(all_windows|current_window)$/.exec(location.hash);
  if (!match) return;
  history.replaceState(null, "", location.pathname);
  settings.scope = match[1] as Scope;
  select("export");
  // The control has to show the scope the export is about to use, or the page
  // says one thing and does another.
  scope(settings.scope);
  await refresh();
  await run("save");
}

/**
 * The options page, another manager tab or a keyboard command can all change a
 * setting while this page is open. Rather than have two versions of the truth,
 * the page re reads them when storage says they changed, and repaints only when
 * something actually differs: otherwise the page's own writes would bounce back
 * and recollect every tab for nothing.
 */
function watchSettings(): void {
  adapter.onStorageChanged((keys) => {
    if (!keys.includes("settings")) return;
    void (async () => {
      const latest = await loadSettings(adapter);
      if (JSON.stringify(latest) === JSON.stringify(settings)) return;
      const rescan =
        latest.scope !== settings.scope ||
        latest.dedupe !== settings.dedupe ||
        latest.webPagesOnly !== settings.webPagesOnly ||
        latest.skipPinned !== settings.skipPinned ||
        latest.excludeList !== settings.excludeList ||
        latest.sort !== settings.sort ||
        latest.sortDesc !== settings.sortDesc ||
        latest.includeIncognito !== settings.includeIncognito;
      settings = latest;
      applyTheme(settings.theme);
      paintSettings();
      scope(settings.scope);
      if (rescan) await refresh();
    })();
  });
}

function paintSettings(): void {
  ui.format.value = settings.format;
  ui.formatNote.textContent = t(FORMAT_NOTES[settings.format]);
  ui.titles.checked = settings.textIncludeTitles;
  ui.favicons.checked = settings.keepFavicons;
  ui.incognito.checked = settings.includeIncognito;
  ui.dedupe.checked = settings.dedupe;
  ui.web.checked = settings.webPagesOnly;
  ui.pinned.checked = settings.skipPinned;
  ui.sort.value = settings.sort;
  ui.sortDesc.checked = settings.sortDesc;
  ui.exclude.value = settings.excludeList;
}

/**
 * A control that cannot work is disabled with a visible reason beside it, never
 * hidden: docs/DESIGN.md section 4.
 */
async function gateIncognito(): Promise<void> {
  const allowed = await adapter.isAllowedIncognitoAccess();
  if (allowed) {
    ui.incognitoHint.textContent = "";
    return;
  }
  ui.incognito.checked = false;
  ui.incognito.disabled = true;
  ui.incognitoLabel.dataset.disabled = "true";
  ui.incognitoHint.textContent = t("privateWindowsHint");
  if (settings.includeIncognito) {
    settings.includeIncognito = false;
    await saveSettings(adapter, { includeIncognito: false });
  }
}

function bindToggle(input: HTMLInputElement, key: keyof Settings): void {
  input.addEventListener("change", () => {
    (settings as unknown as Record<string, unknown>)[key] = input.checked;
    void persist({ [key]: input.checked } as Partial<Settings>);
  });
}

async function persist(patch: Partial<Settings>): Promise<void> {
  await saveSettings(adapter, patch);
  clearReport(ui.report);
  await refresh();
}

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

  try {
    const payload = await buildExport(adapter, settings);
    showOutput(payload);
    const outcome = mode === "save" ? await savePayload(adapter, payload) : await copyPayload(adapter, payload);
    if (outcome.error) {
      renderError(ui.report, outcome.error);
      return;
    }
    renderExportReport(
      ui.report,
      buildExportReport({
        session: payload.session,
        removed: payload.removed,
        recovered: payload.recovered,
        format: payload.format,
        bytes: payload.bytes,
        filename: payload.filename,
        saved: outcome.saved,
      }),
    );
  } catch (error) {
    renderError(ui.report, describe(error));
  } finally {
    button.removeAttribute("aria-busy");
    button.textContent = label;
    setEnabled(available > 0);
  }
}

/** Large outputs are truncated in the view, and the view says so. */
const PREVIEW_LIMIT = 200_000;

function showOutput(payload: ExportPayload): void {
  const counts = countSession(payload.session);
  const truncated = payload.text.length > PREVIEW_LIMIT;
  ui.output.value = truncated
    ? `${payload.text.slice(0, PREVIEW_LIMIT)}\n\n${t("outputTruncated")}`
    : payload.text;
  ui.outputMeta.textContent = `${tabsPhrase(counts.tabs)} · ${formatBytes(payload.bytes)} · ${payload.filename}`;
}

function setEnabled(enabled: boolean): void {
  ui.exportButton.disabled = !enabled;
  ui.copyButton.disabled = !enabled;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
