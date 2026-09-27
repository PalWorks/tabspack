/**
 * Snapshots on the manager page, tasks T-402, T-403 and T-405.
 *
 * A snapshot is the answer to "save this, I do not want to think about where a
 * file goes". The panel is therefore one button and a list, and everything else
 * is on the row it belongs to.
 *
 * Restoring is deliberately not on this panel. A snapshot opens in the preview
 * on the import task, and the restore happens there, so there is exactly one
 * path that opens tabs and it always shows what it will open first: docs/DOMAIN.md
 * business rule 4.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import { collectSession } from "../../core/collect.js";
import { loadPack } from "../../core/import.js";
import { errors } from "../../core/issues.js";
import { formatBytes } from "../../core/report.js";
import { toFile, stringify } from "../../core/serialize.js";
import {
  defaultSnapshotName,
  deleteSnapshot,
  listSnapshots,
  readSnapshotSession,
  readSnapshotText,
  renameSnapshot,
  saveSnapshot,
  tagSnapshot,
  usage,
  type SnapshotMeta,
  type Usage,
} from "../../core/snapshots.js";
import type { Settings } from "../../core/settings.js";
import { countSession, type Session } from "../../types/session.js";
import { combine, diffSessions, isEmptyDiff, overlap, sessionOfTabs, signature, tidyCandidates, type TabRef } from "../../core/compare.js";
import { isAuto } from "../../core/durability.js";
import { clear, el, must } from "../shared/dom.js";
import { plural as pluralUnit, t } from "../shared/i18n.js";
import { tabs as tabsPhrase, windows as windowsPhrase, groups as groupsPhrase } from "../shared/wording.js";
import { clearReport, renderError, renderNote, renderSuccess } from "../shared/report-view.js";

export interface SnapshotPanelHooks {
  /** Hands a saved session to the import task's preview. */
  preview(meta: SnapshotMeta): Promise<void>;
  /** Writes a file, reusing the same path as an export. */
  save(text: string, filename: string): Promise<void>;
  /** Hands any session, such as the tabs a comparison found, to the import preview. */
  previewSession(session: Session, label: string): Promise<void>;
}

const CONFIRM_MS = 4000;

