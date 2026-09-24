/**
 * The TabsPack wire format. This file is the single source of truth for
 * `schema/tabspack.v1.schema.json`, which is generated from these types.
 * Changing anything here means following docs/PLAYBOOK.md section 4.
 *
 * Normative description: docs/SPEC.md
 */

/** Literal value of the `format` field. A file without it is rejected. */
export const FORMAT = "tabspack";

/** Current schema version. See docs/SPEC.md section 9 before bumping. */
export const SCHEMA_VERSION = 1;

/** Tab group colours, spelled as the browser API spells them. */
export type GroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export const GROUP_COLORS: readonly GroupColor[] = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

export type WindowType = "normal" | "popup" | "app";
export type WindowState = "normal" | "minimized" | "maximized" | "fullscreen";

/** Window position and size in CSS pixels. */
export interface TabsPackBounds {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

/**
 * A tab group, declared inside the window that owns it. `id` is file local:
 * browser group ids are process local integers and are never written here.
 */
export interface TabsPackGroup {
  /** File local identifier, referenced by `TabsPackTab.groupId`. */
  id: string;
  title?: string;
  color?: GroupColor;
  collapsed?: boolean;
}

/** A single tab. `url` is the only mandatory field in the whole format. */
export interface TabsPackTab {
  url: string;
  /** Zero based position within the window. Array order is used when absent. */
  index?: number;
  title?: string;
  pinned?: boolean;
  active?: boolean;
  /** Reference to a `TabsPackGroup.id` in the same window. */
  groupId?: string;
  /** Shorthand for a group by title, for hand written files. `groupId` wins. */
  group?: string;
  favIconUrl?: string;
  muted?: boolean;
  discarded?: boolean;
  /** `index` of the opener tab in the same window, or null. */
  openerIndex?: number | null;
  /** Gecko contextual identity. Ignored on Chromium. */
  cookieStoreId?: string | null;
  /** ISO 8601 timestamp, advisory. */
  lastAccessed?: string;
  notes?: string;
  tags?: string[];
}

/** One browser window and everything in it. */
export interface TabsPackWindow {
  /** File local identifier. Convention `w1`, `w2`. */
  id?: string;
  /** User label. Not a browser feature on Chromium. */
  name?: string;
  tabs: TabsPackTab[];
  groups?: TabsPackGroup[];
  focused?: boolean;
  incognito?: boolean;
  type?: WindowType;
  state?: WindowState;
  bounds?: TabsPackBounds;
}

/** Provenance of the export. Every member is optional. */
export interface TabsPackSource {
  browser?: string;
  browserVersion?: string;
  os?: string;
  extensionVersion?: string;
  profile?: string;
  deviceName?: string;
}

/** Advisory counts. A reader trusts the arrays over these. */
export interface TabsPackCounts {
  windows?: number;
  tabs?: number;
  groups?: number;
}

/** A `.tabspack.json` file. */
export interface TabsPackFile {
  /** Always `"tabspack"`. A reader rejects a file without it rather than guess. */
  format: "tabspack";
  /** Integer. A reader refuses a version it does not support. */
  schemaVersion: number;
  /** ISO 8601 with offset. */
  exportedAt: string;
  name?: string;
  tags?: string[];
  source?: TabsPackSource;
  counts?: TabsPackCounts;
  windows: TabsPackWindow[];
}
