/**
 * The in memory model. Unlike `TabsPackFile` this may change freely between
 * releases, because nothing outside the extension process observes it.
 * `core/serialize.ts` is the only bridge between the two.
 */
import type { GroupColor, WindowState, WindowType } from "./tabspack.js";

/** Scope of a capture. */
export type Scope = "all_windows" | "current_window" | "current_tab" | "selection";

export interface SessionGroup {
  /** File local key, assigned in order of first appearance: g1, g2, ... */
  key: string;
  title?: string;
  color?: GroupColor;
  collapsed?: boolean;
  /** Fields carried in from a file that this version does not understand. */
  unknown?: Record<string, unknown>;
}

export interface SessionTab {
  index: number;
  url: string;
  title: string;
  pinned: boolean;
  active: boolean;
  muted: boolean;
  discarded: boolean;
  groupKey?: string;
  favIconUrl?: string;
  openerIndex: number | null;
  cookieStoreId: string | null;
  /** Epoch milliseconds, or null when the browser does not report it. */
  lastAccessed: number | null;
  /**
   * The timestamp exactly as an imported file spelled it. Kept so a pack read in
   * one timezone and written out again is byte identical, rather than silently
   * restamped with the reader's offset.
   */
  lastAccessedText?: string;
  notes?: string;
  tags?: string[];
  /** Fields carried in from a file that this version does not understand. */
  unknown?: Record<string, unknown>;
}

export interface SessionWindow {
  /** File local key: w1, w2, ... */
  key: string;
  name?: string;
  focused: boolean;
  incognito: boolean;
  type: WindowType;
  state?: WindowState;
  bounds?: { left?: number; top?: number; width?: number; height?: number };
  groups: SessionGroup[];
  tabs: SessionTab[];
  unknown?: Record<string, unknown>;
}

export interface SessionSource {
  browser?: string;
  browserVersion?: string;
  os?: string;
  extensionVersion?: string;
  profile?: string;
  deviceName?: string;
  unknown?: Record<string, unknown>;
}

export interface Session {
  windows: SessionWindow[];
  source: SessionSource;
  /** Epoch milliseconds of capture. */
  capturedAt: number;
  /** `exportedAt` exactly as an imported file spelled it. See `SessionTab.lastAccessedText`. */
  exportedAtText?: string;
  /** Pack level label and labels, carried through from a file. */
  name?: string;
  tags?: string[];
  unknown?: Record<string, unknown>;
}

export function countSession(session: Session): { windows: number; tabs: number; groups: number } {
  let tabs = 0;
  let groups = 0;
  for (const win of session.windows) {
    tabs += win.tabs.length;
    groups += win.groups.length;
  }
  return { windows: session.windows.length, tabs, groups };
}
