/**
 * The preview tree, task T-203, and the selection model behind it, task T-301.
 *
 * Two requirements shape this component. It has to render a 5000 tab pack without
 * the page stalling, which is NFR-005, so only the rows inside the viewport exist
 * in the document: the scroller is given the full height and rows are positioned
 * inside it. And it has to be operable by keyboard, which is T-506, so it is a
 * real tree: one tab stop, arrow keys to move, space to select, and `aria-checked`
 * on the row rather than a checkbox input, so a screen reader announces the row
 * and its state as one thing.
 */
import type { Session, SessionGroup, SessionTab, SessionWindow } from "../../types/session.js";
import { clear, el } from "../shared/dom.js";

export type RowKind = "window" | "group" | "tab";

export interface Row {
  kind: RowKind;
  /** Stable id: `w1`, `w1/g2`, `w1:7`. */
  id: string;
  windowKey: string;
  level: number;
  label: string;
  detail: string;
  /** Tabs only. */
  tab?: SessionTab;
  group?: SessionGroup;
  /** Row ids of every tab under this row, including itself for a tab row. */
  tabIds: string[];
  /** A note that overrides the selection, such as an address that cannot open. */
  blocked?: string;
  colour?: string;
}

export interface TreeCallbacks {
  onSelectionChange(): void;
}

/**
 * The words the tree needs, supplied by the caller. Passing them in rather than
 * reaching for the translation layer is what keeps this module testable in node:
 * the interface hands it `_locales`, and the test hands it plain English.
 */
export interface TreeStrings {
  tabs(count: number): string;
  groups(count: number): string;
  pinned(count: number): string;
  window(ordinal: number): string;
  unnamedGroup: string;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 6;
const MIN_TREE_HEIGHT = 120;
const MAX_TREE_HEIGHT = 480;

export class PreviewTree {
  private rows: Row[] = [];
  private visible: Row[] = [];
  private readonly selected = new Set<string>();
  private readonly collapsed = new Set<string>();
  private query = "";
  private matches: Set<string> | null = null;
  private focusIndex = 0;
  private readonly spacer: HTMLElement;
  private readonly surface: HTMLElement;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly callbacks: TreeCallbacks,
  ) {
    this.scroller.setAttribute("role", "tree");
    this.scroller.setAttribute("aria-multiselectable", "true");
    this.scroller.tabIndex = 0;
    this.spacer = el("div", { class: "tree-spacer" });
    this.surface = el("div", { class: "tree-surface" });
    this.spacer.appendChild(this.surface);
    clear(this.scroller);
    this.scroller.appendChild(this.spacer);
    this.scroller.addEventListener("scroll", () => this.paint());
    this.scroller.addEventListener("keydown", (event) => this.onKeyDown(event as KeyboardEvent));
  }

  /**
   * Replaces the contents. Every tab starts selected, including the ones no
   * extension can open: they are part of the pack, they are flagged in the row,
   * and the restore reports them and lists them on the placeholder page. A tab
   * quietly deselected on the user's behalf would be a tab they were never told
   * about.
   */
  load(session: Session, marks: { blocked: Map<string, string>; strings: TreeStrings }): void {
    this.rows = flatten(session, marks.blocked, marks.strings);
    this.selected.clear();
    this.collapsed.clear();
    this.query = "";
    this.matches = null;
    for (const row of this.rows) {
      if (row.kind === "tab") this.selected.add(row.id);
    }
    this.focusIndex = 0;
    this.scroller.scrollTop = 0;
    this.refresh();
  }

  selectedTabIds(): Set<string> {
    return new Set(this.selected);
  }

  /**
   * Search across title and address, task T-301. A window or a group stays in the
   * list when something inside it matches, so a match is never orphaned from the
   * window it belongs to, and collapsed rows open while a search is running.
   */
  setQuery(raw: string): void {
    const query = raw.trim().toLowerCase();
    this.query = query;
    if (query === "") {
      this.matches = null;
      this.refresh();
      return;
    }
    const matches = new Set<string>();
    for (const row of this.rows) {
      if (row.kind !== "tab") continue;
      const haystack = `${row.label} ${row.detail}`.toLowerCase();
      if (haystack.includes(query)) matches.add(row.id);
    }
    for (const row of this.rows) {
      if (row.kind === "tab") continue;
      if (row.tabIds.some((id) => matches.has(id))) matches.add(row.id);
    }
    this.matches = matches;
    this.focusIndex = 0;
    this.scroller.scrollTop = 0;
    this.refresh();
  }

  /** How many tabs the current search shows. Equal to the total when not searching. */
  shownCount(): number {
    if (!this.matches) return this.totalSelectable();
    return this.rows.filter((row) => row.kind === "tab" && this.matches?.has(row.id)).length;
  }

  searching(): boolean {
    return this.query !== "";
  }

  selectedCount(): number {
    return this.selected.size;
  }

