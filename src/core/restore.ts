/**
 * The restore engine, task T-204. The part that has to be right.
 *
 * Order of operations follows docs/ARCHITECTURE.md section 6, and every step in
 * it exists because of a failure mode found in a real browser or in a real
 * extension. The two refinements this implementation adds, both recorded in that
 * document:
 *
 *   - a window is created with bounds only when its state is normal, because
 *     `windows.create` refuses bounds and a state such as maximized in the same
 *     call, and the state is applied afterwards instead
 *   - a group is collapsed after the active tab has been activated, because a
 *     browser refuses to collapse the group that holds the active tab
 *
 * Nothing here throws on a browser refusal. A refused window, a refused group or
 * a URL no extension may open becomes a line in the report, because a restore
 * that stops halfway through 200 tabs is worse than one that finishes and says
 * what it could not do.
 */
import type { BrowserAdapter, CreateTabRequest, RawTab } from "./adapter/types.js";
import type { Session, SessionGroup, SessionTab, SessionWindow } from "../types/session.js";
import { dedupeKey } from "./filters.js";
import type { Issue } from "./issues.js";
import { jsonPath, warning } from "./issues.js";
import { explainVerdict, judgeUrl, type UrlVerdict } from "./urls.js";

export type RestoreTarget = "new_windows" | "current_window";

export interface RestorePolicy {
  target: RestoreTarget;
  /** Tabs beyond this many are created unloaded. FR-208, default 20. */
  discardThreshold: number;
  /** Tabs created between yields to the browser. */
  batchSize: number;
  batchDelayMs: number;
  skipDuplicates: boolean;
  /** Open the page listing URLs no extension can open. FR-204. */
  openPlaceholder: boolean;
}

export const DEFAULT_RESTORE_POLICY: RestorePolicy = {
  target: "new_windows",
  discardThreshold: 20,
  batchSize: 8,
  batchDelayMs: 40,
  skipDuplicates: true,
  openPlaceholder: true,
};

export interface RestoreOptions extends RestorePolicy {
  /** Which tabs to restore. Everything, when absent. */
  include?: (windowKey: string, tabIndex: number) => boolean;
  onProgress?: (done: number, total: number) => void;
  /** Replaced in tests, so the suite does not wait on the wall clock. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface UnopenableEntry {
  url: string;
  title: string;
  reason: string;
  explanation: string;
}

export interface RestoreReport {
  ok: boolean;
  /** Windows actually created or written into. */
  windows: number;
  /** Tabs the user asked for, before anything was skipped. */
  selected: number;
  restored: number;
  duplicates: number;
  unopenable: UnopenableEntry[];
  /** Tabs whose group could not be recreated on this browser. */
  ungrouped: number;
  groups: number;
  /** Tabs created unloaded, or asked to unload once created. */
  discarded: number;
  placeholderOpened: boolean;
  ms: number;
  issues: Issue[];
}

interface PlannedTab {
  tab: SessionTab;
  windowKey: string;
}

interface PlannedWindow {
  source: SessionWindow;
  tabs: PlannedTab[];
  groups: SessionGroup[];
}

const PLACEHOLDER_URL = "about:blank";

