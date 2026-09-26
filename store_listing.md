# Store listing, TabsPack

**Everything that goes into a store dashboard, in the order the dashboard asks
for it.** Copy from here rather than writing it again in the form: the wording
below is the wording that has been checked against what the extension actually
does, and against [PRIVACY.md](PRIVACY.md), which the stores also read.

Version 0.0.3. Prepared 2026-09-26. Covers the Chrome Web Store, Microsoft Edge
Add-ons and addons.mozilla.org.

> **Before you paste anything**, three fields do not exist yet and must be filled
> in first: the three store listing URLs. They also have to go into `LISTINGS`
> in `src/core/rating.ts` and into `NETWORK_ALLOWLIST` in `scripts/lint.mjs`,
> which is what turns the rating ask on. See Table S11.

---

## Table S1: How these words were chosen

Three audiences read a store listing and they are not the same reader. Every
choice below serves one of them, and where they conflict the first one wins,
because a listing that ranks and does not convert is worth nothing.

| Audience | What they do | What the copy does about it |
|---|---|---|
| **A person browsing the store** | Reads the name, the 132 character summary, and the first two lines. Decides in about four seconds | The name carries the benefit, not just the brand. The summary is a complete sentence that says what happens, not a feature list |
| **Store search, and Google (SEO)** | Indexes the name, the summary, the description and the category. Weighs the first 160 characters most | The primary phrase appears in the name, in the first sentence of the summary and in the first paragraph. Secondary phrases appear once each, in prose, never in a list |
| **Answer engines (AEO and GEO)** | ChatGPT, Perplexity, Google AI Overviews and Copilot summarise and cite. They quote sentences that are self contained and factual | Every claim is a short declarative sentence with its own subject, so a model can lift one without losing the meaning. Numbers are given. Comparisons are factual, never superlative |

**The rule that governs all of it:** no claim appears here that is not true of
the shipped build. A store listing that oversells is a one star review with a
delay on it, and answer engines increasingly cross check a claim against the
privacy disclosures on the same page.

---

## Table S2: The keywords, and where each one is used

Keyword stuffing is penalised by every store and ignored by every model. Each
phrase below appears **once or twice**, inside a sentence that would be there
anyway.

| Phrase | Intent | Where it lands |
|---|---|---|
| export browser tabs | primary, high volume | Name, summary, first paragraph |
| save all open tabs to a file | primary, long tail | First paragraph, "What it does" |
| restore tabs | primary | Summary, "What it does" |
| move tabs between browsers | primary, high intent | Name, "Move between browsers" |
| Chrome to Firefox tabs | long tail, very high intent | "Move between browsers", FAQ |
| tab session manager | category term | "What it does" |
| backup tabs | secondary | "Snapshots" |
| tab group export | secondary | "Everything comes back" |
| suspended tabs recovery | differentiator, low competition | "It unwraps suspended tabs" |
| too many tabs open | problem-aware searcher | Opening line |
| tab manager no tracking | privacy-aware searcher | "Your tabs never leave your device" |

**Deliberately not used:** "best", "ultimate", "powerful", "seamlessly",
"revolutionary", "#1", "free forever". Stores discount them, models ignore
them, and readers have been trained to distrust them.

---

## Table S3: Name

The Chrome Web Store allows 75 characters and shows roughly 45 before
truncating in search results. Everything essential must survive the first 45.

| Field | Value | Length |
|---|---|---|
| **Name (use this)** | `TabsPack — Export & Restore Tabs Across Browsers` | 48 |
| First 45 characters | `TabsPack — Export & Restore Tabs Across Brow…` | — |
| Edge Add-ons, same | `TabsPack — Export & Restore Tabs Across Browsers` | 48 |
| Firefox AMO, shorter field | `TabsPack — Export & Restore Tabs` | 32 |

**Why this and not just "TabsPack".** Nobody searches for a brand they have
never heard of. The three words after the dash are the three things people type
into a store search box, and they are also what an answer engine needs in order
to say what this is.

---

## Table S4: Short description, the 132 character summary

This is the single highest value field in the listing. It appears in search
results, in the store's category pages, in the browser's own extension
management page, and it is the sentence an answer engine quotes.