export function initSnapshotPanel(
  adapter: BrowserAdapter,
  settings: Settings,
  hooks: SnapshotPanelHooks,
): { refresh(): Promise<void> } {
  const ui = {
    name: must<HTMLInputElement>("#snapshot-name"),
    save: must<HTMLButtonElement>("#save-snapshot"),
    addFile: must<HTMLButtonElement>("#add-snapshot-file"),
    file: must<HTMLInputElement>("#snapshot-file"),
    usage: must<HTMLSpanElement>("#snapshot-usage"),
    warning: must<HTMLDivElement>("#snapshot-warning"),
    report: must<HTMLDivElement>("#snapshot-report"),
    list: must<HTMLUListElement>("#snapshot-list"),
    empty: must<HTMLParagraphElement>("#snapshot-empty"),
    combine: must<HTMLButtonElement>("#combine-snapshots"),
    tidy: must<HTMLButtonElement>("#tidy-snapshots"),
    overlap: must<HTMLButtonElement>("#overlap-snapshots"),
    combineHint: must<HTMLSpanElement>("#combine-hint"),
    analysis: must<HTMLDivElement>("#snapshot-analysis"),
  };

  /** Newest first, as the list shows them. */
  let current: SnapshotMeta[] = [];
  /** Ticked for combining, B-201. */
  const selected = new Set<string>();

  ui.combine.addEventListener("click", () => void combineSelected().catch(report));
  ui.tidy.addEventListener("click", () => void proposeTidy().catch(report));
  ui.overlap.addEventListener("click", () => void showOverlap().catch(report));

  ui.save.addEventListener("click", () => void saveCurrent());
  ui.addFile.addEventListener("click", () => ui.file.click());
  ui.file.addEventListener("change", () => {
    const file = ui.file.files?.[0];
    if (file) void addFile(file);
  });

  // Another page, or a keyboard command, may have saved one. Rather than show a
  // stale list, redraw when storage changes underneath us.
  adapter.onStorageChanged((keys) => {
    if (keys.some((key) => key === "snapshots" || key.startsWith("snapshot:"))) void refresh();
  });

  async function saveCurrent(): Promise<void> {
    clearReport(ui.report);
    ui.save.disabled = true;
    try {
      const session = await collectSession(adapter, {
        scope: "all_windows",
        includeIncognito: settings.includeIncognito,
      });
      const counts = countSession(session);
      if (counts.tabs === 0) {
        renderNote(ui.report, t("nothingOpenToSave"));
        return;
      }
      const now = new Date();
      const chosen = ui.name.value.trim();
      const { meta } = await saveSnapshot(adapter, session, {
        name: chosen === "" ? defaultSnapshotName(now, counts) : chosen,
        now,
      });
      ui.name.value = "";
      renderSuccess(ui.report, t("snapshotSaved", meta.name, tabsPhrase(counts.tabs), windowsPhrase(counts.windows)));
      await refresh();
    } catch (cause) {
      renderError(ui.report, cause instanceof Error ? cause.message : String(cause));
    } finally {
      ui.save.disabled = false;
    }
  }

  /** T-403: a file becomes a snapshot without a single tab being opened. */
  async function addFile(file: File): Promise<void> {
    clearReport(ui.report);
    try {
      const result = loadPack(await file.text(), { recoverSuspended: settings.recoverSuspended });
      if (!result.ok || !result.session) {
        renderError(ui.report, errors(result.issues)[0]?.message ?? t("fileUnreadable"));
        return;
      }
      const counts = countSession(result.session);
      const { meta } = await saveSnapshot(adapter, result.session, {
        name: result.session.name ?? file.name.replace(/\.(tabspack\.)?json$/i, ""),
      });
      renderSuccess(ui.report, t("snapshotAdded", meta.name, file.name, tabsPhrase(counts.tabs)));
      await refresh();
    } catch (cause) {
      renderError(ui.report, cause instanceof Error ? cause.message : String(cause));
    } finally {
      ui.file.value = "";
    }
  }

  /**
   * Storage can refuse a write, most plausibly when it is full, which is the one
   * failure this panel exists to warn about. Saying nothing would be the worst
   * possible response to it.
   */
  function report(cause: unknown): void {
    renderError(ui.report, cause instanceof Error ? cause.message : String(cause));
  }

  async function refresh(): Promise<void> {
    const [list, room] = await Promise.all([listSnapshots(adapter), usage(adapter)]);
    current = list;
    for (const id of [...selected]) if (!list.some((meta) => meta.id === id)) selected.delete(id);
    paintUsage(room);
    clear(ui.list);
    ui.empty.hidden = list.length > 0;
    for (const meta of list) ui.list.appendChild(row(meta));
    paintTools();
  }

  function paintTools(): void {
    ui.combine.disabled = selected.size < 2;
    ui.combine.textContent = selected.size >= 2 ? `${t("combineButton")} (${selected.size})` : t("combineButton");
    ui.combineHint.hidden = selected.size >= 2 || current.length < 2;
    ui.tidy.disabled = current.length < 2;
    ui.overlap.disabled = current.length < 3;
  }

  /* Comparing, tidying, overlap and combining, B-103 and B-201 ------------ */

  async function sessionsOf(metas: SnapshotMeta[]): Promise<{ meta: SnapshotMeta; session: Session }[]> {
    const out: { meta: SnapshotMeta; session: Session }[] = [];
    for (const meta of metas) {
      const session = await readSnapshotSession(adapter, meta.id);
      if (session) out.push({ meta, session });
    }
    return out;
  }

  function panel(headline: string): HTMLElement {
    clear(ui.analysis);
    ui.analysis.hidden = false;
    const close = el("button", { class: "btn btn-secondary analysis-close", text: t("cancelButton") }) as HTMLButtonElement;
    close.type = "button";
    close.addEventListener("click", () => {
      ui.analysis.hidden = true;
      clear(ui.analysis);
    });
    const head = el("div", { class: "analysis-head" });
    head.appendChild(el("p", { class: "analysis-title", text: headline }));
    head.appendChild(close);
    ui.analysis.appendChild(head);
    return ui.analysis;
  }

  async function compareWithPrevious(meta: SnapshotMeta): Promise<void> {
    const index = current.findIndex((entry) => entry.id === meta.id);
    const older = current[index + 1];
    if (!older) {
      renderNote(ui.report, t("compareNothingBefore"));
      return;
    }
    const [before, after] = await Promise.all([readSnapshotSession(adapter, older.id), readSnapshotSession(adapter, meta.id)]);
    if (!before || !after) {
      renderError(ui.report, t("snapshotUnreadable"));
      return;
    }
    const diff = diffSessions(before, after);
    if (isEmptyDiff(diff)) {
      panel(t("compareSame", older.name, meta.name));
      return;
    }
    const host = panel(t("compareHeadline", older.name, meta.name));
    const section = (unit: string, list: TabRef[], openAs?: string): void => {
      if (list.length === 0) return;
      const box = el("details", { class: "analysis-section" });
      box.appendChild(el("summary", { text: pluralUnit(list.length, unit) }));
      const items = el("ul", { class: "analysis-list" });
      for (const tab of list.slice(0, 200)) items.appendChild(el("li", { text: tab.title ? `${tab.title} · ${tab.url}` : tab.url }));
      box.appendChild(items);
      if (openAs) {
        box.appendChild(
          button(t("diffOpen"), async () => {
            await hooks.previewSession(sessionOfTabs(list, openAs), openAs);
          }),
        );
      }
      host.appendChild(box);
    };
    section("diff_added", diff.added, t("diffAddedTitle", meta.name));
    section("diff_removed", diff.removed, t("diffRemovedTitle", older.name));
    section("diff_moved", diff.moved);
    section("diff_regrouped", diff.regrouped);
  }

  async function proposeTidy(): Promise<void> {
    clearReport(ui.report);
    const read = await sessionsOf([...current].reverse());
    const doomed = tidyCandidates(read.map(({ meta, session }) => ({ id: meta.id, signature: signature(session) })));
    if (doomed.length === 0) {
      panel(t("tidyNone"));
      return;
    }
    const host = panel(t("tidyList"));
    const items = el("ul", { class: "analysis-list" });
    const names = current.filter((meta) => doomed.includes(meta.id));
    for (const meta of names) items.appendChild(el("li", { text: `${meta.name} · ${readableDate(meta.createdAt)}` }));
    host.appendChild(items);
    const confirm = el("button", { class: "btn btn-secondary danger", text: t("tidyConfirm", pluralUnit(names.length, "snapshots")) }) as HTMLButtonElement;
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void (async () => {
        for (const meta of names) await deleteSnapshot(adapter, meta.id);
        ui.analysis.hidden = true;
        renderSuccess(ui.report, t("tidyDone", pluralUnit(names.length, "snapshots")));
        await refresh();
      })().catch(report);
    });
    host.appendChild(confirm);
  }

  async function showOverlap(): Promise<void> {
    clearReport(ui.report);
    const read = await sessionsOf(current);
    const found = overlap(read.map(({ meta, session }) => ({ id: meta.id, session })));
    if (found.length === 0) {
      panel(t("overlapNone"));
      return;
    }
    const host = panel(t("overlapHeadline", String(found.length)));
    const nameOf = new Map(current.map((meta) => [meta.id, meta.name]));
    const items = el("ul", { class: "analysis-list" });
    for (const entry of found.slice(0, 100)) {
      const item = el("li", { text: `${entry.title || entry.url} · ${t("overlapIn", String(entry.snapshots.length))}` });
      item.title = entry.snapshots.map((id) => nameOf.get(id) ?? id).join(", ");
      items.appendChild(item);
    }
    host.appendChild(items);
  }

  async function combineSelected(): Promise<void> {
    clearReport(ui.report);
    const chosen = current.filter((meta) => selected.has(meta.id));
    if (chosen.length < 2) return;
    const read = await sessionsOf(chosen);
    const name = t("combineName", pluralUnit(read.length, "snapshots"));
    const merged = combine(read.map((entry) => entry.session), name);
    const counts = countSession(merged);
    const { meta } = await saveSnapshot(adapter, merged, { name });
    selected.clear();
    const host = panel(t("combineDone", meta.name, tabsPhrase(counts.tabs)));
    const originals = chosen.map((entry) => entry.id);
    const remove = el("button", { class: "btn btn-secondary danger", text: t("combineDeleteOriginals", String(originals.length)) }) as HTMLButtonElement;
    remove.type = "button";
    let armed = false;
    remove.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        remove.textContent = t("deleteConfirm");
        return;
      }
      remove.disabled = true;
      void (async () => {
        for (const id of originals) await deleteSnapshot(adapter, id);
        ui.analysis.hidden = true;
        renderNote(ui.report, t("combineDeleted", String(originals.length)));
        await refresh();
      })().catch(report);
    });
    host.appendChild(remove);
    await refresh();
  }

  function paintUsage(room: Usage): void {
    ui.usage.textContent = t("storageUsed", formatBytes(room.bytes), formatBytes(room.cap));
    ui.warning.hidden = !room.warn;
    if (room.warn) {
      clear(ui.warning);
      ui.warning.appendChild(
        el("p", { class: "notice-text", text: t("storageNearlyFull") }),
      );
    }
  }

  function row(meta: SnapshotMeta): HTMLLIElement {
    const item = el("li", { class: "snapshot" });

    const pick = el("input", { class: "snapshot-select" }) as HTMLInputElement;
    pick.type = "checkbox";
    pick.checked = selected.has(meta.id);
    pick.setAttribute("aria-label", t("snapshotSelectAria", meta.name));
    pick.addEventListener("change", () => {
      if (pick.checked) selected.add(meta.id);
      else selected.delete(meta.id);
      paintTools();
    });
    item.appendChild(pick);

    const name = el("input", { class: "snapshot-name" }) as HTMLInputElement;
    name.value = meta.name;
    name.setAttribute("aria-label", t("snapshotNameAria", readableDate(meta.createdAt)));
    name.addEventListener("change", () => {
      void renameSnapshot(adapter, meta.id, name.value.trim() || meta.name)
        .then(() => refresh())
        .catch(report);
    });
    item.appendChild(name);

    const line = item.appendChild(
      el("p", {
        class: "snapshot-meta",
        text: [
          windowsPhrase(meta.counts.windows),
          tabsPhrase(meta.counts.tabs),
          ...(meta.counts.groups > 0 ? [groupsPhrase(meta.counts.groups)] : []),
          formatBytes(meta.bytes),
          readableDate(meta.createdAt),
        ].join(" · "),
      }),
    );
    // An automatic snapshot says so, in the line that describes it: ADR-047.
    if (isAuto(meta)) line.prepend(el("span", { class: "auto-chip", text: t("autoChip") }));

    const tags = el("input", { class: "snapshot-tags" }) as HTMLInputElement;
    tags.value = meta.tags.join(", ");
    tags.placeholder = t("snapshotTagsPlaceholder");
    tags.setAttribute("aria-label", t("snapshotTagsAria", meta.name));
    tags.addEventListener("change", () => {
      void tagSnapshot(adapter, meta.id, tags.value.split(","))
        .then(() => refresh())
        .catch(report);
    });
    item.appendChild(tags);

    const actions = el("div", { class: "snapshot-actions" });
    actions.appendChild(
      button(t("previewButton"), async () => {
        await hooks.preview(meta);
      }),
    );
    actions.appendChild(
      button(t("exportSnapshotButton"), async () => {
        const text = (await readSnapshotText(adapter, meta.id)) ?? fallbackText(await readSnapshotSession(adapter, meta.id));
        if (text === null) {
          renderError(ui.report, t("snapshotUnreadable"));
          return;
        }
        await hooks.save(text, `${fileNameOf(meta)}.tabspack.json`);
      }),
    );
    actions.appendChild(
      button(t("compareButton"), async () => {
        await compareWithPrevious(meta);
      }),
    );
    actions.appendChild(deleteButton(meta));
    item.appendChild(actions);
    return item;
  }

  /** Two presses to delete, and the button says so in between. No modal dialog. */
  function deleteButton(meta: SnapshotMeta): HTMLButtonElement {
    const node = el("button", { class: "btn btn-secondary danger", text: t("deleteButton") }) as HTMLButtonElement;
    node.type = "button";
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    node.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        node.textContent = t("deleteConfirm");
        node.dataset.armed = "true";
        timer = setTimeout(() => {
          armed = false;
          node.textContent = t("deleteButton");
          delete node.dataset.armed;
        }, CONFIRM_MS);
        return;
      }
      if (timer) clearTimeout(timer);
      void deleteSnapshot(adapter, meta.id)
        .then(() => {
          renderNote(ui.report, t("snapshotDeleted", meta.name));
          return refresh();
        })
        .catch(report);
    });
    return node;
  }

  function button(label: string, action: () => Promise<void>): HTMLButtonElement {
    const node = el("button", { class: "btn btn-secondary", text: label }) as HTMLButtonElement;
    node.type = "button";
    node.addEventListener("click", () => {
      node.disabled = true;
      void action()
        .catch((cause: unknown) =>
          renderError(ui.report, cause instanceof Error ? cause.message : String(cause)),
        )
        .finally(() => {
          node.disabled = false;
        });
    });
    return node;
  }

  void refresh();
  return { refresh };
}

/** A snapshot saved before this version stored its text can still be exported. */
function fallbackText(session: Awaited<ReturnType<typeof readSnapshotSession>>): string | null {
  if (!session) return null;
  return stringify(toFile(session, { keepFavicons: false }));
}

function fileNameOf(meta: SnapshotMeta): string {
  const slug = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug === "" ? `tabspack-${meta.id.slice(0, 8)}` : `tabspack-${slug}`;
}

function readableDate(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


