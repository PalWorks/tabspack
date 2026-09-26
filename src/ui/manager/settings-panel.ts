/**
 * The Settings and About panes, task T-511.
 *
 * These used to be a page of their own, `options.html`, which held a second copy
 * of fifteen controls that already existed on Export and Import and wrote the
 * same stored values. Two widgets for one setting is one truth too many, so the
 * settings that belong to a task now live only with that task, and what is left
 * here is what belongs to no task at all: ADR-028.
 *
 * Every control writes the moment it changes. There is no Save button, because a
 * settings page with one invents a state where what you see is not what is in
 * force, and then has to defend it with a dialog on the way out.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import { DEFAULT_SETTINGS, saveSettings, type Settings, type Theme } from "../../core/settings.js";
import { el, must } from "../shared/dom.js";
import { t } from "../shared/i18n.js";
import { renderSuccess } from "../shared/report-view.js";
import { initSegmented } from "../shared/segmented.js";
import { applyTheme } from "../shared/theme.js";

export interface SettingsPanel {
  /** Repaints when a setting changes somewhere else, through `storage.onChanged`. */
  paint(latest: Settings): void;
}

export function initSettingsPanel(adapter: BrowserAdapter, settings: Settings): SettingsPanel {
  const ui = {
    recover: must<HTMLInputElement>("#opt-recover"),
    batch: must<HTMLInputElement>("#opt-batch"),
    delay: must<HTMLInputElement>("#opt-delay"),
    theme: must<HTMLDivElement>("#theme"),
    reset: must<HTMLButtonElement>("#reset"),
    report: must<HTMLSpanElement>("#settings-report"),
    shortcuts: must<HTMLUListElement>("#shortcuts"),
    version: must<HTMLSpanElement>("#version"),
  };

  let current = settings;
  const selectTheme = initSegmented(ui.theme, current.theme, (value) => {
    applyTheme(value as Theme);
    void persist({ theme: value as Theme });
  });

  paint(current);
  void fillAbout();

  ui.recover.addEventListener("change", () => void persist({ recoverSuspended: ui.recover.checked }));
  bindNumber(ui.batch, "restoreBatchSize");
  bindNumber(ui.delay, "restoreDelayMs");

  ui.reset.addEventListener("click", () => {
    void (async () => {
      current = await saveSettings(adapter, { ...DEFAULT_SETTINGS });
      applyTheme(current.theme);
      paint(current);
      renderSuccess(ui.report, t("optionsResetDone"));
    })();
  });

  function paint(latest: Settings): void {
    current = latest;
    ui.recover.checked = latest.recoverSuspended;
    ui.batch.value = String(latest.restoreBatchSize);
    ui.delay.value = String(latest.restoreDelayMs);
    selectTheme(latest.theme);
  }

  /**
   * A number outside its range falls back to the default rather than being
   * clamped, so the field is repainted with what was actually stored: the core
   * decides, and the page shows the decision.
   */
  function bindNumber(node: HTMLInputElement, key: "restoreBatchSize" | "restoreDelayMs"): void {
    node.addEventListener("change", () => {
      void (async () => {
        const value = Number(node.value);
        current = await saveSettings(adapter, {
          [key]: Number.isFinite(value) ? value : undefined,
        } as Partial<Settings>);
        paint(current);
        renderSuccess(ui.report, t("optionsSaved"));
      })();
    });
  }

  async function persist(patch: Partial<Settings>): Promise<void> {
    current = await saveSettings(adapter, patch);
    renderSuccess(ui.report, t("optionsSaved"));
  }

  /** The version, and the keys the browser says it accepted. */
  async function fillAbout(): Promise<void> {
    const platform = await adapter.platform().catch(() => null);
    ui.version.textContent = t("optionsVersion", platform?.extensionVersion ?? "");

    // The browser owns these keys, and the user may have changed them, so they
    // are read from it rather than restated here.
    const commands = await adapter.listCommands().catch(() => []);
    ui.shortcuts.replaceChildren();
    if (commands.length === 0) {
      ui.shortcuts.appendChild(el("li", { text: t("shortcutsNone") }));
      return;
    }
    for (const command of commands) {
      const item = el("li");
      item.appendChild(el("span", { text: `${command.description} ` }));
      item.appendChild(el("kbd", { text: command.shortcut === "" ? t("shortcutUnset") : command.shortcut }));
      ui.shortcuts.appendChild(item);
    }
  }

  return { paint };
}
