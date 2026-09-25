/**
 * The options page, task T-501.
 *
 * Every control writes its setting immediately: there is no Save button, because
 * a settings page with one invents a state where what you see is not what is in
 * force. Everything here takes effect the next time a surface reads its
 * settings, and every surface re reads them when storage changes, so an open
 * manager page follows along without a reload.
 */
import { realAdapter } from "../../core/adapter/index.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ExportFormat,
  type Settings,
  type SortMode,
  type Theme,
} from "../../core/settings.js";
import type { RestoreTarget } from "../../core/restore.js";
import type { Scope } from "../../types/session.js";
import { el, must } from "../shared/dom.js";
import { applyI18n, t } from "../shared/i18n.js";
import { renderError, renderSuccess } from "../shared/report-view.js";
import { initSegmented } from "../shared/segmented.js";
import { applyTheme } from "../shared/theme.js";

const adapter = realAdapter;

const ui = {
  scope: must<HTMLSelectElement>("#opt-scope"),
  format: must<HTMLSelectElement>("#opt-format"),
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
  target: must<HTMLSelectElement>("#opt-target"),
  skipOpen: must<HTMLInputElement>("#opt-skip-open"),
  placeholder: must<HTMLInputElement>("#opt-placeholder"),
  threshold: must<HTMLInputElement>("#opt-threshold"),
  batch: must<HTMLInputElement>("#opt-batch"),
  delay: must<HTMLInputElement>("#opt-delay"),
  theme: must<HTMLDivElement>("#theme"),
  shortcuts: must<HTMLUListElement>("#shortcuts"),
  version: must<HTMLSpanElement>("#version"),
  reset: must<HTMLButtonElement>("#reset"),
  report: must<HTMLSpanElement>("#report"),
};

let settings: Settings;

void start().catch((error: unknown) =>
  renderError(ui.report, t("startupFailed", error instanceof Error ? error.message : String(error))),
);

async function start(): Promise<void> {
  applyI18n();
  settings = await loadSettings(adapter);
  applyTheme(settings.theme);
  paint();
  await gateIncognito();
  await paintShortcuts();

  const platform = await adapter.platform();
  ui.version.textContent = t("optionsVersion", platform.extensionVersion);

  bindSelect(ui.scope, (value) => ({ scope: value as Scope }));
  bindSelect(ui.format, (value) => ({ format: value as ExportFormat }));
  bindSelect(ui.sort, (value) => ({ sort: value as SortMode }));
  bindSelect(ui.target, (value) => ({ restoreTarget: value as RestoreTarget }));

  bindCheck(ui.titles, "textIncludeTitles");
  bindCheck(ui.favicons, "keepFavicons");
  bindCheck(ui.incognito, "includeIncognito");
  bindCheck(ui.dedupe, "dedupe");
  bindCheck(ui.web, "webPagesOnly");
  bindCheck(ui.pinned, "skipPinned");
  bindCheck(ui.sortDesc, "sortDesc");
  bindCheck(ui.skipOpen, "skipOpenDuplicates");
  bindCheck(ui.placeholder, "openPlaceholder");

  bindNumber(ui.threshold, "discardThreshold");
  bindNumber(ui.batch, "restoreBatchSize");
  bindNumber(ui.delay, "restoreDelayMs");

  ui.exclude.addEventListener("change", () => {
    void persist({ excludeList: ui.exclude.value });
  });

  initSegmented(ui.theme, settings.theme, (value) => {
    applyTheme(value as Theme);
    void persist({ theme: value as Theme });
  });

  ui.reset.addEventListener("click", () => {
    void (async () => {
      settings = await saveSettings(adapter, { ...DEFAULT_SETTINGS });
      applyTheme(settings.theme);
      paint();
      await gateIncognito();
      renderSuccess(ui.report, t("optionsResetDone"));
    })();
  });
}

function paint(): void {
  ui.scope.value = settings.scope;
  ui.format.value = settings.format;
  ui.titles.checked = settings.textIncludeTitles;
  ui.favicons.checked = settings.keepFavicons;
  ui.incognito.checked = settings.includeIncognito;
  ui.dedupe.checked = settings.dedupe;
  ui.web.checked = settings.webPagesOnly;
  ui.pinned.checked = settings.skipPinned;
  ui.sort.value = settings.sort;
  ui.sortDesc.checked = settings.sortDesc;
  ui.exclude.value = settings.excludeList;
  ui.target.value = settings.restoreTarget;
  ui.skipOpen.checked = settings.skipOpenDuplicates;
  ui.placeholder.checked = settings.openPlaceholder;
  ui.threshold.value = String(settings.discardThreshold);
  ui.batch.value = String(settings.restoreBatchSize);
  ui.delay.value = String(settings.restoreDelayMs);
}

/** A control that cannot work is disabled with a visible reason: DESIGN section 4. */
async function gateIncognito(): Promise<void> {
  const allowed = await adapter.isAllowedIncognitoAccess();
  ui.incognito.disabled = !allowed;
  ui.incognitoHint.textContent = allowed ? "" : t("privateWindowsHint");
  if (allowed) {
    delete ui.incognitoLabel.dataset.disabled;
    return;
  }
  ui.incognitoLabel.dataset.disabled = "true";
  if (settings.includeIncognito) {
    ui.incognito.checked = false;
    settings = await saveSettings(adapter, { includeIncognito: false });
  }
}

/** The browser owns these keys, so they are read from it rather than restated. */
async function paintShortcuts(): Promise<void> {
  const commands = await adapter.listCommands();
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

function bindSelect(node: HTMLSelectElement, patch: (value: string) => Partial<Settings>): void {
  node.addEventListener("change", () => void persist(patch(node.value)));
}

function bindCheck(node: HTMLInputElement, key: keyof Settings): void {
  node.addEventListener("change", () => void persist({ [key]: node.checked } as Partial<Settings>));
}

/**
 * A number outside its range falls back to the default rather than being clamped,
 * so the field is repainted with what was actually stored: `core/settings.ts`
 * decides, and the page shows the decision.
 */
function bindNumber(node: HTMLInputElement, key: keyof Settings): void {
  node.addEventListener("change", () => {
    void (async () => {
      const value = Number(node.value);
      settings = await saveSettings(adapter, {
        [key]: Number.isFinite(value) ? value : undefined,
      } as Partial<Settings>);
      paint();
      renderSuccess(ui.report, t("optionsSaved"));
    })();
  });
}

async function persist(patch: Partial<Settings>): Promise<void> {
  settings = await saveSettings(adapter, patch);
  renderSuccess(ui.report, t("optionsSaved"));
}