export async function restoreSession(
  adapter: BrowserAdapter,
  session: Session,
  options: RestoreOptions,
): Promise<RestoreReport> {
  const clock = options.now ?? (() => Date.now());
  const started = clock();
  const sleep = options.sleep ?? defaultSleep;
  const issues: Issue[] = [];

  const [capabilities, fileAccess, incognitoAllowed] = await Promise.all([
    adapter.capabilities(),
    adapter.isAllowedFileSchemeAccess(),
    adapter.isAllowedIncognitoAccess(),
  ]);

  const openKeys = options.skipDuplicates ? await openTabKeys(adapter) : new Set<string>();

  const report: RestoreReport = {
    ok: true,
    windows: 0,
    selected: 0,
    restored: 0,
    duplicates: 0,
    unopenable: [],
    ungrouped: 0,
    groups: 0,
    discarded: 0,
    placeholderOpened: false,
    ms: 0,
    issues,
  };

  const planned = plan(session, {
    include: options.include,
    fileAccess,
    skipDuplicates: options.skipDuplicates,
    openKeys,
    report,
    issues,
  });

  const total = planned.reduce((sum, win) => sum + win.tabs.length, 0);
  if (total === 0) {
    report.ms = clock() - started;
    await maybeOpenPlaceholder(adapter, report, options, issues);
    return report;
  }

  const runtime: Runtime = {
    adapter,
    options,
    sleep,
    issues,
    report,
    discardOnCreate: capabilities.discardOnCreate,
    containers: capabilities.containers,
    groupMeta: capabilities.tabGroups,
    loaded: 0,
    done: 0,
    total,
    collapses: [],
    focus: null,
  };

  if (options.target === "current_window") {
    if (planned.length > 1) {
      issues.push(
        warning(
          "restore.windows_merged",
          "$",
          `This pack holds ${planned.length} windows and they were restored into the current window as one.`,
          "Choose new windows as the restore target to keep them apart.",
        ),
      );
    }
    const current = await adapter.getCurrentWindow(false);
    if (current.id === undefined) {
      return fail(report, clock() - started, issues, "restore.no_current_window", "There is no window to restore into.");
    }
    report.windows = 1;
    for (const window of planned) {
      await fillWindow(runtime, window, current.id, null);
    }
  } else {
    for (const window of planned) {
      const created = await createWindowFor(runtime, window, incognitoAllowed);
      if (!created) continue;
      report.windows += 1;
      await fillWindow(runtime, window, created.windowId, created.placeholderTabId);
      await finishWindow(runtime, window, created.windowId);
    }
  }

  // The window that was focused at export is focused at the end, because every
  // window created after it took the focus away.
  if (runtime.focus !== null) {
    await safely(() => adapter.updateWindow(runtime.focus as number, { focused: true }));
  }

  for (const collapse of runtime.collapses) {
    try {
      await adapter.updateGroup(collapse.groupId, { collapsed: true });
    } catch {
      issues.push(
        warning(
          "restore.collapse_refused",
          "$",
          `The group "${collapse.title}" was restored open because the browser refused to collapse it.`,
          "Collapse it by clicking its name. Nothing else is affected.",
        ),
      );
    }
  }

  await maybeOpenPlaceholder(adapter, report, options, issues);
  report.ms = clock() - started;
  return report;
}

interface Runtime {
  adapter: BrowserAdapter;
  options: RestoreOptions;
  sleep: (ms: number) => Promise<void>;
  issues: Issue[];
  report: RestoreReport;
  /** Null until a restore has tried it once. See the probe in `createTabFor`. */
  discardOnCreate: boolean | null;
  containers: boolean;
  /**
   * Whether the tab groups API is readable. `tabs.group` works without the
   * `tabGroups` permission, but a group's title, colour and collapsed state do
   * not, so without it the tabs are grouped and unlabelled.
   */
  groupMeta: boolean;
  loaded: number;
  done: number;
  total: number;
  collapses: { groupId: number; title: string }[];
  /** Applied after every window exists, so the last window created does not keep focus. */
  focus: number | null;
}

interface PlanContext {
  include?: (windowKey: string, tabIndex: number) => boolean;
  fileAccess: boolean;
  skipDuplicates: boolean;
  openKeys: Set<string>;
  report: RestoreReport;
  issues: Issue[];
}

/**
 * Decides what will be restored before anything is created, so the report can
 * name every exclusion even if the browser later refuses something.
 */
function plan(session: Session, context: PlanContext): PlannedWindow[] {
  const planned: PlannedWindow[] = [];
  const seen = new Set<string>();

  session.windows.forEach((win, index) => {
    if (win.type !== "normal") {
      context.issues.push(
        warning(
          "restore.window_type_skipped",
          jsonPath("windows", index, "type"),
          `Window ${index + 1} was a ${win.type} window, and a ${win.type} window's tabs cannot be recreated.`,
          "Its tabs were not restored. Only ordinary browser windows can be.",
        ),
      );
      return;
    }

    const tabs: PlannedTab[] = [];
    win.tabs.forEach((tab) => {
      if (context.include && !context.include(win.key, tab.index)) return;
      context.report.selected += 1;

      const verdict = judgeUrl(tab.url, { fileAccess: context.fileAccess });
      if (!verdict.openable) {
        context.report.unopenable.push(describeUnopenable(tab, verdict));
        return;
      }

      const key = dedupeKey(tab.url);
      if (context.skipDuplicates && (context.openKeys.has(key) || seen.has(key))) {
        context.report.duplicates += 1;
        return;
      }
      seen.add(key);
      tabs.push({ tab, windowKey: win.key });
    });

    if (tabs.length === 0) return;
    // Pinned first, then the file's order, because a pinned tab created after an
    // ordinary one lands in the wrong place: docs/DOMAIN.md Table D1.
    tabs.sort((a, b) => Number(b.tab.pinned) - Number(a.tab.pinned) || a.tab.index - b.tab.index);
    const usedGroups = new Set(tabs.map((entry) => entry.tab.groupKey).filter(Boolean) as string[]);
    planned.push({
      source: win,
      tabs,
      groups: win.groups.filter((group) => usedGroups.has(group.key)),
    });
  });

  return planned;
}

