# The TabsPack File Format

| Field | Value |
|---|---|
| Format name | `tabspack` |
| Current schema version | 1 (draft, not yet frozen) |
| File extension | `.tabspack.json` |
| Media type | `application/json` |
| Encoding | UTF-8, no byte order mark |
| Status | Frozen as of milestone M1 in [ROADMAP.md](ROADMAP.md). A change now requires a `schemaVersion` decision and the procedure in [PLAYBOOK.md](PLAYBOOK.md) section 4 |
| Licence | The specification is released under MIT with the rest of the repository. Third party implementations are encouraged |

This is the normative description of the format. The extension is one implementation of it. Where this document and the code disagree, this document is wrong and must be corrected, or the code is a bug; either way the discrepancy is a defect.

The machine readable JSON Schema is `schema/tabspack.v1.schema.json`. It is generated from the TypeScript types in `src/types/tabspack.ts` and tested against every fixture; a hand edit of it fails the build.

Its canonical address, and the `$id` it declares, is:

```
https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json
```

That URL resolves: the site publishes the same bytes as the repository, and the build fails if the two disagree or if the `$id` stops matching the path. A reader is free to fetch it, and equally free never to: the schema in the package is the same file. If the format ever moves to a shorter address, that is a `schemaVersion` decision under [PLAYBOOK.md](PLAYBOOK.md) section 4 and not an edit, because the address is part of what has been published. ADR-043.

## 1. Design rules

1. Arrays, not id keyed objects. Browser tab and window ids are process local integers and are meaningless on the importing machine, so they are never used as keys or references across files.
2. Order is explicit. `index` is authoritative within a window.
3. Only `url` is mandatory on a tab. Everything else is optional, so a hand written file with one URL per tab is valid.
4. Browser specific fields are always optional and always ignorable.
5. Unknown fields MUST be ignored for behaviour and MUST be preserved when an implementation rewrites a file. See section 6.
6. No credentials. A conforming file MUST NOT contain cookies, session tokens, authorization headers, form values or local storage contents.

## 2. Example

```json
{
  "format": "tabspack",
  "schemaVersion": 1,
  "exportedAt": "2026-09-24T08:29:40+05:30",
  "source": {
    "browser": "Chrome",
    "browserVersion": "141.0.0.0",
    "os": "Linux",
    "extensionVersion": "1.0.0",
    "profile": "Default"
  },
  "counts": { "windows": 1, "tabs": 3, "groups": 1 },
  "windows": [
    {
      "id": "w1",
      "name": "Research",
      "focused": true,
      "incognito": false,
      "type": "normal",
      "state": "maximized",
      "bounds": { "left": 0, "top": 0, "width": 1920, "height": 1080 },
      "groups": [
        { "id": "g1", "title": "AI", "color": "blue", "collapsed": false }
      ],
      "tabs": [
        {
          "index": 0,
          "url": "https://example.com/pinned",
          "title": "Pinned reference",
          "pinned": true
        },
        {
          "index": 1,
          "url": "https://example.com/a",
          "title": "Example A",
          "active": true,
          "groupId": "g1",
          "favIconUrl": "https://example.com/favicon.ico",
          "lastAccessed": "2026-09-24T08:10:11+05:30"
        },
        {
          "index": 2,
          "url": "https://example.com/b",
          "title": "Example B",
          "group": "AI",
          "muted": true,
          "discarded": true,
          "notes": "read after the meeting",
          "tags": ["todo"]
        }
      ]
    }
  ]
}
```

## 3. Top level object

### Table S1: Top level fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | string | Yes | MUST be the literal `tabspack`. An implementation MUST reject a file without it rather than guess |
| `schemaVersion` | integer | Yes | 1 for this version. An implementation MUST refuse a higher version it does not understand, with a clear message, and MUST migrate a lower one |
| `exportedAt` | string | Yes | ISO 8601 with offset. Local offset preferred over Z, because the offset is information about the user's session |
| `source` | object | No | Provenance. All members optional: `browser`, `browserVersion`, `os`, `extensionVersion`, `profile`, `deviceName` |
| `counts` | object | No | `windows`, `tabs`, `groups`. Advisory only. A reader MUST trust the arrays over `counts`, and MAY warn on mismatch |
| `windows` | array | Yes | One or more window objects. MAY be empty only if the file is a deliberate empty snapshot |
| `name` | string | No | A user label for the whole pack, for example `Q3 research` |
| `tags` | array of string | No | User labels for the whole pack |

