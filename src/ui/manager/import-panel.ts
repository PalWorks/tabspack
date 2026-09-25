/**
 * The import half of the manager page: tasks T-203, T-205, T-206, T-207.
 *
 * All file work lives here rather than in the popup, because a popup closes when
 * the file picker takes focus, which is the most common broken import in the
 * extensions this project was built against: ADR-009.
 *
 * The order on screen follows the order of the decisions a person makes. What is
 * in the file, then what was adjusted, then what to restore, then what happened.
 * Nothing is restored without an explicit click, per docs/DOMAIN.md business
 * rule 4.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import { loadPack, type SourceInfo } from "../../core/import.js";
import { dedupeKey } from "../../core/filters.js";
import type { Issue } from "../../core/issues.js";
import { errors, warnings } from "../../core/issues.js";
import { describeFidelity, describeRestore, formatBytes } from "../../core/report.js";
import { restoreSession, type RestoreReport, type RestoreTarget } from "../../core/restore.js";
import { saveSettings, type Settings } from "../../core/settings.js";
import { judgeUrl, explainVerdict } from "../../core/urls.js";
import { countSession, type Session } from "../../types/session.js";
import { clear, el, must } from "../shared/dom.js";
import { renderIssues, renderNote, renderRestoreReport, clearReport, renderError } from "../shared/report-view.js";
import { PreviewTree, tabId } from "./preview-tree.js";

interface Loaded {
  session: Session;
  source: SourceInfo;
  filename: string;
  bytes: number;
  blocked: Map<string, string>;
  duplicates: Set<string>;
}

export function initImportPanel(adapter: BrowserAdapter, settings: Settings): void {
  const ui = {
    dropzone: must<HTMLDivElement>("#dropzone"),
    picker: must<HTMLInputElement>("#file"),
    choose: must<HTMLButtonElement>("#choose-file"),
    fileMeta: must<HTMLParagraphElement>("#file-meta"),
    fidelity: must<HTMLParagraphElement>("#fidelity"),
    issues: must<HTMLDivElement>("#import-issues"),
    preview: must<HTMLElement>("#preview"),
    tree: must<HTMLDivElement>("#tree"),
    selectAll: must<HTMLButtonElement>("#select-all"),
    selectNone: must<HTMLButtonElement>("#select-none"),
    selection: must<HTMLSpanElement>("#selection-count"),
    target: must<HTMLSelectElement>("#restore-target"),
    skipDuplicates: must<HTMLInputElement>("#opt-skip-open"),
    threshold: must<HTMLInputElement>("#opt-threshold"),
    restore: must<HTMLButtonElement>("#restore"),
    groupsPermission: must<HTMLDivElement>("#groups-permission"),
    groupsPermissionText: must<HTMLParagraphElement>("#groups-permission-text"),
    allowGroups: must<HTMLButtonElement>("#allow-groups"),
    report: must<HTMLDivElement>("#restore-report"),
    restoreIssues: must<HTMLDivElement>("#restore-issues"),
  };

  let loaded: Loaded | null = null;
  /** Guards against a second file being dropped while the first is still being read. */
  let intake = 0;
  const tree = new PreviewTree(ui.tree, { onSelectionChange: () => paintSelection() });

  ui.target.value = settings.restoreTarget;
  ui.skipDuplicates.checked = settings.skipOpenDuplicates;
  ui.threshold.value = String(settings.discardThreshold);

  ui.choose.addEventListener("click", () => ui.picker.click());
  ui.picker.addEventListener("change", () => {
    const file = ui.picker.files?.[0];
    if (file) void accept(file);
  });

  for (const type of ["dragenter", "dragover"]) {
    ui.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      ui.dropzone.dataset.active = "true";
    });
  }
  for (const type of ["dragleave", "dragend"]) {
    ui.dropzone.addEventListener(type, () => delete ui.dropzone.dataset.active);
  }
  ui.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete ui.dropzone.dataset.active;
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file) void accept(file);
  });

  ui.selectAll.addEventListener("click", () => tree.setAll(true));
  ui.selectNone.addEventListener("click", () => tree.setAll(false));
  ui.target.addEventListener("change", () => {
    settings.restoreTarget = ui.target.value as RestoreTarget;
    void saveSettings(adapter, { restoreTarget: settings.restoreTarget });
  });
  ui.skipDuplicates.addEventListener("change", () => {
    settings.skipOpenDuplicates = ui.skipDuplicates.checked;
    void saveSettings(adapter, { skipOpenDuplicates: settings.skipOpenDuplicates });
    paintSelection();
  });
  ui.threshold.addEventListener("change", () => {
    const value = Number(ui.threshold.value);
    if (!Number.isFinite(value) || value < 0) {
      ui.threshold.value = String(settings.discardThreshold);
      return;
    }
    settings.discardThreshold = Math.round(value);
    void saveSettings(adapter, { discardThreshold: settings.discardThreshold });
  });
  ui.restore.addEventListener("click", () => void run());

  /**
   * The permission is requested by a click on this button rather than during the
   * restore, for two reasons. A browser only grants an optional permission inside
   * a user gesture, and a prompt that arrives with a visible explanation beside it
   * is a prompt a person can answer: PLAN.md Table P8 and docs/DESIGN.md section 4.
   */
  ui.allowGroups.addEventListener("click", () => {
    void adapter
      .requestPermissions(["tabGroups"])
      .then((granted) => {
        if (granted) {
          ui.groupsPermission.hidden = true;
          return;
        }
        ui.groupsPermissionText.textContent =
          "Tab groups were not allowed, so the tabs in this pack will be restored side by side in the right order.";
      })
      .catch(() => {
        ui.groupsPermission.hidden = true;
      });
  });

  async function accept(file: File): Promise<void> {
    const token = (intake += 1);
    clearReport(ui.report);
    clear(ui.issues);
    clear(ui.restoreIssues);
    ui.preview.hidden = true;
    ui.fileMeta.textContent = `Reading ${file.name}`;
    ui.fidelity.textContent = "";

    let text: string;
    try {
      text = await file.text();
    } catch (cause) {
      if (token !== intake) return;
      ui.fileMeta.textContent = file.name;
      renderError(ui.issues, cause instanceof Error ? cause.message : "That file could not be read.");
      return;
    }

    if (token !== intake) return;
    const result = loadPack(text);
    const bytes = new TextEncoder().encode(text).length;
    if (!result.ok || !result.session) {
      ui.fileMeta.textContent = `${file.name} · ${formatBytes(bytes)}`;
      renderIssues(ui.issues, result.issues, {
        headline:
          result.source === null
            ? "TabsPack does not recognise what is in this file."
            : "This pack cannot be imported.",
      });
      return;
    }

    const [fileAccess, openTabs] = await Promise.all([
      adapter.isAllowedFileSchemeAccess(),
      adapter.queryTabs({}).catch(() => []),
    ]);
    const openKeys = new Set(
      openTabs
        .map((tab) => (typeof tab.url === "string" && tab.url !== "" ? tab.url : (tab.pendingUrl ?? "")))
        .filter((url) => url !== "")
        .map(dedupeKey),
    );

    if (token !== intake) return;

    const blocked = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const win of result.session.windows) {
      for (const tab of win.tabs) {
        const id = tabId(win, tab);
        const verdict = judgeUrl(tab.url, { fileAccess });
        if (!verdict.openable) blocked.set(id, "cannot be opened");
        else if (openKeys.has(dedupeKey(tab.url))) duplicates.add(id);
      }
    }

    loaded = {
      session: result.session,
      source: result.source ?? { id: "tabspack", label: "TabsPack file", fidelity: "high", carries: [], missing: [] },
      filename: file.name,
      bytes,
      blocked,
      duplicates,
    };

    const counts = countSession(result.session);
    ui.fileMeta.textContent = [
      file.name,
      `${plural(counts.windows, "window")}`,
      `${plural(counts.tabs, "tab")}`,
      ...(counts.groups > 0 ? [plural(counts.groups, "group")] : []),
      formatBytes(bytes),
    ].join(" · ");
    ui.fidelity.textContent = describeFidelity(loaded.source);

    const noted = warnings(result.issues);
    if (noted.length > 0) {
      renderIssues(ui.issues, noted, {
        headline: `${plural(noted.length, "thing")} to know about this file`,
        collapsed: true,
      });
    }

    tree.load(result.session, { blocked });
    ui.preview.hidden = false;
    await gateGroupPermission(loaded.session);
    paintSelection();
  }

  function restorable(): number {
    if (!loaded) return 0;
    const selected = tree.selectedTabIds();
    let count = 0;
    for (const id of selected) {
      if (loaded.blocked.has(id)) continue;
      if (ui.skipDuplicates.checked && loaded.duplicates.has(id)) continue;
      count += 1;
    }
    return count;
  }

  function paintSelection(): void {
    if (!loaded) return;
    const count = restorable();
    const selected = tree.selectedCount();
    const parts = [`${selected} of ${tree.totalSelectable()} selected`];
    const skipped = selected - count;
    if (skipped > 0) parts.push(`${skipped} will be skipped`);
    if (loaded.blocked.size > 0) parts.push(`${loaded.blocked.size} cannot be opened`);
    ui.selection.textContent = parts.join(" · ");
    ui.restore.textContent = count === 0 ? "Restore" : `Restore ${plural(count, "tab")}`;
    ui.restore.disabled = count === 0;
  }

  /** Shown only when the pack has groups and the browser has not granted them. */
  async function gateGroupPermission(session: Session): Promise<void> {
    const groups = session.windows.reduce((sum, win) => sum + win.groups.length, 0);
    if (groups === 0) {
      ui.groupsPermission.hidden = true;
      return;
    }
    const granted = await adapter.hasPermissions(["tabGroups"]).catch(() => false);
    ui.groupsPermission.hidden = granted;
    if (!granted) {
      ui.groupsPermissionText.textContent = `This pack has ${plural(groups, "tab group")}. Restoring ${
        groups === 1 ? "it" : "them"
      } as groups needs one permission, which you can allow now or refuse and still restore the tabs.`;
    }
  }

  async function run(): Promise<void> {
    if (!loaded) return;
    const selected = tree.selectedTabIds();
    const label = ui.restore.textContent ?? "Restore";
    ui.restore.disabled = true;
    ui.restore.setAttribute("aria-busy", "true");
    clearReport(ui.report);

    try {
      const report = await restoreSession(adapter, loaded.session, {
        target: ui.target.value as RestoreTarget,
        discardThreshold: settings.discardThreshold,
        batchSize: settings.restoreBatchSize,
        batchDelayMs: settings.restoreDelayMs,
        skipDuplicates: ui.skipDuplicates.checked,
        openPlaceholder: settings.openPlaceholder,
        include: (windowKey, index) => selected.has(`${windowKey}:${index}`),
        // A live region that speaks every tab would be unusable with a screen
        // reader on a 200 tab pack, so progress is announced in stages.
        onProgress: (done, total) => {
          if (done !== total && done % 25 !== 0) return;
          renderNote(ui.report, `Restoring ${done} of ${total} tabs`);
        },
      });
      show(report);
    } catch (cause) {
      renderError(ui.report, cause instanceof Error ? cause.message : String(cause));
    } finally {
      ui.restore.removeAttribute("aria-busy");
      ui.restore.textContent = label;
      paintSelection();
    }
  }

  /** Restore notes belong beside the restore, not beside the file. */
  function show(report: RestoreReport): void {
    renderRestoreReport(ui.report, describeRestore(report));
    const issues: Issue[] = [...errors(report.issues), ...warnings(report.issues)];
    clear(ui.restoreIssues);
    if (report.unopenable.length > 0) {
      issues.push({
        code: "restore.unopenable_list",
        severity: "warning",
        path: "$",
        message: report.unopenable
          .slice(0, 12)
          .map((entry) => `${entry.url}${entry.explanation ? ` (${entry.explanation})` : ""}`)
          .join("\n"),
        fix: "These addresses are still in the file. A browser will not let any extension open them.",
      });
    }
    if (issues.length > 0) {
      renderIssues(ui.restoreIssues, issues, {
        headline: `${plural(issues.length, "note")} about this restore`,
        collapsed: true,
      });
    }
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