function describeUnopenable(tab: SessionTab, verdict: UrlVerdict): UnopenableEntry {
  return {
    url: tab.url,
    title: tab.title,
    reason: verdict.openable ? "" : verdict.reason,
    explanation: explainVerdict(verdict),
  };
}

async function openTabKeys(adapter: BrowserAdapter): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    for (const tab of await adapter.queryTabs({})) {
      const url = typeof tab.url === "string" && tab.url !== "" ? tab.url : (tab.pendingUrl ?? "");
      if (url !== "") keys.add(dedupeKey(url));
    }
  } catch {
    /* a browser that will not list tabs simply gets no duplicate detection */
  }
  return keys;
}

/**
 * Step 1. Bounds and state are mutually exclusive in one call, so a window that
 * was maximized is created plain and maximized afterwards. A window manager that
 * refuses the bounds is retried once at a safe size, per FR-210.
 */
async function createWindowFor(
  runtime: Runtime,
  window: PlannedWindow,
  incognitoAllowed: boolean,
): Promise<{ windowId: number; placeholderTabId: number | null } | null> {
  const { adapter, issues } = runtime;
  const win = window.source;
  const wantsState = win.state !== undefined && win.state !== "normal";
  const incognito = win.incognito && incognitoAllowed;

  if (win.incognito && !incognitoAllowed) {
    issues.push(
      warning(
        "restore.incognito_not_allowed",
        "$",
        "A private window in this pack was restored as an ordinary window.",
        "Allow TabsPack in private windows in your browser's extension settings to restore it as private.",
      ),
    );
  }

  const base = { url: PLACEHOLDER_URL, ...(incognito ? { incognito: true } : {}) };
  const withBounds =
    !wantsState && win.bounds
      ? { ...base, ...win.bounds }
      : base;

  let created = await tryCreateWindow(adapter, withBounds);
  if (!created && withBounds !== base) {
    issues.push(
      warning(
        "restore.bounds_refused",
        "$",
        "The browser refused the window position and size from the pack, so a default size was used.",
        "Nothing else changed. Move the window once and export again to record new bounds.",
      ),
    );
    created = await tryCreateWindow(adapter, { ...base, left: 0, top: 0, width: 800, height: 600 });
  }
  if (!created) created = await tryCreateWindow(adapter, base);
  if (!created || created.id === undefined) {
    issues.push(
      warning(
        "restore.window_refused",
        "$",
        "The browser refused to open a new window, so the tabs in it were not restored.",
        "Close some windows and try again, or restore into the current window instead.",
      ),
    );
    runtime.report.ok = false;
    return null;
  }

  const placeholder = created.tabs?.[0]?.id ?? null;
  return { windowId: created.id, placeholderTabId: placeholder ?? null };
}

async function tryCreateWindow(
  adapter: BrowserAdapter,
  request: Record<string, unknown>,
): Promise<{ id?: number; tabs?: RawTab[] } | null> {
  try {
    return await adapter.createWindow(request);
  } catch {
    return null;
  }
}

/**
 * Steps 3 to 6. Creates the tabs in throttled batches, removes the placeholder
 * only after the first real tab exists, discards beyond the threshold and groups
 * in a second pass because `tabs.create` cannot assign a group.
 */