  totalSelectable(): number {
    return this.rows.filter((row) => row.kind === "tab").length;
  }

  /**
   * With a search running these act on what is shown, which is the only reading
   * of "all" that makes sense in a filtered list. Without one they act on the
   * whole pack.
   */
  setAll(on: boolean): void {
    for (const row of this.rows) {
      if (row.kind !== "tab") continue;
      if (this.matches && !this.matches.has(row.id)) continue;
      if (on) this.selected.add(row.id);
      else this.selected.delete(row.id);
    }
    this.paint();
    this.callbacks.onSelectionChange();
  }

  private refresh(): void {
    this.visible = this.rows.filter((row) => this.isVisible(row));
    this.spacer.style.height = `${this.visible.length * ROW_HEIGHT}px`;
    // A small pack should not sit in a tall empty box, and a large one should not
    // push the restore controls off the screen.
    const wanted = Math.min(MAX_TREE_HEIGHT, Math.max(MIN_TREE_HEIGHT, this.visible.length * ROW_HEIGHT + 8));
    this.scroller.style.height = `${wanted}px`;
    this.paint();
  }

  private isVisible(row: Row): boolean {
    if (this.matches) return this.matches.has(row.id);
    if (row.level === 0) return true;
    if (this.collapsed.has(row.windowKey)) return false;
    const groupId = row.tab ? this.groupIdOf(row) : undefined;
    return !(groupId && this.collapsed.has(groupId));
  }

  private groupIdOf(row: Row): string | undefined {
    return row.tab?.groupKey ? `${row.windowKey}/${row.tab.groupKey}` : undefined;
  }

  /** Only the rows inside the viewport are in the document. */
  private paint(): void {
    const top = this.scroller.scrollTop;
    const height = this.scroller.clientHeight || ROW_HEIGHT * 12;
    const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(this.visible.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);

    clear(this.surface);
    for (let index = first; index < last; index += 1) {
      const row = this.visible[index];
      if (!row) continue;
      this.surface.appendChild(this.renderRow(row, index));
    }
    this.scroller.setAttribute("aria-activedescendant", this.visible[this.focusIndex]?.id ?? "");
  }

