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
import { loadPack, MAX_IMPORT_BYTES, tooLargeIssue, type SourceInfo } from "../../core/import.js";
import { dedupeKey } from "../../core/filters.js";
import type { Issue } from "../../core/issues.js";
import { errors, warnings } from "../../core/issues.js";
import { describeRestore, formatBytes } from "../../core/report.js";
import { restoreSession, type RestoreReport, type RestoreTarget } from "../../core/restore.js";
import { saveSettings, type Settings } from "../../core/settings.js";
import { judgeUrl, explainVerdict } from "../../core/urls.js";
import { countSession, type Session } from "../../types/session.js";
import { clear, must } from "../shared/dom.js";
import { plural as pluralUnit, t } from "../shared/i18n.js";
import { fidelityLine, tabs as tabsPhrase, windows as windowsPhrase, groups as groupsPhrase } from "../shared/wording.js";
import { renderIssues, renderNote, renderRestoreReport, clearReport, renderError } from "../shared/report-view.js";
import { PreviewTree, tabId, type TreeStrings } from "./preview-tree.js";
import { initGroupsCallout } from "../shared/groups-callout.js";
import { initNotifier } from "../shared/notify.js";

interface Loaded {
  session: Session;
  source: SourceInfo;
  filename: string;
  bytes: number;
  blocked: Map<string, string>;
  duplicates: Set<string>;
}

export interface ImportPanel {
  /** Shows a session that did not come from a file, such as a snapshot. */
  showSession(session: Session, source: SourceInfo, label: string): Promise<void>;
  /** Repaints the restore controls from settings changed somewhere else. */
  paint(latest: Settings): void;
}

