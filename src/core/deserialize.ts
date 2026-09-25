/**
 * `TabsPackFile` to `Session`, task T-202.
 *
 * Two rules from docs/SPEC.md section 7 shape this file. Never act on a field
 * this version does not understand, and never delete it either: every
 * unrecognised key is kept in an `unknown` bag on the object it was found on,
 * and `serialize.ts` writes it back. A pack that passes through TabsPack comes
 * out the way it went in, including the parts a later version added.
 *
 * The other half is that a reader is deliberately more forgiving than the
 * schema. An unknown group colour becomes grey, a missing index becomes the
 * array position, a dangling group reference is dropped and two active tabs
 * become one. Each of those is reported rather than silently applied, because a
 * user who is told what was adjusted can check the result.
 */
import type {
  TabsPackFile,
  TabsPackGroup,
  TabsPackTab,
  TabsPackWindow,
} from "../types/tabspack.js";
import { GROUP_COLORS, type GroupColor, type WindowState, type WindowType } from "../types/tabspack.js";
import type {
  Session,
  SessionGroup,
  SessionSource,
  SessionTab,
  SessionWindow,
} from "../types/session.js";
import { countSession } from "../types/session.js";
import type { Issue } from "./issues.js";
import { jsonPath, warning } from "./issues.js";
import { isObject } from "./schema.js";

const FILE_KEYS = new Set([
  "format",
  "schemaVersion",
  "exportedAt",
  "name",
  "tags",
  "source",
  "counts",
  "windows",
]);
const SOURCE_KEYS = new Set([
  "browser",
  "browserVersion",
  "os",
  "extensionVersion",
  "profile",
  "deviceName",
]);
const WINDOW_KEYS = new Set([
  "id",
  "name",
  "tabs",
  "groups",
  "focused",
  "incognito",
  "type",
  "state",
  "bounds",
]);
const GROUP_KEYS = new Set(["id", "title", "color", "collapsed"]);
const TAB_KEYS = new Set([
  "url",
  "index",
  "title",
  "pinned",
  "active",
  "groupId",
  "group",
  "favIconUrl",
  "muted",
  "discarded",
  "openerIndex",
  "cookieStoreId",
  "lastAccessed",
  "notes",
  "tags",
]);

/** Above this many issues the list stops being readable, so it is summarised. */
const ISSUE_LIMIT = 200;

export interface DeserializeOptions {
  /** Used when the file carries no `exportedAt`. Tests pass a fixed value. */
  now?: number;
}

export interface DeserializeResult {
  session: Session;
  issues: Issue[];
}

export function fromFile(file: TabsPackFile, options: DeserializeOptions = {}): DeserializeResult {
  const raw = file as unknown as Record<string, unknown>;
  const issues: Issue[] = [];

  const exportedAtText = typeof raw["exportedAt"] === "string" ? raw["exportedAt"] : undefined;
  const parsed = exportedAtText ? Date.parse(exportedAtText) : Number.NaN;
  if (exportedAtText && Number.isNaN(parsed)) {
    issues.push(
      warning(
        "exported_at.unreadable",
        jsonPath("exportedAt"),
        `The export time "${exportedAtText}" is not a timestamp TabsPack can read.`,
        "It is kept in the file as it is. Sorting by date may be wrong.",
      ),
    );
  }

  const windowsRaw = Array.isArray(raw["windows"]) ? (raw["windows"] as unknown[]) : [];
  const windows: SessionWindow[] = [];
  // Window keys have to be unique: everything downstream, including the preview's
  // selection, addresses a tab as window key plus index. A hand written file that
  // reuses an id would otherwise select two tabs with one click.
  const takenKeys = new Map<string, boolean>();
  windowsRaw.forEach((value, index) => {
    if (!isObject(value)) return;
    const win = readWindow(value as unknown as TabsPackWindow, index, windows.length + 1, issues);
    if (takenKeys.has(win.key)) {
      const unique = uniqueKey(win.key, takenKeys);
      issues.push(
        warning(
          "window.duplicate_id",
          jsonPath("windows", index, "id"),
          `Two windows share the id "${win.key}".`,
          `The second one is treated as "${unique}". Give each window a unique id.`,
        ),
      );
      win.key = unique;
    }
    takenKeys.set(win.key, true);
    windows.push(win);
  });

  const session: Session = {
    windows,
    source: readSource(raw["source"]),
    capturedAt: Number.isNaN(parsed) ? (options.now ?? Date.now()) : parsed,
    ...(exportedAtText ? { exportedAtText } : {}),
    ...(typeof raw["name"] === "string" && raw["name"] !== "" ? { name: raw["name"] } : {}),
    ...(isStringArray(raw["tags"]) ? { tags: [...(raw["tags"] as string[])] } : {}),
    ...(bagOf(raw, FILE_KEYS) ? { unknown: bagOf(raw, FILE_KEYS) } : {}),
  };

  checkCounts(raw["counts"], session, issues);
  return { session, issues: capIssues(issues) };
}

