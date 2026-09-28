> **The submission copy now lives in [`store_listing.md`](../../store_listing.md) at the repository root.**
> That file is what to paste into a store dashboard: the name, the 132 character summary, the detailed
> description, a justification for every permission, the privacy answers, the artwork list and the three
> things to do after each store accepts it. This file is kept for the longer prose it holds about the
> product, which the listing draws on.

# Listing text

Identical across Chrome Web Store, Edge Add-ons and AMO, apart from the length
limits each one enforces. Sentence case, no exclamation marks, and no claim the product cannot keep.
Emoji are used in one place only, one per section heading of the store
description, for the reasons in `store_listing.md` under "How it is formatted,
and why".

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
- Get your tabs back after a crash. TabsPack keeps one copy of your open tabs
  and your last five sessions on this machine and, if the browser starts
  without them, shows you what is missing before anything opens. Automatic snapshots run
  on an interval, skip the times nothing changed and keep the newest ten.
- Open the export files of other popular tab managers, your browser's saved
  bookmarks and simple lists of links. Recognised by what is in the file, not
  by its name.
- Bring back tabs a suspender had parked. Tab suspender extensions replace a
  tab's address with one of their own pages, which no other browser can reopen. TabsPack reads the real
  address back out, on export and on import, and tells you how many it found.
- Restore without the memory. Tabs come back unloaded, so a pack of two hundred
  costs nothing until you open one.
- See which tabs died months ago. The export pane groups your open tabs by when
  you last looked at them, and can leave anything untouched for a month or a
  year out of the export, so you can archive it and close it. A pinned tab is
  never called old, and a tab your browser gives no date for is counted apart
  and never dropped.
- Keep named snapshots inside the extension for the days you do not want to think
  about where a file goes.
- Keyboard shortcuts for exporting and for saving a snapshot.

**What it does not do**

No account. No sync. No telemetry. No advertising. Your tabs are never sent
anywhere, which the project's own build check enforces rather than promises.
Nothing that could identify you or sign you in ever goes into a file: a pack
holds addresses, titles and structure, never cookies, tokens or form data.

TabsPack asks for no host permission at install, so out of the box it cannot
reach any address on the internet. There is exactly one exception and you are
the one who triggers it: pressing Send in the Support pane sends the message
you wrote, after your browser has asked whether TabsPack may connect. Decline
and the same message goes to your own email app instead. Nothing about your
tabs is in it either way.

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