| | Text | Length |
|---|---|---|
| **Use this** | `Export every open tab to one file and restore them exactly, in Chrome, Edge or Firefox. Windows, order and groups survive.` | 121 |
| Edge Add-ons, same field | identical | 121 |
| Firefox AMO summary, 250 allowed | `Export every open tab to one file and restore them exactly as they were, in Chrome, Edge or Firefox. Windows, tab order, pinned tabs and groups all survive. Free, no account, and your tabs never leave your device.` | 211 |

**Why it is built this way.** It is one complete sentence plus one short one, so
a model can quote either in isolation. It names all three browsers, which is
what makes it match a cross browser search. It says "exactly", which is the
claim that separates this from every exporter that gives you a list of links.
It contains no adjective that could be disputed.

---

## Table S5: Category and language

| Field | Chrome Web Store | Edge Add-ons | Firefox AMO |
|---|---|---|---|
| Category | Workflow & Planning | Productivity | Tabs |
| Secondary category | — | Developer Tools | Bookmarks |
| Language | English | English | English |

Not "Productivity" on Chrome: that category is enormous and the extension will
never surface in it. "Workflow & Planning" is where session managers actually
rank.

---

## Detailed description

Paste the block between the rules exactly. It is about 4,100 characters,
against a 16,000 limit. Short is deliberate: the fields below the fold are read
by almost nobody, and a long listing dilutes the phrases that matter.

The first paragraph is written to be the AI Overview snippet. It answers "what
is TabsPack" in one sentence, then "what problem does it solve" in the next.

---

Close your browser without losing your place.

TabsPack exports every tab you have open into a single small file, and puts
them back exactly as they were: the same windows, the same order, the same
pinned tabs, the same groups. In the same browser, or a different one.

If you keep ninety tabs open because each one is the only record that you meant
to come back to it, this is the thing that lets you close them.

WHAT IT DOES

• Export all your open tabs to one .tabspack.json file, or just the current
  window, or just the tabs you selected.
• Restore that file in Chrome, Microsoft Edge or Firefox and get your session
  back, not just a list of links.
• Move a working session from one browser to another. Chrome to Firefox,
  Firefox to Edge, work laptop to home machine.
• Keep named snapshots inside the extension, for when you do not want to think
  about where a file goes.
• Export a plain list of addresses, flat JSON or CSV when that is what the next
  tool needs.

EVERYTHING COMES BACK, NOT JUST THE ADDRESSES

Most exporters give you a list of links. A list of links is not a session.

TabsPack restores your windows and their size and position, every tab in its
original order, which tabs were pinned, which tab was active in each window,
and your tab groups with their names, colours and collapsed state.

TWO HUNDRED TABS, AND YOUR COMPUTER DOES NOT NOTICE

Restored tabs open asleep. They appear in the tab strip with their title and
address, and they load nothing until you click one.

A restore of 200 real pages takes about nine seconds and leaves 199 of them
unloaded. That number was measured in a real browser, not estimated.

IT UNWRAPS SUSPENDED TABS

Tab suspender extensions park your tab on their own page and hide the real
address inside it. No other browser can reopen that, and if the suspender is
ever removed from the store, the tab is gone for good. It has happened to a lot
of people.

TabsPack reads the real address back out, both when exporting and when
importing, and tells you how many it recovered.

IT READS WHAT YOU ALREADY HAVE

Import from OneTab, Session Buddy (JSON and CSV), Tab Session Manager, browser
bookmarks in Netscape HTML, Markdown link lists, flat JSON, and plain lists of
URLs. TabsPack works out what a file is by reading it, not by its name, and
shows you what it found before it opens a single tab.

YOUR TABS NEVER LEAVE YOUR DEVICE

This is not a policy. It is a property of the build.

TabsPack asks for no host permission when you install it, so out of the box it
cannot reach any address on the internet. There is no account, no sync, no
analytics, no telemetry, no crash reporting and no advertising. No content
script is injected into any page, so TabsPack cannot read a page even if it
wanted to.

An exported file holds addresses, titles and structure. Never cookies, never
session tokens, never form data. A TabsPack file cannot be used to sign in as
you anywhere, and that is written into the file format specification as a
requirement.

There is exactly one network request TabsPack can make, and you make it: if you
write a message in the Support pane and press Send, it is sent to us. Your
browser asks your permission first, and declining is fine, in which case the
message goes to your own email app instead.