function readSource(value: unknown): SessionSource {
  if (!isObject(value)) return {};
  const source: SessionSource = {};
  for (const key of ["browser", "browserVersion", "os", "extensionVersion", "profile", "deviceName"] as const) {
    const found = value[key];
    if (typeof found === "string" && found !== "") source[key] = found;
  }
  const bag = bagOf(value, SOURCE_KEYS);
  if (bag) source.unknown = bag;
  return source;
}

function readWindow(
  win: TabsPackWindow,
  fileIndex: number,
  ordinal: number,
  issues: Issue[],
): SessionWindow {
  const raw = win as unknown as Record<string, unknown>;
  const path = (...rest: (string | number)[]): string => jsonPath("windows", fileIndex, ...rest);

  const groups: SessionGroup[] = [];
  const byKey = new Map<string, SessionGroup>();
  const byTitle = new Map<string, SessionGroup>();
  const groupsRaw = Array.isArray(raw["groups"]) ? (raw["groups"] as unknown[]) : [];
  groupsRaw.forEach((value, index) => {
    if (!isObject(value)) return;
    const group = readGroup(value as unknown as TabsPackGroup, path("groups", index), issues);
    if (byKey.has(group.key)) {
      issues.push(
        warning(
          "group.duplicate_id",
          path("groups", index, "id"),
          `Two groups in window ${ordinal} share the id "${group.key}".`,
          "The first one wins. Give each group a unique id.",
        ),
      );
      return;
    }
    groups.push(group);
    byKey.set(group.key, group);
    if (group.title && !byTitle.has(group.title)) byTitle.set(group.title, group);
  });

  const tabsRaw = Array.isArray(raw["tabs"]) ? (raw["tabs"] as unknown[]) : [];
  const entries = tabsRaw
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: Record<string, unknown>; index: number } => isObject(entry.value));

  const ordered = orderTabs(entries, ordinal, path, issues);

  const tabs: SessionTab[] = [];
  let activeSeen = false;
  ordered.forEach((entry, position) => {
    const tab = readTab(entry.value as unknown as TabsPackTab, path("tabs", entry.index), position, issues);

    if (tab.active) {
      if (activeSeen) {
        issues.push(
          warning(
            "tab.second_active",
            path("tabs", entry.index, "active"),
            `More than one tab in window ${ordinal} is marked as the active tab.`,
            "The first one is used, as the specification requires. The rest open in the background.",
          ),
        );
        tab.active = false;
      } else {
        activeSeen = true;
      }
    }

    const reference = readGroupReference(entry.value, byKey, byTitle, groups, path("tabs", entry.index), ordinal, issues);
    if (reference) tab.groupKey = reference;

    tabs.push(tab);
  });

  remapOpeners(tabs, ordered, issues, path);

  const type = readEnum<WindowType>(raw["type"], ["normal", "popup", "app"]) ?? "normal";
  const state = readEnum<WindowState>(raw["state"], ["normal", "minimized", "maximized", "fullscreen"]);
  const bounds = readBounds(raw["bounds"]);

  const key = typeof raw["id"] === "string" && raw["id"] !== "" ? raw["id"] : `w${ordinal}`;
  const bag = bagOf(raw, WINDOW_KEYS);

  return {
    key,
    ...(typeof raw["name"] === "string" && raw["name"] !== "" ? { name: raw["name"] } : {}),
    focused: raw["focused"] === true,
    incognito: raw["incognito"] === true,
    type,
    ...(state ? { state } : {}),
    ...(bounds ? { bounds } : {}),
    groups,
    tabs,
    ...(bag ? { unknown: bag } : {}),
  };
}

/**
 * `index` is authoritative when every tab has a usable one, and array order is
 * authoritative otherwise, per docs/SPEC.md section 1. Mixing the two silently
 * is how a restored window ends up in an order the user did not export, so the
 * decision is made once per window and reported when it is not the obvious one.
 */