  private renderRow(row: Row, index: number): HTMLElement {
    const node = el("div", { class: `tree-row kind-${row.kind}` });
    node.style.top = `${index * ROW_HEIGHT}px`;
    node.id = row.id;
    node.setAttribute("role", "treeitem");
    node.setAttribute("aria-level", String(row.level + 1));
    node.dataset.index = String(index);
    node.tabIndex = -1;
    if (row.kind !== "tab") {
      node.setAttribute("aria-expanded", this.collapsed.has(row.id) ? "false" : "true");
    }
    node.setAttribute("aria-checked", this.stateOf(row));
    if (index === this.focusIndex) node.dataset.focused = "true";

    if (row.kind !== "tab") {
      const twisty = el("span", { class: "twisty", text: this.collapsed.has(row.id) ? "▸" : "▾" });
      twisty.setAttribute("aria-hidden", "true");
      node.appendChild(twisty);
    } else {
      node.appendChild(el("span", { class: "twisty" }));
    }

    const box = el("span", { class: "tree-check", text: glyphFor(this.stateOf(row)) });
    box.setAttribute("aria-hidden", "true");
    node.appendChild(box);

    if (row.colour) {
      const dot = el("span", { class: "group-dot" });
      dot.dataset.colour = row.colour;
      dot.setAttribute("aria-hidden", "true");
      node.appendChild(dot);
    }

    node.appendChild(el("span", { class: "tree-label", text: row.label }));
    if (row.detail) node.appendChild(el("span", { class: "tree-detail", text: row.detail }));
    if (row.blocked) node.appendChild(el("span", { class: "tree-flag", text: row.blocked }));

    node.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      this.focusIndex = index;
      if (row.kind !== "tab" && target.classList.contains("twisty")) {
        this.toggleCollapse(row);
        return;
      }
      this.toggle(row);
    });
    return node;
  }

  private stateOf(row: Row): "true" | "false" | "mixed" {
    if (row.kind === "tab") return this.selected.has(row.id) ? "true" : "false";
    if (row.tabIds.length === 0) return "false";
    const on = row.tabIds.filter((id) => this.selected.has(id)).length;
    if (on === 0) return "false";
    return on === row.tabIds.length ? "true" : "mixed";
  }

  private toggle(row: Row): void {
    const ids = row.kind === "tab" ? [row.id] : row.tabIds;
    if (ids.length === 0) return;
    const turningOn = this.stateOf(row) !== "true";
    for (const id of ids) {
      if (turningOn) this.selected.add(id);
      else this.selected.delete(id);
    }
    this.paint();
    this.callbacks.onSelectionChange();
  }

  private toggleCollapse(row: Row): void {
    if (this.collapsed.has(row.id)) this.collapsed.delete(row.id);
    else this.collapsed.add(row.id);
    this.refresh();
  }

  private onKeyDown(event: KeyboardEvent): void {
    const row = this.visible[this.focusIndex];
    switch (event.key) {
      case "ArrowDown":
        this.moveFocus(this.focusIndex + 1);
        break;
      case "ArrowUp":
        this.moveFocus(this.focusIndex - 1);
        break;
      case "Home":
        this.moveFocus(0);
        break;
      case "End":
        this.moveFocus(this.visible.length - 1);
        break;
      case "ArrowRight":
        if (row && row.kind !== "tab" && this.collapsed.has(row.id)) this.toggleCollapse(row);
        else this.moveFocus(this.focusIndex + 1);
        break;
      case "ArrowLeft":
        if (row && row.kind !== "tab" && !this.collapsed.has(row.id)) this.toggleCollapse(row);
        else this.moveFocus(this.parentOf(this.focusIndex));
        break;
      case " ":
      case "Enter":
        if (row) this.toggle(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private parentOf(index: number): number {
    const row = this.visible[index];
    if (!row) return index;
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if ((this.visible[candidate]?.level ?? 0) < row.level) return candidate;
    }
    return index;
  }

  private moveFocus(to: number): void {
    const next = Math.max(0, Math.min(this.visible.length - 1, to));
    this.focusIndex = next;
    const top = next * ROW_HEIGHT;
    const height = this.scroller.clientHeight;
    if (top < this.scroller.scrollTop) this.scroller.scrollTop = top;
    else if (top + ROW_HEIGHT > this.scroller.scrollTop + height) {
      this.scroller.scrollTop = top + ROW_HEIGHT - height;
    }
    this.paint();
  }
}

function glyphFor(state: "true" | "false" | "mixed"): string {
  if (state === "true") return "☑";
  if (state === "mixed") return "☒";
  return "☐";
}

/**
 * Windows, then their groups in order of first appearance with their members
 * under them, then everything ungrouped in the file's order. A group's tabs are
 * shown together even when the file interleaved them, because that is how the
 * browser will show them after a restore.
 */
export function flatten(session: Session, blocked: Map<string, string>, strings: TreeStrings): Row[] {
  const rows: Row[] = [];
  for (const win of session.windows) {
    const windowRow: Row = {
      kind: "window",
      id: win.key,
      windowKey: win.key,
      level: 0,
      label: win.name ?? strings.window(rows.filter((row) => row.kind === "window").length + 1),
      detail: describeWindow(win, strings),
      tabIds: win.tabs.map((tab) => tabId(win, tab)),
    };
    rows.push(windowRow);

    const emitted = new Set<string>();
    for (const tab of win.tabs) {
      const id = tabId(win, tab);
      if (emitted.has(id)) continue;
      const group = tab.groupKey ? win.groups.find((candidate) => candidate.key === tab.groupKey) : undefined;
      if (group) {
        const members = win.tabs.filter((candidate) => candidate.groupKey === group.key);
        rows.push({
          kind: "group",
          id: `${win.key}/${group.key}`,
          windowKey: win.key,
          level: 1,
          label: group.title ?? strings.unnamedGroup,
          detail: strings.tabs(members.length),
          group,
          tabIds: members.map((member) => tabId(win, member)),
          ...(group.color ? { colour: group.color } : {}),
        });
        for (const member of members) {
          rows.push(tabRow(win, member, 2, blocked));
          emitted.add(tabId(win, member));
        }
        continue;
      }
      rows.push(tabRow(win, tab, 1, blocked));
      emitted.add(id);
    }
  }
  return rows;
}

function tabRow(win: SessionWindow, tab: SessionTab, level: number, blocked: Map<string, string>): Row {
  const id = tabId(win, tab);
  const note = blocked.get(id);
  return {
    kind: "tab",
    id,
    windowKey: win.key,
    level,
    label: tab.title || tab.url,
    detail: shortUrl(tab.url),
    tab,
    tabIds: [id],
    ...(note ? { blocked: note } : {}),
  };
}

export function tabId(win: SessionWindow, tab: SessionTab): string {
  return `${win.key}:${tab.index}`;
}

function describeWindow(win: SessionWindow, strings: TreeStrings): string {
  const parts = [strings.tabs(win.tabs.length)];
  if (win.groups.length > 0) parts.push(strings.groups(win.groups.length));
  const pinned = win.tabs.filter((tab) => tab.pinned).length;
  if (pinned > 0) parts.push(strings.pinned(pinned));
  return parts.join(" · ");
}

/**
 * Host and path, which is what a person recognises on a web address. Any other
 * scheme keeps its prefix, because `chrome://settings` shortened to `settings`
 * would be unrecognisable and this list is mostly read to spot the odd one out.
 */
export function shortUrl(url: string): string {
  const shortened = url.replace(/^https?:\/\//i, "");
  return shortened.length > 90 ? `${shortened.slice(0, 87)}...` : shortened;
}