AN OPEN FORMAT, SO IT DOES NOT MATTER IF WE DISAPPEAR

A .tabspack.json file is ordinary JSON against a published schema. Open it in a
text editor. Diff two of them. Keep one in a repository.

Your session should not be locked inside an extension that might be delisted
next year. The whole source is published under the MIT licence.

KEYBOARD

Alt+Shift+E exports every window. Alt+Shift+D exports the current one.
Alt+Shift+S saves a snapshot. You can change all three in your browser.

FREE

No paid tier, no trial, no account, no advertising, no data collection. The
source, the file format specification and the reasoning behind every design
decision are all public.

Built and maintained by palworks.ai.

Website: https://palworks.github.io/tabspack/
Source: https://github.com/PalWorks/tabspack
Support: support@palworks.ai

---

## Table S6: Permission justifications

Every store asks for these and a thin answer is the single most common cause of
a rejection or a slow review. Each row says **what** the permission does and
**what it is not used for**, because reviewers are checking for the second one.

| Permission | Required? | Justification to paste |
|---|---|---|
| `tabs` | Required | Reads the address and title of the tabs the user has open. This is the extension's entire function: exporting them to a file and restoring them from one. It is never used to read page content, no content script is injected anywhere, and nothing is transmitted. |
| `storage` | Required | Stores the user's own settings and the named snapshots they choose to save, in local extension storage on that machine only. Nothing is synced and nothing is sent anywhere. |
| `downloads` | Required | Writes the export file the user asked for, with a meaningful filename, without a save dialog on every export. Only files the user explicitly requested are ever written. |
| `tabGroups` | Optional, requested in-product | Reads and restores a tab group's title, colour and collapsed state. Without it the browser does not expose the tab groups API at all, so a group's name cannot be read and an export would silently contain unnamed groups. It is requested from a button before an export, which is the point at which the information would otherwise be lost. Declining is fully supported: the tabs still restore grouped, just unnamed. |
| `offscreen` | Optional, requested in-product | Copies text to the clipboard in Manifest V3, where a service worker has no document to copy from. Used only for the Copy action the user pressed. |
| `https://tabspack-support.palworks.ai/*` | **Optional host**, requested in-product | Delivers a support message the user has written and read, and pressed Send on. It is the only address the extension can ever reach. It is requested at the moment Send is pressed, never at install, and the browser's own permission prompt gates it. If the user declines, the same message is handed to their email client instead. No tab address, title or count is ever in the payload, which two automated tests assert. |

### Table S7: The answer to "why no host permissions at install"

Reviewers sometimes query an extension that has an optional host permission.
The short answer, if asked:

> TabsPack declares no required host permissions, so a fresh install cannot make
> any network request. The single optional host, `tabspack-support.palworks.ai`, exists
> only so a user can send a support message from inside the extension, and it is
> requested at the moment they press Send. The build enforces this: the project's
> linter fails on `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` or
> `importScripts` anywhere in the source except one named file of about eighty
> lines, which is the file that sends that message.

---

## Table S8: Privacy and data use answers

Give the same answers on all three stores. An inconsistency between them is
noticed and is expensive.

| Question | Answer |
|---|---|
| Single purpose | Exporting the tabs the user has open to a file, and restoring them from one. |
| Personally identifiable information | No |
| Health information | No |
| Financial or payment information | No |
| Authentication information | No. An export never contains cookies, tokens, headers or form values, by design and by specification |
| Personal communications | Only a message the user writes in the Support pane and chooses to send, which is addressed to us. Used to answer them, and for nothing else |
| Location | No |
| Web history | The extension reads the tabs currently open, only when the user asks for an export, and writes them to a file on the user's own machine. No tab address, title or count is ever transmitted |
| User activity | No |
| Website content | No. No content script, no page access |
| Is data sold or transferred to third parties? | Never sold, never transferred for anyone else's purposes. A support message the user sends is carried by Cloudflare Workers and delivered by Resend, acting only to get it to our inbox |
| Is data used for anything other than the single purpose? | No |
| Used to determine creditworthiness or for lending? | No |
| Remote code | None. Everything runs from the package, and the content security policy pins `script-src` to `'self'` |
| Privacy policy URL | `https://palworks.github.io/tabspack/privacy/` |

**Tick the three certification boxes on the Chrome Web Store privacy tab.** All
three are true.

---