function orderTabs(
  entries: { value: Record<string, unknown>; index: number }[],
  ordinal: number,
  path: (...rest: (string | number)[]) => string,
  issues: Issue[],
): { value: Record<string, unknown>; index: number }[] {
  if (entries.length === 0) return entries;
  const indices = entries.map((entry) => entry.value["index"]);
  const present = indices.filter((value) => value !== undefined);
  if (present.length === 0) return entries;

  const usable = present.every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0);
  if (!usable) {
    const offender = entries.find(
      (entry) =>
        entry.value["index"] !== undefined &&
        !(typeof entry.value["index"] === "number" && Number.isInteger(entry.value["index"]) && (entry.value["index"] as number) >= 0),
    );
    issues.push(
      warning(
        "tab.index_unusable",
        path("tabs", offender?.index ?? 0, "index"),
        `Window ${ordinal} has a tab whose index is not a whole number, so the order in the file is used instead.`,
        "Remove the index fields to make the file's order authoritative, or fix the value.",
      ),
    );
    return entries;
  }
  if (present.length !== entries.length) {
    issues.push(
      warning(
        "tab.index_partial",
        path("tabs"),
        `Some tabs in window ${ordinal} have an index and some do not, so the order in the file is used.`,
        "Give every tab an index, or none of them.",
      ),
    );
    return entries;
  }

  const seen = new Set<number>();
  for (const entry of entries) {
    const value = entry.value["index"] as number;
    if (seen.has(value)) {
      issues.push(
        warning(
          "tab.index_duplicate",
          path("tabs", entry.index, "index"),
          `Two tabs in window ${ordinal} claim index ${value}, so the order in the file is used.`,
          "Renumber the tabs from 0, or remove the index fields.",
        ),
      );
      return entries;
    }
    seen.add(value);
  }

  return [...entries].sort((a, b) => (a.value["index"] as number) - (b.value["index"] as number));
}

function readTab(tab: TabsPackTab, path: string, position: number, issues: Issue[]): SessionTab {
  const raw = tab as unknown as Record<string, unknown>;
  const url = typeof raw["url"] === "string" ? raw["url"].trim() : "";
  const lastAccessedText = typeof raw["lastAccessed"] === "string" ? raw["lastAccessed"] : undefined;
  const lastAccessed = lastAccessedText ? Date.parse(lastAccessedText) : Number.NaN;
  if (lastAccessedText && Number.isNaN(lastAccessed)) {
    issues.push(
      warning(
        "tab.last_accessed_unreadable",
        `${path}.lastAccessed`,
        `"${lastAccessedText}" is not a timestamp TabsPack can read.`,
        "It is kept in the file as it is, and ignored for sorting.",
      ),
    );
  }

  const bag = bagOf(raw, TAB_KEYS);
  return {
    index: position,
    url,
    title: typeof raw["title"] === "string" ? raw["title"] : "",
    pinned: raw["pinned"] === true,
    active: raw["active"] === true,
    muted: raw["muted"] === true,
    discarded: raw["discarded"] === true,
    ...(typeof raw["favIconUrl"] === "string" && raw["favIconUrl"] !== ""
      ? { favIconUrl: raw["favIconUrl"] }
      : {}),
    openerIndex: typeof raw["openerIndex"] === "number" && Number.isInteger(raw["openerIndex"]) ? raw["openerIndex"] : null,
    cookieStoreId: typeof raw["cookieStoreId"] === "string" ? raw["cookieStoreId"] : null,
    lastAccessed: Number.isNaN(lastAccessed) ? null : lastAccessed,
    ...(lastAccessedText ? { lastAccessedText } : {}),
    ...(typeof raw["notes"] === "string" && raw["notes"] !== "" ? { notes: raw["notes"] } : {}),
    ...(isStringArray(raw["tags"]) ? { tags: [...(raw["tags"] as string[])] } : {}),
    ...(bag ? { unknown: bag } : {}),
  };
}

/**
 * `groupId` wins over the `group` title shorthand, and a title that names no
 * declared group creates one, both per docs/SPEC.md section 5. A `groupId`
 * pointing at nothing is dropped and reported: the tab is still restored, just
 * ungrouped, which is the smallest possible loss.
 */
function readGroupReference(
  raw: Record<string, unknown>,
  byKey: Map<string, SessionGroup>,
  byTitle: Map<string, SessionGroup>,
  groups: SessionGroup[],
  path: string,
  ordinal: number,
  issues: Issue[],
): string | undefined {
  const groupId = raw["groupId"];
  if (typeof groupId === "string" && groupId !== "") {
    const found = byKey.get(groupId);
    if (found) return found.key;
    issues.push(
      warning(
        "tab.group_missing",
        `${path}.groupId`,
        `A tab in window ${ordinal} points at the group "${groupId}", which the file never declares.`,
        "The tab is restored on its own. Add the group to the window's groups array to keep them together.",
      ),
    );
    return undefined;
  }
  const title = raw["group"];
  if (typeof title === "string" && title !== "") {
    const existing = byTitle.get(title);
    if (existing) return existing.key;
    const key = uniqueKey(`g${groups.length + 1}`, byKey);
    const created: SessionGroup = { key, title };
    groups.push(created);
    byKey.set(key, created);
    byTitle.set(title, created);
    return key;
  }
  return undefined;
}