## 4. Window object

### Table S2: Window fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | No | File local identifier, referenced by nothing except readability. Convention `w1`, `w2` |
| `name` | string | No | User visible label. Not a browser feature on Chromium. Used in the TabsPack preview UI, and as a window title preface on Gecko where supported |
| `tabs` | array | Yes | Tab objects |
| `groups` | array | No | Group objects declared by this window |
| `focused` | boolean | No | Which window was focused at export |
| `incognito` | boolean | No | True if the window was private. Default false |
| `type` | string | No | `normal`, `popup`, `app`. Anything other than `normal` SHOULD be skipped on restore |
| `state` | string | No | `normal`, `minimized`, `maximized`, `fullscreen` |
| `bounds` | object | No | `left`, `top`, `width`, `height` in CSS pixels |

## 5. Tab object

### Table S3: Tab fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `url` | string | Yes | The only mandatory field in the format |
| `index` | integer | No | Position within the window, zero based. When absent, array order is used |
| `title` | string | No | Page title at export |
| `pinned` | boolean | No | Pinned tabs sort before unpinned ones on restore, matching browser behaviour |
| `active` | boolean | No | At most one per window SHOULD be true. A reader encountering several MUST honour the first |
| `groupId` | string | No | Reference to a `groups[].id` in the same window. MUST NOT be a browser numeric id |
| `group` | string | No | Shorthand for a group by title, for hand written files. When both `groupId` and `group` are present, `groupId` wins. When only `group` is present, the reader creates or reuses a group with that title and a default colour |
| `favIconUrl` | string | No | An http or https URL, or a `data:` URL. Writers strip `data:` URLs by default. Readers MUST treat this as untrusted and MUST NOT fetch it during import |
| `muted` | boolean | No | Audio muted state |
| `discarded` | boolean | No | A hint that the tab was unloaded, and a hint to restore it unloaded |
| `openerIndex` | integer or null | No | `index` of the opener tab within the same window, for tab tree reconstruction. Null or absent means no opener |
| `cookieStoreId` | string or null | No | Gecko container identity. Ignored on Chromium |
| `lastAccessed` | string | No | ISO 8601, advisory, useful for sorting in the preview |
| `notes` | string | No | Free text carried through untouched |
| `tags` | array of string | No | User labels carried through untouched |

## 6. Group object

### Table S4: Group fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | Yes | File local identifier, referenced by `tabs[].groupId`. Convention `g1`, `g2` |
| `title` | string | No | Group name |
| `color` | string | No | One of `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange`. Spelled `color` to match the browser API. An unknown value MUST fall back to `grey` rather than fail the import |
| `collapsed` | boolean | No | Collapsed state at export |

## 7. Unknown fields

A reader MUST ignore any field it does not recognise, at every level of the document, rather than reject the file.

A reader that rewrites a file, for example on migration or re export of an imported pack, MUST preserve unrecognised fields on the object where they were found. This is what allows a future TabsPack version, or a third party tool, to add a field without a round trip through TabsPack destroying it.

The two rules together mean: never act on what you do not understand, never delete it either.

### Table S6: Where a reader is deliberately more forgiving than the schema

The schema describes what a writer must emit. A reader survives more than that, because a file a person can hand edit is a stated goal of this format. Each of these is reported to the user rather than applied silently.

| Case | Schema | Reader |
|---|---|---|
| Unknown group colour | Rejected | Falls back to `grey` |
| `index` absent, duplicated or not a whole number | Rejected when not an integer | Falls back to the order of the array |
| `exportedAt` absent | Rejected | Accepted, and the time of import is used |
| `counts` disagreeing with the arrays | Accepted | Accepted, arrays win, mismatch reported |
| `groupId` naming a group that is not declared | Accepted | Reference dropped, tab kept, reported |
| More than one tab marked `active` in a window | Accepted | The first wins, per section 5 |
| `openerIndex` naming a tab that is not in the window | Accepted | Reference dropped, tab kept |

