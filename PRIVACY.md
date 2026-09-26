# Privacy Policy

**Version 1.1, dated 2026-09-26. Applies to the TabsPack browser extension for Chrome, Edge and Firefox.**

This document is both the plain answer and the policy the browser stores require.

## The short version

TabsPack makes **one** network request, and only if you ask it to: pressing Send in the Support pane sends the message you wrote and read, to us. Your browser asks your permission the first time, and saying no is fine.

Everything else stays on your computer. Your tabs are never sent anywhere. Nothing you do in TabsPack leaves the machine unless you export a file and send that file somewhere yourself.

There is no account, no sign in, no sync, no analytics, no telemetry, no crash reporting, no advertising, no tracking of any kind. Nothing is collected in the background, sold, shared or disclosed.

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
| `https://support.palworks.ai/*`, optional | Requested the first time you press Send in the Support pane, and only then. It is the address that receives the message |

TabsPack asks for **no** host permission when you install it, so out of the box it cannot reach any address at all. The one it can ever be granted is `support.palworks.ai`, it is granted by you at the moment you press Send, and you can take it back at any time in your browser's extension settings. TabsPack still cannot read or modify the content of any web page, ever.

## Children

TabsPack collects no data from anyone, of any age.

## The support form

TabsPack has a Support pane. It is the one place where anything you write is
meant to reach us, and the only place TabsPack uses the internet, so it is
worth being exact about how.

There are two ways to send, and you choose:

**Send** delivers the message to us directly. The first time, your browser asks
whether TabsPack may connect to `support.palworks.ai`. If you agree, the
message is posted there and forwarded to our inbox. Nothing else goes with it:
no identifier, no account, no cookie, no counter, no record of you having used
the extension. We receive the message you wrote, and the address you typed if
you typed one.

**Use my email app** composes the same message and hands it to your own mail
client instead. TabsPack sends nothing and makes no request. This is also where
Send falls back to if you decline the permission, if you are offline, or if
anything else goes wrong, and if no mail app opens the message goes to your
clipboard and the page says so. A message is never lost to a failure.

What travels is what is on the screen and nothing else. If you leave the "include
which browser I am using" box ticked, five lines go with it, and they are shown
to you in full before you send: the TabsPack version, your browser and operating
system, whether the tab groups permission is granted, and two settings. Untick
it and they are not included.

**No address, title or count of your tabs is ever in a support message.** That is
enforced by a test, not by a promise.

## Third parties

No analytics vendor, no advertising network, no tracker, no sub processor of
anything to do with your tabs. The extension contains no third party script,
font or remote resource: every byte a TabsPack page loads comes from the
package itself.

Two services carry a support message you choose to send, and only that:

| | What it handles | What it never sees |
|---|---|---|
| Cloudflare Workers | Receives the message at `support.palworks.ai` and passes it on. Stores nothing. Keeps no log of the message | Anything about your tabs, your settings or your browsing |
| Resend | Delivers that message to our inbox as email | The same |

If you use the mail client route instead, neither is involved and TabsPack makes
no request at all.

Two addresses appear in the interface as links you can choose to click: the
maker's site, `palworks.ai`, at the foot of About, and, once TabsPack is
published, its listing on your browser's store. Clicking one navigates your
browser there, exactly as any other link would. Nothing is loaded from either by
any TabsPack page.

## Changes to this policy

If a future version ever changes what data is handled, this document changes in the same release, the version and date at the top change, and the change is listed in [CHANGELOG.md](CHANGELOG.md). A change that introduces or widens any network transmission requires a new decision record in [docs/DECISIONS.md](docs/DECISIONS.md) and is stated plainly in the store listing rather than buried here. Version 1.1 of this policy is such a change: see ADR-039, which explains why the support form gained a direct Send and what was given up for it.

## Contact

Use the Support pane, or raise a question as a GitHub issue on this repository. For a security concern, follow [SECURITY.md](SECURITY.md) instead.
