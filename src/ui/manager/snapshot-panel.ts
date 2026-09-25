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
import { countSession } from "../../types/session.js";
import { clear, el, must } from "../shared/dom.js";
import { plural as pluralUnit, t } from "../shared/i18n.js";
import { tabs as tabsPhrase, windows as windowsPhrase, groups as groupsPhrase } from "../shared/wording.js";
import { clearReport, renderError, renderNote, renderSuccess } from "../shared/report-view.js";

export interface SnapshotPanelHooks {
  /** Hands a saved session to the import task's preview. */
  preview(meta: SnapshotMeta): Promise<void>;
  /** Writes a file, reusing the same path as an export. */
  save(text: string, filename: string): Promise<void>;
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
  };

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
      const result = loadPack(await file.text());
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

  async function refresh(): Promise<void> {
    const [list, room] = await Promise.all([listSnapshots(adapter), usage(adapter)]);
    paintUsage(room);
    clear(ui.list);
    ui.empty.hidden = list.length > 0;
    for (const meta of list) ui.list.appendChild(row(meta));
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

    const name = el("input", { class: "snapshot-name" }) as HTMLInputElement;
    name.value = meta.name;
    name.setAttribute("aria-label", t("snapshotNameAria", readableDate(meta.createdAt)));
    name.addEventListener("change", () => {
      void renameSnapshot(adapter, meta.id, name.value.trim() || meta.name).then(() => refresh());
    });
    item.appendChild(name);

    item.appendChild(
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

    const tags = el("input", { class: "snapshot-tags" }) as HTMLInputElement;
    tags.value = meta.tags.join(", ");
    tags.placeholder = t("snapshotTagsPlaceholder");
    tags.setAttribute("aria-label", t("snapshotTagsAria", meta.name));
    tags.addEventListener("change", () => {
      void tagSnapshot(adapter, meta.id, tags.value.split(",")).then(() => refresh());
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
      void deleteSnapshot(adapter, meta.id).then(() => {
        renderNote(ui.report, t("snapshotDeleted", meta.name));
        return refresh();
      });
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