Two rewrite behaviours follow from section 7 and are worth stating plainly. A reader keeps the text of `exportedAt` and `lastAccessed` exactly as it found it, rather than reformatting the same instant into its own timezone. And the `group` title shorthand in section 5 is resolved into a real group object on rewrite, which is the one case where a rewritten file is deliberately not byte identical to its input.

## 8. URLs that cannot be restored

Browsers refuse to let an extension create tabs at most privileged schemes, including `chrome://`, `edge://`, `about:` other than `about:blank`, `moz-extension://`, `chrome-extension://` for other extensions, `view-source:`, `javascript:` and `data:`. Local `file://` URLs require an explicit browser level permission that the user grants outside the extension.

Such URLs MUST still be written to the file verbatim, because the file is a record. On restore, a conforming implementation MUST NOT drop them silently. It MUST surface them and count them in the import report.

One address that looks unrestorable usually is not. A tab suspender parks a tab on a page of its own, `chrome-extension://<id>/suspended.html#…&uri=https://…`, keeping the real address in the query or the fragment. A conforming writer SHOULD record the address the tab stands for rather than the suspender's wrapper, and a reader SHOULD recover it from a file that holds one. The reference implementation does both, by the shape of the wrapper and never by extension id, and reports how many it recovered: ADR-023.

The TabsPack reference implementation opens one placeholder page listing them as **inert, selectable text, never as links**. A `javascript:` or `data:` address must never be one click away from running, and the others would not open from a link anyway. This is the one lossy edge of the format and it is deliberately visible.

## 9. Versioning and migration

`schemaVersion` is an integer that increments on any change that an older reader could misinterpret. Adding an optional field is not such a change, because of the ignore rule in section 7, so most additions do not bump the version. Renaming a field, changing a type, or changing the meaning of an existing field does bump it.

Every bump ships with a migration function from the previous version and a fixture pair proving the migration, per [TESTING.md](TESTING.md).

A reader MUST refuse a `schemaVersion` greater than it supports, naming the version it found and the version it supports. It MUST NOT attempt a best effort parse of a future version.

## 10. Recognised foreign formats

These are not the TabsPack format. They are inputs the reference implementation normalises into it. Detection is by document shape, never by file extension.

### Table S5: Import adapters

| Source | Detection | Fidelity achievable |
|---|---|---|
| Tab Session Manager JSON | Array of objects, or one object, with `windows` as an id keyed object plus `windowsInfo` or `tabsNumber` | High. Windows, geometry, order, pinned, active, groups. A file holding several saved sessions imports the first and says so |
| Session Buddy JSON | Object with a `sessions` array whose entries hold `windows` with `tabs` | High. Windows, order, pinned. Groups where present |
| CSV, including Session Buddy's | Header row with a column whose name contains url, address, link, href or location | Low. URLs and titles, plus a window column when the file has one |
| OneTab export text | Lines of `url` then a vertical bar then `title`, blank line separated groups | Medium. URLs, titles, group boundaries as windows |
| Plain URL list | Lines that are mostly addresses, `#` comments ignored. A line that is not an address is read as the title of the address below it | Low. URLs, and titles in the paired form |
| Markdown link list | Lines matching `[title](url)`, headings become windows | Low. URLs, titles, window boundaries |
| Netscape HTML bookmarks | `<!DOCTYPE NETSCAPE-Bookmark-file-1>` | Low. URLs, titles, folders become windows |
| Flat JSON array | Array of strings, or of objects carrying a url field | Low. URLs, titles where present |

An adapter MUST NOT invent fidelity. If a source has no window information, the import produces one window and says so in the preview.

Detection is by document shape only, and the order runs from the most specific shape to the most general, because a Tab Session Manager export is also a JSON array and a OneTab export is also a list of lines. A JSON object that no adapter recognises is validated as a TabsPack file instead, so the reader's answer is "this file declares no format" rather than "unrecognised", which is the more useful of the two.

Every adapter's output goes through the same validation and the same reader as a file that arrived as a TabsPack document. An adapter cannot produce a pack that the format's own rules would reject.

## 11. Conformance

An implementation is a conforming **reader** if it accepts every file in `test/fixtures/valid/`, rejects every file in `test/fixtures/invalid/` with an actionable message, and obeys sections 7, 8 and 9.

An implementation is a conforming **writer** if every file it produces is accepted by a conforming reader and round trips without loss of any field defined in sections 3 to 6.