async function fillWindow(
  runtime: Runtime,
  window: PlannedWindow,
  windowId: number,
  placeholderTabId: number | null,
): Promise<void> {
  const { adapter, options, report } = runtime;
  const createdIds: (number | null)[] = [];
  const toDiscard: number[] = [];
  const openerFixups: { tabId: number; openerIndex: number }[] = [];
  const activeEntry = window.tabs.find((entry) => entry.tab.active) ?? window.tabs[0];
  let placeholderRemoved = placeholderTabId === null;

  for (let position = 0; position < window.tabs.length; position += 1) {
    const entry = window.tabs[position] as PlannedTab;
    const willBeActive = entry === activeEntry;
    const wantsDiscard =
      !willBeActive && (entry.tab.discarded || runtime.loaded >= options.discardThreshold);

    const created = await createTabFor(runtime, entry.tab, windowId, wantsDiscard);
    createdIds.push(created?.id ?? null);

    if (created?.id !== undefined) {
      report.restored += 1;
      if (wantsDiscard) {
        if (created.discarded === true) report.discarded += 1;
        else toDiscard.push(created.id);
      } else {
        runtime.loaded += 1;
      }
      if (entry.tab.muted) {
        await safely(() => adapter.updateTab(created.id as number, { muted: true }));
      }
      if (entry.tab.openerIndex !== null) {
        openerFixups.push({ tabId: created.id, openerIndex: entry.tab.openerIndex });
      }
      if (!placeholderRemoved && placeholderTabId !== null) {
        // Step 5: only now is it safe, because removing the last tab closes the
        // window the rest of this restore is going into.
        await safely(() => adapter.removeTabs([placeholderTabId]));
        placeholderRemoved = true;
      }
    }

    runtime.done += 1;
    options.onProgress?.(runtime.done, runtime.total);

    const endOfBatch = (position + 1) % Math.max(1, options.batchSize) === 0;
    if (endOfBatch && position + 1 < window.tabs.length) await runtime.sleep(options.batchDelayMs);
  }

  if (toDiscard.length > 0) {
    await safely(() => adapter.discardTabs(toDiscard));
    report.discarded += toDiscard.length;
  }

  // Openers refer to positions in the file, which the sort above may have moved.
  const positionOfIndex = new Map<number, number>();
  window.tabs.forEach((entry, position) => positionOfIndex.set(entry.tab.index, position));
  for (const fixup of openerFixups) {
    const position = positionOfIndex.get(fixup.openerIndex);
    const openerTabId = position === undefined ? undefined : createdIds[position];
    if (openerTabId === undefined || openerTabId === null || openerTabId === fixup.tabId) continue;
    await safely(() => adapter.updateTab(fixup.tabId, { openerTabId }));
  }

  await groupTabs(runtime, window, windowId, createdIds);

  // Step 7. Activating last keeps the browser from loading a page in the middle
  // of a bulk restore, which is the whole point of throttling.
  const activePosition = window.tabs.findIndex((entry) => entry === activeEntry);
  const activeId = activePosition >= 0 ? createdIds[activePosition] : null;
  if (activeId !== null && activeId !== undefined) {
    await safely(() => adapter.updateTab(activeId, { active: true }));
  }
}

/**
 * Step 6. One `tabs.group` call per group, then the title and colour. Collapsing
 * is queued for after every window's active tab is set.
 */
async function groupTabs(
  runtime: Runtime,
  window: PlannedWindow,
  windowId: number,
  createdIds: (number | null)[],
): Promise<void> {
  if (window.groups.length === 0) return;
  const { adapter, issues, report } = runtime;

  for (const group of window.groups) {
    const tabIds = window.tabs
      .map((entry, position) => (entry.tab.groupKey === group.key ? createdIds[position] : null))
      .filter((id): id is number => typeof id === "number");
    if (tabIds.length === 0) continue;

    let groupId: number | null = null;
    try {
      groupId = await adapter.groupTabs({ tabIds, windowId });
    } catch {
      groupId = null;
    }
    if (groupId === null) {
      report.ungrouped += tabIds.length;
      continue;
    }
    report.groups += 1;
    if (!runtime.groupMeta && (group.title || group.color || group.collapsed)) {
      if (!issues.some((issue) => issue.code === "restore.group_metadata")) {
        issues.push(
          warning(
            "restore.group_metadata",
            "$",
            "The tabs were grouped, but their titles and colours were not applied.",
            "Allow tab groups in the preview before restoring. The pack still holds every title and colour.",
          ),
        );
      }
      continue;
    }
    await safely(() =>
      adapter.updateGroup(groupId as number, {
        ...(group.title ? { title: group.title } : {}),
        ...(group.color ? { color: group.color } : {}),
      }),
    );
    if (group.collapsed) runtime.collapses.push({ groupId, title: group.title ?? "" });
  }

  if (report.ungrouped > 0 && !issues.some((issue) => issue.code === "restore.no_groups")) {
    issues.push(
      warning(
        "restore.no_groups",
        "$",
        "This browser did not group the restored tabs, so they were restored side by side in the right order.",
        "Tab groups need Chrome 89, Edge 89 or Firefox 139 and the tab groups permission. The pack still holds the groups.",
      ),
    );
  }
}

