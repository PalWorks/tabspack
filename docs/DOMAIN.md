# Domain: Browser Tab and Session Semantics

Why this file exists: most bugs in this category of extension come from assuming browser concepts behave the way they look. This is the shared vocabulary, and it doubles as the glossary.

## Table D1: Terminology

| Term | Definition in TabsPack | Trap to avoid |
|---|---|---|
| Tab | One `browser.tabs.Tab`. Identified at runtime by a numeric `id` that is unique per browser process | `id` is worthless in a file. It changes on every restore. Never persist it as a reference |
| Window | One `browser.windows.Window` holding an ordered list of tabs | A window can be `normal`, `popup` or `app`. Only `normal` windows hold restorable tab sets |
| Index | A tab's zero based position within its window | Pinned tabs always occupy the lowest indices. Restoring a tab at index 5 before the pinned tabs exist puts it in the wrong place |
| Pinned | A tab fixed to the left of the tab strip | Pinned state must be set at creation. Pinning afterwards reorders the strip and invalidates indices already used |
| Active tab | The one visible tab per window | At most one per window. Activating during a bulk restore causes the browser to load that page immediately, which is exactly what throttling exists to avoid |
| Focused window | The one window with OS focus | Independent of active tab. Only one per browser |
| Tab group | A named, coloured, collapsible set of tabs within one window, `browser.tabGroups` | Chromium 89 and later, Gecko 139 and later. A group cannot span windows. `tabs.create` cannot assign a group, so grouping is always a second step |
| Group id | A numeric runtime id | Like tab ids, meaningless across sessions. The file uses its own `g1` style ids |
| Discarded | A tab whose page has been unloaded to free memory, tab strip entry retained | Chromium cannot create a tab already discarded, it must be created then discarded. Gecko accepts `discarded: true` at creation |
| Unloaded or pending tab | A restored tab that has never been rendered, so `url` may be empty and `pendingUrl` holds the target | Reading `url` alone loses these tabs. Always fall back to `pendingUrl`, the bug Copy All URLs handles and the others do not |
| Container, contextual identity | Gecko feature isolating cookies per identity, exposed as `cookieStoreId` | No Chromium equivalent. Carry the field, ignore it on import |
| Incognito or private window | A window whose tabs are not persisted by the browser | The extension cannot see these at all unless the user grants incognito access in browser settings. Excluded by default |
| Restricted URL | A URL an extension is not permitted to open, such as `chrome://`, `about:`, `view-source:`, `javascript:`, `data:` | `tabs.create` rejects or silently produces a blank tab. Must be reported, never dropped silently. See SPEC section 8 |
| `file://` URL | A local file | Requires a browser level file access permission granted outside the extension. Treat as restricted unless the probe says otherwise |
| Session | In TabsPack, the in memory model of a set of windows, tabs and groups | Not the browser `sessions` API, which is about recently closed items. Different concept, similar name |
| Snapshot | A session saved inside the extension's local storage, with a name and tags | Not a file. A file is what a snapshot becomes on export |
| Pack, TabsPack file | A `.tabspack.json` file conforming to SPEC.md | The interchange unit. The only thing a third party tool sees |
| Scope | Which tabs an action covers: current tab, current window, all windows, selected tabs | The four scopes Copy All URLs settled on, minus its group scope, which we fold into selection |
| Round trip | Export then import reproducing the original state | The product's central claim. Anything that breaks it is a defect, not a limitation, unless it is listed in LIMITATIONS.md |

## Table D2: Semantics that differ by engine

| Behaviour | Chromium | Gecko |
|---|---|---|
| `browser.*` promises | Needs `webextension-polyfill` | Native |
| `tabGroups` | 89 and later, permission `tabGroups` | 139 and later |
| `tabs.create({discarded})` | Not supported | Supported |
| Window title | Not settable | `titlePreface` on `windows.update` |
| Containers | Absent | `cookieStoreId` |
| Service worker versus background page | MV3 service worker | MV3 with an event page, both supported |

## Business rules

1. A pack records what was open. It is not a bookmark collection and imposes no folder hierarchy.
2. A pack never carries anything that could authenticate anyone.
3. Rules for lossy conversion: an import from a lower fidelity source never invents structure. One window in, one window out.
4. The user chooses what to restore. Nothing opens without an explicit action after the preview.
5. Silence is a bug. Every skipped, deduplicated, ungrouped or unopenable tab appears in a report.