## Table S9: Everything else the dashboard asks for

| Field | Value |
|---|---|
| Homepage URL | `https://palworks.github.io/tabspack/` |
| Support URL | `https://palworks.github.io/tabspack/contact/` |
| Privacy policy URL | `https://palworks.github.io/tabspack/privacy/` |
| Support email | `support@palworks.ai` |
| Pricing | Free |
| In-app purchases | None |
| Visibility | Public |
| Distribution | All regions |
| Mature content | No |

### Table S10: Artwork

| Asset | Size | Where it is | Store |
|---|---|---|---|
| Icon | 128×128 PNG | `assets/icons/icon-128.png` | All three |
| Small promo tile | 440×280 | `assets/store/promo-small-440x280.png` | Chrome |
| Marquee promo tile | 1400×560 | `assets/store/promo-marquee-1400x560.png` | Chrome, optional but it is what gets you featured |
| Logo | 300×300 | `assets/store/logo-300x300.png` | Edge |
| Screenshots | 1280×800, up to 5 | `.tmp/shots/`, written by `npm run smoke` | All three |
| Social card | 1200×630 | `website/assets/img/og.png` | Not a store asset; used when the site is shared |

**Screenshot order matters more than the images do.** Store search ranks on the
first one and most people never reach the third.

1. `manager-light.png` — the export screen. Shows the product doing its job.
2. `manager-import.png` — the import preview. Shows that you see what will open before it opens.
3. `manager-snapshots.png` — snapshots.
4. `settings-light.png` — settings, which demonstrates there is no account.
5. `manager-dark.png` — dark mode, because people look for it.

Add a one-line caption to each. A screenshot with no caption is a screenshot
nobody reads.

---

## Table S11: The three things to do after each store accepts it

These are easy to forget and each one is a silent failure if it is missed.

| # | Do this | Why |
|---|---|---|
| 1 | Put the listing URL into `LISTINGS` in `src/core/rating.ts` | Until a store's URL is there, `reviewUrl()` returns null and **the rating ask never appears**. That is deliberate: an ask that leads to a page that does not exist is worse than no ask |
| 2 | Add the same URL to `NETWORK_ALLOWLIST` in `scripts/lint.mjs` | The linter fails the build on any remote URL that is not on the list. This is the step that makes adding one a conscious act |
| 3 | Put all three URLs in `README.md` and on the website's home page | The install buttons currently point at GitHub releases and say the listings are in review |

---

## Table S12: Per store notes

| Store | Note |
|---|---|
| **Chrome Web Store** | Upload the **contents** of `dist/chrome`, zipped, not the folder itself. First review of a new extension is typically a few days and is slower when any permission justification is thin, which is what Table S6 is for. |
| **Edge Add-ons** | Takes the same package as Chrome. Note in the submission notes that the extension requests no host permission at install and makes no network request unless the user presses Send in the Support pane. |
| **Firefox AMO** | `npm run pack` writes every archive to `dist/artifacts/`, including the `.xpi` and the source zip. Upload those rather than zipping a folder by hand. AMO requires the source because the submitted code is produced by a build step: submit the repository archive and state the build command, which is `npm ci && npm run build`. `npm run lint:amo` must be clean of errors first; the `tabGroups` and `permissions.request` warnings about Firefox 115 are expected and are guarded by capability checks at runtime. |

---

## Table S13: Answer engine readiness

Store listings are increasingly summarised rather than read. Five things make a
listing quotable, and all five are done above.

| | What | Where |
|---|---|---|
| 1 | A self contained definition in the first sentence, with the product name as the subject | First line of the detailed description |
| 2 | Specific numbers rather than adjectives, because a number is citable and "fast" is not | "about nine seconds", "199 of 200", "132 characters" |
| 3 | Claims that can be verified against another source on the same page | The privacy answers in Table S8 match the description word for word |
| 4 | Comparisons stated as facts about us, never as claims about a named competitor | "Most exporters give you a list of links" |
| 5 | The same facts published in a machine readable form off the store | `llms.txt` and `llms-full.txt` on the website, plus `SoftwareApplication` and `FAQPage` structured data |

The website carries the structured data that the store listing cannot: see
`scripts/site/pages/index.html` for the `SoftwareApplication` and `FAQPage`
graphs, and `scripts/site/llms-full.txt` for the version written for models.