function readGroup(group: TabsPackGroup, path: string, issues: Issue[]): SessionGroup {
  const raw = group as unknown as Record<string, unknown>;
  const key = typeof raw["id"] === "string" && raw["id"] !== "" ? raw["id"] : "g";
  const colour = raw["color"];
  let color: GroupColor | undefined;
  if (typeof colour === "string" && colour !== "") {
    if ((GROUP_COLORS as readonly string[]).includes(colour)) {
      color = colour as GroupColor;
    } else {
      color = "grey";
      issues.push(
        warning(
          "group.color_unknown",
          `${path}.color`,
          `"${colour}" is not a tab group colour this browser knows, so grey is used.`,
          `The colours are ${GROUP_COLORS.join(", ")}.`,
        ),
      );
    }
  }
  const bag = bagOf(raw, GROUP_KEYS);
  return {
    key,
    ...(typeof raw["title"] === "string" && raw["title"] !== "" ? { title: raw["title"] } : {}),
    ...(color ? { color } : {}),
    ...(raw["collapsed"] === true ? { collapsed: true } : {}),
    ...(bag ? { unknown: bag } : {}),
  };
}

/**
 * `openerIndex` refers to the file's indices, which reordering may have changed,
 * so it is remapped onto the session's positions. A reference to a tab that is
 * not in the window is dropped rather than left pointing at the wrong tab.
 */
function remapOpeners(
  tabs: SessionTab[],
  ordered: { value: Record<string, unknown>; index: number }[],
  issues: Issue[],
  path: (...rest: (string | number)[]) => string,
): void {
  const fileIndexToPosition = new Map<number, number>();
  ordered.forEach((entry, position) => {
    const declared = entry.value["index"];
    const key = typeof declared === "number" && Number.isInteger(declared) ? declared : entry.index;
    if (!fileIndexToPosition.has(key)) fileIndexToPosition.set(key, position);
  });

  tabs.forEach((tab, position) => {
    if (tab.openerIndex === null) return;
    const mapped = fileIndexToPosition.get(tab.openerIndex);
    if (mapped === undefined || mapped === position) {
      issues.push(
        warning(
          "tab.opener_missing",
          path("tabs", ordered[position]?.index ?? position, "openerIndex"),
          `A tab refers to the tab at index ${tab.openerIndex} as the one that opened it, and no such tab is in the window.`,
          "The tab is restored without that relationship. Nothing else is affected.",
        ),
      );
      tab.openerIndex = null;
      return;
    }
    tab.openerIndex = mapped;
  });
}

/** `counts` is advisory, so a mismatch is a warning about the file, never a refusal. */
function checkCounts(value: unknown, session: Session, issues: Issue[]): void {
  if (!isObject(value)) return;
  const actual = countSession(session);
  for (const key of ["windows", "tabs", "groups"] as const) {
    const claimed = value[key];
    if (typeof claimed !== "number" || claimed === actual[key]) continue;
    issues.push(
      warning(
        "counts.mismatch",
        jsonPath("counts", key),
        `The file says it holds ${claimed} ${key} and it actually holds ${actual[key]}.`,
        "The arrays are trusted over the counts, so the import is complete. The file was probably edited by hand.",
      ),
    );
  }
}

function readBounds(value: unknown): SessionWindow["bounds"] {
  if (!isObject(value)) return undefined;
  const bounds: Record<string, number> = {};
  for (const key of ["left", "top", "width", "height"] as const) {
    const found = value[key];
    if (typeof found === "number" && Number.isFinite(found)) bounds[key] = Math.round(found);
  }
  return Object.keys(bounds).length > 0 ? bounds : undefined;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Everything on this object that the current version does not know about. */
function bagOf(value: Record<string, unknown>, known: Set<string>): Record<string, unknown> | undefined {
  let bag: Record<string, unknown> | undefined;
  for (const key of Object.keys(value)) {
    if (known.has(key)) continue;
    bag ??= {};
    bag[key] = value[key];
  }
  return bag;
}

function uniqueKey(base: string, taken: Map<string, unknown>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * One report of each kind is useful, five thousand are not. Repeats of a code are
 * collapsed and the count is stated, so a 5000 tab file with a systematic problem
 * produces a readable list rather than a wall.
 */
export function capIssues(issues: Issue[]): Issue[] {
  const seen = new Map<string, number>();
  const out: Issue[] = [];
  for (const issue of issues) {
    const count = (seen.get(issue.code) ?? 0) + 1;
    seen.set(issue.code, count);
    if (count <= 3 && out.length < ISSUE_LIMIT) out.push(issue);
  }
  for (const [code, count] of seen) {
    if (count <= 3) continue;
    const first = issues.find((issue) => issue.code === code) as Issue;
    out.push({
      code: `${code}.more`,
      severity: first.severity,
      path: "$",
      message: `The same problem appears on ${count} objects in this file: ${first.message}`,
      ...(first.fix ? { fix: first.fix } : {}),
    });
  }
  return out;
}
