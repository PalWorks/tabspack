/**
 * The reference browser state used by the round trip fixture and by the tests:
 * three windows, forty tabs, three groups, two pinned tabs, one unloaded tab,
 * one duplicate URL and one restricted URL that cannot be restored.
 */
import type { RawGroup, RawWindow } from "../../src/core/adapter/types.js";
import { group, tab, window_ } from "./fake-adapter.js";

export interface Scenario {
  windows: RawWindow[];
  groups: RawGroup[];
}

const TOPICS = [
  "Tab groups in Chromium",
  "WebExtensions API reference",
  "Session restore internals",
  "JSON Schema draft 07",
  "Accessibility tree basics",
  "Service worker lifecycle",
  "Colour contrast ratios",
  "Deterministic serialisation",
  "Fixture driven testing",
  "Keyboard interaction patterns",
];

export function referenceScenario(): Scenario {
  const windows: RawWindow[] = [];
  const groups: RawGroup[] = [];
  let tabId = 100;

  // Window 1: 18 tabs, two groups, two pinned tabs, one unloaded tab.
  const w1 = window_({
    id: 1,
    focused: true,
    state: "maximized",
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    tabs: [],
  });
  groups.push(group({ id: 11, windowId: 1, title: "Research", color: "blue" }));
  groups.push(group({ id: 12, windowId: 1, title: "Reading", color: "green", collapsed: true }));
  for (let index = 0; index < 18; index += 1) {
    const pinned = index < 2;
    const groupId = index >= 4 && index < 9 ? 11 : index >= 9 && index < 13 ? 12 : -1;
    w1.tabs?.push(
      tab({
        id: (tabId += 1),
        index,
        url: index === 17 ? "" : `https://example.com/research/${index}`,
        pendingUrl: index === 17 ? "https://example.com/research/unloaded" : undefined,
        title: `${TOPICS[index % TOPICS.length]} ${index}`,
        pinned,
        active: index === 4,
        groupId,
        discarded: index === 17,
        favIconUrl: index === 3 ? "data:image/png;base64,AAAA" : "https://example.com/favicon.ico",
        lastAccessed: 1_759_000_000_000 + index * 1000,
      }),
    );
  }
  windows.push(w1);

  // Window 2: 14 tabs, one group, one duplicate of a window 1 URL.
  const w2 = window_({ id: 2, state: "normal", left: 40, top: 40, width: 1280, height: 800, tabs: [] });
  groups.push(group({ id: 21, windowId: 2, title: "Shopping", color: "orange" }));
  for (let index = 0; index < 14; index += 1) {
    w2.tabs?.push(
      tab({
        id: (tabId += 1),
        index,
        url: index === 13 ? "https://example.com/research/5" : `https://example.org/item/${index}`,
        title: `Item ${index}`,
        active: index === 0,
        groupId: index < 5 ? 21 : -1,
        mutedInfo: { muted: index === 2 },
        openerTabId: index > 0 ? tabId - 1 : undefined,
      }),
    );
  }
  windows.push(w2);

  // Window 3: 8 tabs, no groups, one restricted URL, one file URL.
  const w3 = window_({ id: 3, state: "normal", tabs: [] });
  for (let index = 0; index < 8; index += 1) {
    w3.tabs?.push(
      tab({
        id: (tabId += 1),
        index,
        url:
          index === 0
            ? "chrome://settings/"
            : index === 1
              ? "file:///home/example/notes.txt"
              : `https://example.net/page/${index}`,
        title: index === 0 ? "Settings" : `Page ${index}`,
        active: index === 2,
      }),
    );
  }
  windows.push(w3);

  return { windows, groups };
}

/** A deterministic scenario of any size, for the performance harness. */
export function syntheticScenario(tabCount: number, perWindow = 100): Scenario {
  const windows: RawWindow[] = [];
  const groups: RawGroup[] = [];
  let tabId = 1;
  let windowId = 1;

  for (let created = 0; created < tabCount; created += perWindow) {
    const size = Math.min(perWindow, tabCount - created);
    const win = window_({ id: windowId, focused: windowId === 1, tabs: [] });
    const groupId = windowId * 1000;
    groups.push(group({ id: groupId, windowId, title: `Group ${windowId}`, color: "purple" }));
    for (let index = 0; index < size; index += 1) {
      win.tabs?.push(
        tab({
          id: (tabId += 1),
          index,
          url: `https://example.com/w${windowId}/page-${index}?q=${index}`,
          title: `${TOPICS[index % TOPICS.length]} in window ${windowId}, tab ${index}`,
          pinned: index < 2,
          active: index === 0,
          groupId: index < 10 ? groupId : -1,
          favIconUrl: "https://example.com/favicon.ico",
          lastAccessed: 1_759_000_000_000 + index * 37,
        }),
      );
    }
    windows.push(win);
    windowId += 1;
  }
  return { windows, groups };
}
