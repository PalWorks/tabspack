# Privacy Policy

**Version 1.0, dated 2026-09-24. Applies to the TabsPack browser extension for Chrome, Edge and Firefox.**

This document is both the plain answer and the policy the browser stores require.

## The short version

TabsPack makes no network request. Nothing you do in it leaves your computer unless you export a file and send that file somewhere yourself.

There is no account, no sign in, no sync, no analytics, no telemetry, no crash reporting, no advertising, no tracking of any kind. No data is collected, transmitted, sold, shared or disclosed, because none of it ever leaves the browser.

## What the extension reads

To do its job, TabsPack reads the tabs you are viewing:

| Data | Why | Where it goes |
|---|---|---|
| Tab URL and title | They are the content of an export | Into a file you choose to save, or a snapshot in your browser's local extension storage |
| Tab position, pinned, active, muted and discarded state | To restore your session as it was | Same |
| Window position, size and state | To restore your layout | Same |
| Tab group title, colour and collapsed state | To restore your groups | Same |
| Favicon URL, optional and off by default for embedded icons | Shown in the preview | Same. Imported favicon URLs are never fetched |
| Your settings and snapshots | To remember your preferences and saved sessions | Your browser's local extension storage, on this machine only |

## What the extension never reads or stores

Cookies. Session tokens. Passwords. Authorization headers. Form contents. Page contents. Local storage or IndexedDB belonging to a website. Browsing history beyond the tabs currently open. Your identity in any form.

An exported file cannot be used to log in as you, anywhere. That is a deliberate property of the format, written into the specification as a requirement, not a side effect of the current implementation.

## Storage and retention

Settings and snapshots live in your browser's local extension storage on the machine where you created them. They are not synced across your devices. They stay until you delete them, remove the extension, or clear your browser data. Exported files are ordinary files on your disk, entirely under your control.

Uninstalling the extension removes its local storage. Files you have exported are not touched.

## Incognito and private windows

Private windows are excluded from exports by default. TabsPack cannot see them at all unless you explicitly allow the extension in incognito or private mode in your browser's own settings, and you also enable the option inside TabsPack.

## Permissions, and why each one exists

| Permission | Why it is needed |
|---|---|
| `tabs` | To read the URL and title of your open tabs. The extension cannot work without it |
| `storage` | To save your settings and your named snapshots on this machine |
| `downloads` | To write the export file you asked for |
| `tabGroups`, optional | Requested the first time you use a feature involving tab groups, and only then |
| `offscreen`, optional | Requested only to copy text to your clipboard |

There are no host permissions, so the extension cannot read or modify the content of any web page.

## Children

TabsPack collects no data from anyone, of any age.

## Third parties

There are none. No service provider, no processor, no sub processor, no analytics vendor. The extension contains no third party script, font or remote resource.

## Changes to this policy

If a future version ever changes what data is handled, this document changes in the same release, the version and date at the top change, and the change is listed in [CHANGELOG.md](CHANGELOG.md). A change that introduced any network transmission would require a new decision record in [docs/DECISIONS.md](docs/DECISIONS.md) superseding ADR-005, and it would be stated plainly in the store listing rather than buried here.

## Contact

Raise a question as a GitHub issue on this repository. For a security concern, follow [SECURITY.md](SECURITY.md) instead.
