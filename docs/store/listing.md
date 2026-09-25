# Listing text

Identical across Chrome Web Store, Edge Add-ons and AMO, apart from the length
limits each one enforces. Sentence case, no exclamation marks, no emoji, and no
claim the product cannot keep.

## Name

TabsPack

## Summary, 132 characters or fewer

Export, move and restore your tabs across browsers, in one open file you can read. No account, no sync, no telemetry.

## Category

Productivity. Chrome: Workflow and planning. AMO: Tabs.

## Description

**Your tabs, in a file you own.**

TabsPack exports the tabs you have open into one small, readable file, and puts
them back the way they were: the same windows, the same order, pinned tabs still
pinned, tab groups with their titles and colours. Move a session from Chrome to
Firefox, keep a copy before reinstalling, or send a colleague everything you used
in today's meeting.

**What it does**

- Export all windows, this window or the tabs you have selected, as a `.tabspack.json`
  file, a plain list of addresses, or straight to the clipboard.
- Import a pack back, preview every window, group and tab first, choose what to
  restore, and restore without the browser grinding to a halt.
- Read other tools' exports: Tab Session Manager, Session Buddy, OneTab, your
  browser's own bookmarks, Markdown link lists, CSV and plain lists of addresses.
  Recognised by what is in the file, not by its name.
- Keep named snapshots inside the extension for the days you do not want to think
  about where a file goes.
- Keyboard shortcuts for exporting and for saving a snapshot.

**What it does not do**

No account. No sync. No telemetry. No network request of any kind, which the
project's own build check enforces rather than promises. Nothing that could
identify you or sign you in ever goes into a file: a pack holds addresses,
titles and structure, never cookies, tokens or form data.

**An open format**

The file is JSON a person can read and edit, and its specification and JSON
Schema are published with the source. Anything that can read the specification
can read your session, including other tools, which is the point: a session you
cannot take out of a tool is a session that tool owns.

## What is new, for an update listing

See CHANGELOG.md in the repository. Every release entry names what changed, what
was measured and what remains unverified.

## Support and privacy

- Source, issue tracker and specification: the repository linked from this listing.
- Privacy policy: `PRIVACY.md` in the repository, linked in all three listings.
- Security reports: `SECURITY.md`, privately, never as a public issue.