export function initImportPanel(
  adapter: BrowserAdapter,
  settings: Settings,
  rating: { used(action: "export" | "restore"): void },
): ImportPanel {
  const ui = {
    dropzone: must<HTMLDivElement>("#dropzone"),
    intake: must<HTMLElement>("#intake"),
    intakeToggle: must<HTMLButtonElement>("#intake-toggle"),
    picker: must<HTMLInputElement>("#file"),
    choose: must<HTMLButtonElement>("#choose-file"),
    fileMeta: must<HTMLParagraphElement>("#file-meta"),
    fidelity: must<HTMLParagraphElement>("#fidelity"),
    issues: must<HTMLDivElement>("#import-issues"),
    preview: must<HTMLElement>("#preview"),
    tree: must<HTMLDivElement>("#tree"),
    search: must<HTMLInputElement>("#tree-search"),
    selectAll: must<HTMLButtonElement>("#select-all"),
    selectNone: must<HTMLButtonElement>("#select-none"),
    selection: must<HTMLSpanElement>("#selection-count"),
    target: must<HTMLSelectElement>("#restore-target"),
    skipDuplicates: must<HTMLInputElement>("#opt-skip-open"),
    unload: must<HTMLInputElement>("#opt-unload"),
    placeholder: must<HTMLInputElement>("#opt-placeholder"),
    threshold: must<HTMLInputElement>("#opt-threshold"),
    restore: must<HTMLButtonElement>("#restore"),
    report: must<HTMLDivElement>("#restore-report"),
    restoreIssues: must<HTMLDivElement>("#restore-issues"),
  };

  const strings: TreeStrings = {
    tabs: tabsPhrase,
    groups: groupsPhrase,
    pinned: (count) => t("pinnedCount", String(count)),
    window: (ordinal) => t("windowOrdinal", String(ordinal)),
    unnamedGroup: t("unnamedGroup"),
  };

  let loaded: Loaded | null = null;
  /** Guards against a second file being dropped while the first is still being read. */
  let intake = 0;
  const notify = initNotifier(adapter);
  const tree = new PreviewTree(ui.tree, { onSelectionChange: () => paintSelection() });

  /*
   * The same offer the export pane makes, for the other half of the same
   * problem: without the permission a restore recreates the clusters but not
   * their names or colours. Granting it repaints the preview, because the tree
   * shows what will actually happen: ADR-030.
   */
  const groupsCallout = initGroupsCallout(must<HTMLDivElement>("#groups-permission"), adapter, {
    intent: "restore",
    onGranted: () => {
      if (loaded) void gateGroupPermission(loaded.session);
    },
  });

  paintPolicy(settings);

  /**
   * Folds the drop target away once there is a pack to look at, and back when
   * the user wants another file. The button is the only way back, so it is the
   * only control the folded card shows.
   */
  function collapseIntake(collapsed: boolean): void {
    ui.intake.dataset.collapsed = collapsed ? "true" : "false";
    ui.intakeToggle.hidden = !collapsed;
    ui.intakeToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  ui.intakeToggle.addEventListener("click", () => {
    collapseIntake(false);
    ui.choose.focus();
  });

  ui.choose.addEventListener("click", () => ui.picker.click());
  ui.picker.addEventListener("change", () => {
    const file = ui.picker.files?.[0];
    // Clearing the value is what lets the same file be chosen twice: an input
    // whose value has not changed fires no event, and a person who fixed their
    // file and picked it again would get nothing.
    ui.picker.value = "";
    if (file) void intake_(file);
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
    if (file) void intake_(file);
  });

  ui.selectAll.addEventListener("click", () => tree.setAll(true));
  ui.selectNone.addEventListener("click", () => tree.setAll(false));
  ui.search.addEventListener("input", () => {
    tree.setQuery(ui.search.value);
    paintSelection();
  });
  ui.target.addEventListener("change", () => {
    settings.restoreTarget = ui.target.value as RestoreTarget;
    void saveSettings(adapter, { restoreTarget: settings.restoreTarget });
  });
  ui.skipDuplicates.addEventListener("change", () => {
    settings.skipOpenDuplicates = ui.skipDuplicates.checked;
    void saveSettings(adapter, { skipOpenDuplicates: settings.skipOpenDuplicates });
    paintSelection();
  });
  ui.unload.addEventListener("change", () => {
    settings.unloadRestored = ui.unload.checked;
    ui.threshold.disabled = settings.unloadRestored;
    void saveSettings(adapter, { unloadRestored: settings.unloadRestored });
  });
  /*
   * Whether a restore opens the page listing the addresses no extension may
   * open. It belongs beside the restore it changes, not on a settings page.
   */
  ui.placeholder.addEventListener("change", () => {
    settings.openPlaceholder = ui.placeholder.checked;
    void saveSettings(adapter, { openPlaceholder: settings.openPlaceholder });
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
   * The same preview, the same restore, for something that was never a file. A
   * snapshot opened from its own panel lands here rather than getting a second
   * restore path of its own.
   */
  async function showSession(session: Session, source: SourceInfo, label: string): Promise<void> {
    intake += 1;
    clearReport(ui.report);
    clear(ui.issues);
    clear(ui.restoreIssues);
    ui.search.value = "";

    const marks = await markTabs(session);
    loaded = { session, source, filename: label, bytes: 0, ...marks };

    const counts = countSession(session);
    ui.fileMeta.textContent = [
      label,
      windowsPhrase(counts.windows),
      tabsPhrase(counts.tabs),
      ...(counts.groups > 0 ? [groupsPhrase(counts.groups)] : []),
    ].join(" · ");
    ui.fidelity.textContent = fidelityLine(source);
    ui.fidelity.dataset.fidelity = source.fidelity;

    // Revealed before the tree is filled, for the same reason as a file: the
    // tree measures its own viewport and cannot measure a hidden one.
    ui.preview.hidden = false;
    tree.load(session, { blocked: marks.blocked, strings });
    collapseIntake(true);
    await gateGroupPermission(session);
    paintSelection();
  }

  /** Which tabs cannot be opened at all, and which are already open. */
  async function markTabs(session: Session): Promise<{ blocked: Map<string, string>; duplicates: Set<string> }> {
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
    const blocked = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const win of session.windows) {
      for (const tab of win.tabs) {
        const id = tabId(win, tab);
        const verdict = judgeUrl(tab.url, { fileAccess });
        if (!verdict.openable) blocked.set(id, t("cannotBeOpenedFlag"));
        else if (openKeys.has(dedupeKey(tab.url))) duplicates.add(id);
      }
    }
    return { blocked, duplicates };
  }

  /**
   * Every way a file arrives goes through here, so that a failure anywhere in
   * the read reaches the screen. It used to be an unhandled rejection: the file
   * line said the pack had been read and the preview simply never appeared,
   * which is exactly what a user reported: ADR-031.
   */
  async function intake_(file: File): Promise<void> {
    try {
      await accept(file);
    } catch (cause) {
      renderError(ui.issues, cause instanceof Error ? cause.message : t("fileUnreadable"));
      ui.preview.hidden = true;
      collapseIntake(false);
    }
  }

  async function accept(file: File): Promise<void> {
    const token = (intake += 1);
    clearReport(ui.report);
    clear(ui.issues);
    clear(ui.restoreIssues);
    ui.preview.hidden = true;
    ui.search.value = "";
    ui.fileMeta.textContent = t("readingFile", file.name);
    ui.fidelity.textContent = "";
    delete ui.fidelity.dataset.fidelity;

    if (file.size > MAX_IMPORT_BYTES) {
      // Checked before the read, so an enormous file costs a sentence rather
      // than the memory of the tab it was dropped on.
      ui.fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
      renderIssues(ui.issues, [tooLargeIssue(file.size)], { headline: t("packNotImportable") });
      collapseIntake(false);
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (cause) {
      if (token !== intake) return;
      ui.fileMeta.textContent = file.name;
      renderError(ui.issues, cause instanceof Error ? cause.message : t("fileUnreadable"));
      collapseIntake(false);
      return;
    }

    if (token !== intake) return;
    const result = loadPack(text, { recoverSuspended: settings.recoverSuspended });
    const bytes = new TextEncoder().encode(text).length;
    if (!result.ok || !result.session) {
      ui.fileMeta.textContent = `${file.name} · ${formatBytes(bytes)}`;
      renderIssues(ui.issues, result.issues, {
        headline: t(result.source === null ? "fileUnrecognised" : "packNotImportable"),
      });
      collapseIntake(false);
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
        if (!verdict.openable) blocked.set(id, t("cannotBeOpenedFlag"));
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
      windowsPhrase(counts.windows),
      tabsPhrase(counts.tabs),
      ...(counts.groups > 0 ? [groupsPhrase(counts.groups)] : []),
      // The addresses on screen are not the addresses in the file, so the line
      // that describes the file says so: ADR-023.
      ...(result.recovered ? [t("recoveredInFile", String(result.recovered))] : []),
      formatBytes(bytes),
    ].join(" · ");
    ui.fidelity.textContent = fidelityLine(loaded.source);
    ui.fidelity.dataset.fidelity = loaded.source.fidelity;

    const noted = warnings(result.issues);
    if (noted.length > 0) {
      renderIssues(ui.issues, noted, {
        headline: pluralUnit(noted.length, "thingsToKnow"),
        collapsed: true,
      });
    }

    /*
     * Shown before the tree is filled, not after. The tree only puts the rows
     * inside its viewport into the document, and it cannot measure a viewport
     * that is still `display: none`: it falls back to a guess, which is a guess
     * about the one thing the user is looking at. Revealing first means the
     * first paint is measured against the real box: ADR-031.
     */
    ui.preview.hidden = false;
    tree.load(result.session, { blocked, strings });
    await gateGroupPermission(loaded.session);
    paintSelection();
    collapseIntake(true);
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
    const parts = [t("selectedOf", String(selected), String(tree.totalSelectable()))];
    if (tree.searching()) parts.push(t("shownCount", String(tree.shownCount())));
    const skipped = selected - count;
    if (skipped > 0) parts.push(t("willBeSkipped", String(skipped)));
    if (loaded.blocked.size > 0) parts.push(pluralUnit(loaded.blocked.size, "restore_unopenable"));
    ui.selection.textContent = parts.join(" · ");
    ui.restore.textContent = count === 0 ? t("restoreButton") : t("restoreButtonCount", tabsPhrase(count));
    ui.restore.disabled = count === 0;
  }

  /**
   * Shown only when the pack has groups and the browser has not granted them.
   * The callout itself is `shared/groups-callout.ts`, because the export side
   * needs exactly the same offer for a different reason: ADR-030.
   */
  async function gateGroupPermission(session: Session): Promise<void> {
    const groups = session.windows.reduce((sum, win) => sum + win.groups.length, 0);
    await groupsCallout.update(groups);
  }

  async function run(): Promise<void> {
    if (!loaded) return;
    const selected = tree.selectedTabIds();
    const label = ui.restore.textContent ?? "Restore";
    ui.restore.disabled = true;
    ui.restore.setAttribute("aria-busy", "true");
    clearReport(ui.report);
    /*
     * A restore of two hundred tabs takes long enough that the user goes back
     * to what they were doing, and the manager page ends up behind everything.
     * The toolbar is the one surface they can still see: ADR-033.
     */
    notify.working("import");

    try {
      const report = await restoreSession(adapter, loaded.session, {
        target: ui.target.value as RestoreTarget,
        unloadRestored: ui.unload.checked,
        discardThreshold: settings.discardThreshold,
        batchSize: settings.restoreBatchSize,
        batchDelayMs: settings.restoreDelayMs,
        skipDuplicates: ui.skipDuplicates.checked,
        openPlaceholder: ui.placeholder.checked,
        include: (windowKey, index) => selected.has(`${windowKey}:${index}`),
        // A live region that speaks every tab would be unusable with a screen
        // reader on a 200 tab pack, so progress is announced in stages.
        onProgress: (done, total) => {
          if (done !== total && done % 25 !== 0) return;
          renderNote(ui.report, t("restoringProgress", String(done), String(total)));
        },
      });
      show(report);
      if (report.ok && report.restored > 0) rating.used("restore");
      if (report.ok) notify.done("import", report.restored, t("badgeRestored", tabsPhrase(report.restored)));
      else notify.failed("import", t("badgeImportFailed"));
    } catch (cause) {
      renderError(ui.report, cause instanceof Error ? cause.message : String(cause));
      notify.failed("import", t("badgeImportFailed"));
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
        fix: t("unopenableListFix"),
      });
    }
    if (issues.length > 0) {
      renderIssues(ui.restoreIssues, issues, {
        headline: pluralUnit(issues.length, "restoreNotes"),
        collapsed: true,
      });
    }
  }

  /**
   * The restore controls, from whatever settings are current. These controls
   * write settings, so they also have to follow a setting changed somewhere
   * else: without this, Reset in Settings left stale values on screen that the
   * next restore would then have used.
   */
  function paintPolicy(latest: Settings): void {
    ui.target.value = latest.restoreTarget;
    ui.skipDuplicates.checked = latest.skipOpenDuplicates;
    ui.unload.checked = latest.unloadRestored;
    ui.placeholder.checked = latest.openPlaceholder;
    ui.threshold.value = String(latest.discardThreshold);
    ui.threshold.disabled = latest.unloadRestored;
  }

  return { showSession, paint: paintPolicy };
}