/** Steps 1 and 7 finished: window state, then focus. */
async function finishWindow(runtime: Runtime, window: PlannedWindow, windowId: number): Promise<void> {
  const { adapter } = runtime;
  const state = window.source.state;
  if (state && state !== "normal") {
    await safely(() => adapter.updateWindow(windowId, { state }));
  }
  if (window.source.name) {
    // Gecko only. Chromium ignores it, which is why it is not a capability check.
    await safely(() => adapter.updateWindow(windowId, { titlePreface: `${window.source.name} ` }));
  }
  if (window.source.focused) runtime.focus = windowId;
}

/**
 * Step 4. `discarded` at creation is a Gecko feature, and Chromium rejects the
 * property outright, so the first tab that wants it probes for it: one rejection
 * resolves `discardOnCreate` for the rest of the restore. No browser name is
 * involved, per AGENTS.md section 2 rule 2.
 */
async function createTabFor(
  runtime: Runtime,
  tab: SessionTab,
  windowId: number,
  wantsDiscard: boolean,
): Promise<RawTab | null> {
  const { adapter } = runtime;
  const base: CreateTabRequest = {
    windowId,
    url: tab.url,
    active: false,
    pinned: tab.pinned,
    ...(runtime.containers && tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}),
  };

  if (wantsDiscard && runtime.discardOnCreate !== false) {
    try {
      // `title` travels with `discarded` and only with it. Both are Gecko only,
      // where a title is what an unloaded tab has to show; Chromium rejects an
      // unrecognised property outright, which is what the probe relies on.
      const created = await adapter.createTab({
        ...base,
        discarded: true,
        ...(tab.title ? { title: tab.title } : {}),
      });
      runtime.discardOnCreate = true;
      return created;
    } catch {
      runtime.discardOnCreate = false;
    }
  }

  try {
    return await adapter.createTab(base);
  } catch {
    // A single refused tab is reported rather than fatal: a pack of 200 tabs
    // should not be lost because one URL upset the browser.
    runtime.report.unopenable.push({
      url: tab.url,
      title: tab.title,
      reason: "refused",
      explanation: "The browser refused to open this address.",
    });
    return null;
  }
}

/**
 * Step 8. The placeholder page is the visible edge of the one lossy part of the
 * format: docs/SPEC.md section 8. The list is handed over through storage rather
 * than the URL, because a pack can hold hundreds of these.
 */
async function maybeOpenPlaceholder(
  adapter: BrowserAdapter,
  report: RestoreReport,
  options: RestoreOptions,
  issues: Issue[],
): Promise<void> {
  if (report.unopenable.length === 0) return;
  issues.push(
    warning(
      "restore.unopenable",
      "$",
      report.unopenable.length === 1
        ? "One tab in this pack uses an address no extension is allowed to open."
        : `${report.unopenable.length} tabs in this pack use addresses no extension is allowed to open.`,
      options.openPlaceholder
        ? "They are listed on the page TabsPack just opened, and they are still in the file."
        : "They are still in the file, and are listed in this report.",
    ),
  );
  if (!options.openPlaceholder) return;
  try {
    const id = handoffId();
    await adapter.storageSet({
      [`placeholder:${id}`]: {
        createdAt: new Date().toISOString(),
        tabs: report.unopenable,
      },
    });
    await adapter.openExtensionPage(`placeholder.html?id=${id}`);
    report.placeholderOpened = true;
  } catch {
    issues.push(
      warning(
        "restore.placeholder_failed",
        "$",
        "The page listing the addresses that could not be opened did not open.",
        "They are listed in this report instead, and they are still in the file.",
      ),
    );
  }
}

function handoffId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function fail(
  report: RestoreReport,
  ms: number,
  issues: Issue[],
  code: string,
  message: string,
): RestoreReport {
  issues.push(warning(code, "$", message, "Open a browser window and try again."));
  return { ...report, ok: false, ms, issues };
}

async function safely(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    /* every caller here treats a refusal as nothing to do */
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
