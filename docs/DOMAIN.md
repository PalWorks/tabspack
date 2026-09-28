# Domain: Browser Tab and Session Semantics

Why this file exists: most bugs in this category of extension come from assuming browser concepts behave the way they look. This is the shared vocabulary, and it doubles as the glossary.

## Table D1: Terminology

| Term | Definition in TabsPack | Trap to avoid |
|---|---|---|
| Tab | One `browser.tabs.Tab`. Identified at runtime by a numeric `id` that is unique per browser process | `id` is worthless in a file. It changes on every restore. Never persist it as a reference |
| Window | One `browser.windows.Window` holding an ordered list of tabs | A window can be `normal`, `popup` or `app`. Only `normal` windows hold restorable tab sets |
| Index | A tab's zero based position within its window | Pinned tabs always occupy the lowest indices. Restoring a tab at index 5 before the pinned tabs exist puts it in the wrong place |
| Pinned | A tab fixed to the left of the tab strip | Pinned state must be set at creation. Pinning afterwards reorders the strip and invalidates indices already used |
| Active tab | The one visible tab per window | At most one per window. Activating during a bulk restore causes the browser to load that page immediately, which is exactly what throttling exists to avoid. A group holding the active tab cannot be collapsed, so collapsing happens after activating |
| Focused window | The one window with OS focus | Independent of active tab. Only one per browser |
| Last accessed | When the user last had this tab active, as `tabs.lastAccessed` | **Optional, and often absent.** Older browsers do not supply it, and no import format except Tab Session Manager carries one. An absent value means unknown, never old, and nothing in the product may treat the two as the same: ADR-044 |
| Tab group | A named, coloured, collapsible set of tabs within one window, `browser.tabGroups` | Chromium 89 and later, Gecko 139 and later. A group cannot span windows. `tabs.create` cannot assign a group, so grouping is always a second step. `tabs.group` needs no permission, but reading or setting a group's title, colour and collapsed state needs `tabGroups`: without it a restore produces grouped but unlabelled tabs, which must be reported |
| Group id | A numeric runtime id | Like tab ids, meaningless across sessions. The file uses its own `g1` style ids |
| Discarded, unloaded | A tab whose page has been unloaded to free memory, tab strip entry retained | Chromium cannot create a tab already discarded, it must be created then discarded, and three measured facts follow from that: a tab unloaded before its navigation commits loses its address permanently, the tab gets a **new id** when it unloads, and a tab that has never rendered has no title to show. Gecko accepts `discarded: true` at creation, keeps the address, shows the `title` it was given, and loads a pinned tab anyway. All of it is in ADR-025 |
| Unloaded or pending tab | A restored tab that has never been rendered, so `url` may be empty and `pendingUrl` holds the target | Reading `url` alone loses these tabs. Always fall back to `pendingUrl`, the bug Copy All URLs handles and the others do not |
| Suspended tab | A tab a third party suspender has parked on a page of its own, keeping the real address inside that page's query or fragment | To the browser it is an extension page, so it is unopenable and it dedupes against nothing. TabsPack recovers the address it stands for, by the shape of the wrapper and never by extension id: ADR-023 |
| Container, contextual identity | Gecko feature isolating cookies per identity, exposed as `cookieStoreId` | No Chromium equivalent. Carry the field, ignore it on import |
| Incognito or private window | A window whose tabs are not persisted by the browser | The extension cannot see these at all unless the user grants incognito access in browser settings. Excluded by default |
| Restricted URL | A URL an extension is not permitted to open, such as `chrome://`, `about:`, `view-source:`, `javascript:`, `data:` | `tabs.create` rejects or silently produces a blank tab. Must be reported, never dropped silently. See SPEC section 8 |
| `file://` URL | A local file | Requires a browser level file access permission granted outside the extension. Treat as restricted unless the probe says otherwise |
| Session | In TabsPack, the in memory model of a set of windows, tabs and groups | Not the browser `sessions` API, which is about recently closed items. Different concept, similar name |
| Snapshot | A session saved inside the extension's local storage, with a name and tags | Not a file. A file is what a snapshot becomes on export |
| Automatic snapshot | A snapshot the worker took on the user's chosen interval, tagged `auto` | Part of a rolling series: the newest N are kept and older automatic ones are removed, ADR-047. Renaming one makes it an ordinary snapshot, which is never removed |
| Recovery copy | One rolling copy of the open tabs, kept by the worker from install unless the user turns it off | Not a snapshot and not listed as one. Set aside as the previous session when the browser starts, and compared with what came back: ADR-048 |
| Recent session | The recovery copy as it stood when one browser session ended, in a list of the last five, newest first | Not a snapshot until the user keeps it, when it becomes one and leaves the list. A session where no tab changed is not a new entry: ADR-049 |
| Recovery offer | What TabsPack shows after a start that lost a meaningful part of the previous session | Opens the preview with only the missing tabs. Never restores on its own |
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
| `tabs.create({title})` | Rejected as an unrecognised property | Accepted, and shown on a tab created unloaded |
| Unknown property on an API call | Rejected outright, which makes it a reliable probe | Ignored |
| Window bounds with a state such as maximized | Refused in one call, so the state is applied second | Same |
| Containers | Absent | `cookieStoreId` |
| Service worker versus background page | MV3 service worker | MV3 with an event page, both supported |

## Business rules

1. A pack records what was open. It is not a bookmark collection and imposes no folder hierarchy.
2. A pack never carries anything that could authenticate anyone.
3. Rules for lossy conversion: an import from a lower fidelity source never invents structure. One window in, one window out.
4. The user chooses what to restore. Nothing opens without an explicit action after the preview.
5. Silence is a bug. Every skipped, deduplicated, ungrouped or unopenable tab appears in a report.
6. A pack records the page a tab stands for. Where a suspender has parked a tab on one of its own pages, the pack holds the page's own address, and the count of what was recovered is reported: ADR-023.
7. Unknown is not a value. Where the browser tells us nothing, the product says it knows nothing rather than substituting the convenient reading. A tab with no last accessed time is not an old tab, and it is counted in a band of its own rather than hidden: ADR-044.
8. A restore costs the machine as little as the browser allows. Tabs are created unloaded unless the user says otherwise, because the people who move a session of this size are the people who cannot afford it loading at once: ADR-024.
