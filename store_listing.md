# Store listing, TabsPack

**Everything that goes into a store dashboard, in the order the dashboard asks
for it.** Copy from here rather than writing it again in the form: the wording
below is the wording that has been checked against what the extension actually
does, and against [PRIVACY.md](PRIVACY.md), which the stores also read.

Version 1.0.0. Prepared 2026-09-26. Covers the Chrome Web Store, Microsoft Edge
Add-ons and addons.mozilla.org.

> **The support relay is live** at `tabspack-support.palworks.ai`, so every
> answer below about the network is describing something that actually runs.
>
> **In the Chrome Web Store dashboard right now?** Table S14, at the end, walks
> every field in the order the dashboard presents it, with the answer and where
> it comes from. The artwork is in Table S10.
>
> **After a store accepts it**, its listing URL goes into `LISTINGS` in
> `src/core/rating.ts` and into `NETWORK_ALLOWLIST` in `scripts/lint.mjs`, which
> is what turns the rating ask on. A listing URL cannot exist before the listing
> does, so this is the one step that has to come after. See Table S11.

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
| save tabs to a file | primary, high volume | Summary, first sentence |
| import tabs | primary, pairs with export | Summary, second sentence |
| cross browser tab export | differentiator, exact phrase | Name |
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

**This field is not typed into a dashboard. It is the manifest's `name`, which
every store reads as the listing title, and it comes from `extName` in
`_locales/en/messages.json`.** That is the fix this table needed: until
2026-09-26 the manifest said `TabsPack` and the title below existed only here,
so the store would have been given the bland one.

The Chrome Web Store allows 75 characters and shows roughly 45 before
truncating in search results. AMO's name field allows 50. Everything essential
must therefore survive the first 45, and the whole title must fit in 50.

| Field | Value | Length |
|---|---|---|
| **`extName`, shipped** | `TabsPack: Cross Browser Tab Export & Restore` | 44 |
| At the 45 character cut | Nothing is lost. The title is 44 | — |
| Against AMO's 50 | Fits, with 6 to spare | — |
| **`brandName`, shipped** | `TabsPack` | 8 |

**Why the title and the wordmark are two different strings.** A store title has
to win a search against people who have never heard of the product, so it
carries the words they type. A header inside the product is read by somebody who
already installed it, and a header reading the whole title would be absurd. So
`extName` is the title, used by the manifest `name`, and `brandName` is the
wordmark, used by the popup header, the manager header, the placeholder page and
the toolbar tooltip. One string changed for search cannot drag the other with it.

**Why a colon and not a dash.** A dash in a store title is rendered
inconsistently across the three dashboards and is sometimes normalised into
something else. A colon is not.

**Why these words.** `Cross Browser` is the differentiator and a phrase people
actually type. `Tab Export` is the highest volume exact phrase this product can
honestly claim. `Restore` is the word that separates it from every exporter that
hands you a list of links, which is the entire competitive set. `Import` is not
in the title because it is the fourth word of the summary, which stores also
index, and because the title has to stay under 45.

---

## Table S4: Short description, the 132 character summary

This is the single highest value field in the listing. It appears in search
results, in the store's category pages, in the browser's own extension
management page, and it is the sentence an answer engine quotes.

Like the name, this is **not typed into a dashboard**. It is `extDescription`
in `_locales/en/messages.json`, which becomes the manifest `description` and is
what each store pre-fills its summary with.

| | Text | Length |
|---|---|---|
| **`extDescription`, shipped** | `Save or export your tab session as one file. Import it in Chrome, Edge or Firefox and restore every window, pinned tab and group.` | 129 |
| Edge Add-ons, same field | identical | 129 |
| Firefox AMO summary, 250 allowed | `Save or export your tab session as one file. Import it in Chrome, Edge or Firefox and restore every window, tab order, pinned tab and group. Free, no account, no sync, no tracking, and your tabs never leave your device.` | 218 |

**Why it is built this way.** Two complete sentences, so a model can quote
either alone. Between the title and these 129 characters the listing states
every term somebody actually searches for: save, export, import, restore, tab,
session, window, pinned, group, cross browser, and all three browser names.
Each appears once, inside a sentence that would be there anyway, which is the
rule in Table S2.

It leads with **save or export** because "save tabs" and "export tabs" are the
two highest volume queries in this category and only one of them fits in the
title. **Import** is the fourth word of the second sentence rather than buried
at the end. It names all three browsers, which is what makes it match a cross
browser search. It contains no adjective that could be disputed.

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

Paste the block between the rules exactly. It is **3,938 characters** against a 16,000 limit,
counted by the script that wrote this section. Short is deliberate: a long listing
dilutes the phrases that matter, and the fields below the fold are read by almost nobody.

### How it is formatted, and why

The Chrome Web Store description is **plain text**. There is no bold, no heading
and no link; line breaks and Unicode are the only formatting there is. So:

| Rule | Why |
|---|---|
| One emoji per section heading, none inside sentences | In a field with no bold, an emoji is the only way a heading can stand out when somebody scrolls. Scattered through prose it reads as spam, and store search ignores emoji entirely |
| No emoji in the first two sentences | Those are the search snippet and the sentence an answer engine quotes. They stay plain and carry the keywords |
| No emoji in the name or the summary | Store policies discourage special characters there, and they add nothing to search |
| Single codepoint emoji only: 📦 🔁 💤 ⏳ 🔓 📥 🔒 📄 ⚡ 🎁 | A composite emoji such as ⌨️ or 🕰️ needs an invisible variation character and falls back to a plain text glyph on some systems |
| ✓ for capabilities, • for facts | Both render everywhere, and the difference tells a scanning eye which list is a promise and which is a property |
| Headings in capitals | The only emphasis plain text has, used once per section |
| Links as plain text, no emoji | They are not clickable in the listing either way, and the section above spent the emphasis budget |

The same text works unchanged for Edge Add-ons, which is also plain text, and for
AMO, which renders it as written.

---

Close your browser without losing your place.

TabsPack saves every tab you have open into one small file and puts them back exactly as they were: the same windows, the same order, the same pinned tabs, the same tab groups. In the same browser, or a different one.

If you keep ninety tabs open because each one is a note to your future self, this is what lets you close them.

📦 WHAT IT DOES

✓ Export all your open tabs to one .tabspack.json file, or just this window, or just the tabs you selected
✓ Restore the file in Chrome, Microsoft Edge or Firefox and get your session back, not a list of links
✓ Move a working session between browsers: Chrome to Firefox, Firefox to Edge, work laptop to home machine
✓ Keep named snapshots inside the extension for the days you do not want to think about files
✓ Export a plain list of addresses, flat JSON or CSV when another tool needs it

🔁 EVERYTHING COMES BACK, NOT JUST THE ADDRESSES

Most exporters hand you a list of links. A list of links is not a session.

TabsPack restores your windows with their size and position, every tab in its original order, which tabs were pinned, which tab was active in each window, and your tab groups with their names, colours and collapsed state.

💤 TWO HUNDRED TABS, AND YOUR COMPUTER DOES NOT NOTICE

Restored tabs open asleep. They sit in the tab strip with their title and address, and load nothing until you click one.

A restore of 200 real pages takes about nine seconds and leaves 199 of them unloaded. That was measured in a real browser, not estimated.

⏳ SEE WHICH TABS DIED MONTHS AGO

TabsPack groups your open tabs by when you last looked at them, and can leave anything untouched for a month, three months, six months or a year out of the export, so you can archive it and close it with a clear conscience.

It never guesses. A pinned tab is never called old, and a tab your browser gives no date for is counted separately and never dropped.

🔓 IT UNWRAPS SUSPENDED TABS

Tab suspender extensions park your tab on their own page and hide the real address inside it. No other browser can reopen that, and if the suspender ever leaves the store, the tab goes with it.

TabsPack reads the real address back out, on export and on import, and tells you how many it recovered.

📥 IT READS WHAT YOU ALREADY HAVE

Import from OneTab, Session Buddy (JSON and CSV), Tab Session Manager, browser bookmark files, Markdown link lists, flat JSON and plain lists of URLs. TabsPack works out what a file is by reading it, not by its name, and shows you what it found before a single tab opens.

🔒 YOUR TABS NEVER LEAVE YOUR DEVICE

This is not a policy. It is a property of the build.

• No host permission at install, so out of the box TabsPack cannot reach any website
• No account, no sync, no analytics, no telemetry, no advertising
• No content script, so it cannot read a page even if it wanted to
• An export holds addresses, titles and structure. Never cookies, passwords or form data

There is exactly one network request TabsPack can make, and you make it: pressing Send in the Support pane. Your browser asks your permission first, and if you decline, the message goes to your own email app instead.

📄 AN OPEN FORMAT, SO IT DOES NOT MATTER IF WE DISAPPEAR

A .tabspack.json file is ordinary JSON against a published schema. Open it in a text editor, compare two of them, keep one in a repository. The whole source is published under the MIT licence.

⚡ KEYBOARD SHORTCUTS

Alt+Shift+E exports every window. Alt+Shift+D exports the current one. Alt+Shift+S saves a snapshot. You can change all three in your browser.

🎁 FREE

No paid tier, no trial, no account, no advertising, no data collection.

Built and maintained by palworks.ai

Website: https://palworks.github.io/tabspack/
Source: https://github.com/PalWorks/tabspack
File format schema: https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json
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
| Single purpose | TabsPack saves the browser tabs a user has open and restores them later. It exports the open windows and tabs, with their order, pinned state and tab groups, to a file on the user's device or to a snapshot kept inside the browser, and reopens them from that file or snapshot, in the same browser or a different one. Every feature serves that one purpose: choosing which tabs go into an export, previewing a file before anything opens, and reading session files from other tab managers. |
| Personally identifiable information | Yes, only if the user types a reply email address into the optional field in the Support pane and presses Send. It is used to answer that message and for nothing else. Nothing is collected otherwise |
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

Every file is at the exact size the dashboard asks for, checked by opening each
one rather than trusting the file name. Regenerate them all with
`npm run store-art`, or only the compositions with `npm run store-art:compose`.

| Asset | Size | File | Store |
|---|---|---|---|
| Store icon | 128×128, transparent, the mark at 96 px inside 16 px of padding | `assets/store/store-icon-128.png` | Chrome |
| Screenshot 1 | 1280×800, 24-bit, no alpha | `assets/store/screenshot-1-export-in-one-click-1280x800.png` | Chrome, Edge |
| Screenshot 2 | 1280×800 | `assets/store/screenshot-2-everything-comes-back-1280x800.png` | Chrome, Edge |
| Screenshot 3 | 1280×800 | `assets/store/screenshot-3-any-browser-1280x800.png` | Chrome, Edge |
| Screenshot 4 | 1280×800 | `assets/store/screenshot-4-tabs-you-forgot-1280x800.png` | Chrome, Edge |
| Screenshot 5 | 1280×800 | `assets/store/screenshot-5-never-leaves-your-device-1280x800.png` | Chrome, Edge |
| Small promo tile | 440×280 | `assets/store/promo-small-440x280.png` | Chrome, Edge |
| Marquee promo tile | 1400×560 | `assets/store/promo-marquee-1400x560.png` | Chrome. Optional, and it is what a featured placement uses |
| Logo | 300×300 | `assets/store/logo-300x300.png` | Edge |
| Explainer animation | 16 seconds, HTML | `assets/promo/explainer.html` | None directly. It is on the site's home page, and it is the first half of the promo video |
| Promo video | 1920×1080, 60 fps, H.264, 30 seconds, no audio | `assets/promo/tabspack-promo-1080p.mp4`, from `npm run video`. Not committed: 9 MB, and it rebuilds exactly | Chrome, as a YouTube link. Upload it to YouTube first, then paste the link |
| YouTube thumbnail | 1280×720 | `assets/promo/youtube-thumbnail.png`, the end card | YouTube, not the store |

**Upload the screenshots in this order.** The first one is the thumbnail in
search results and most people never reach the third, so the order is the
argument, from the widest benefit to the narrowest.

| # | Headline on the image | What it shows, all real captures of the extension |
|---|---|---|
| 1 | Every tab, one file. | The popup over a crowded browser, "Export 30 tabs" |
| 2 | Everything comes back. | The import preview: windows, pinned tabs, and named, coloured groups |
| 3 | Take it to any browser. | The file, three browsers, and the restore's own report |
| 4 | Find the tabs you forgot. | The export pane with the age line ringed and the age filter on |
| 5 | Your tabs never leave this device. | The snapshots pane, with Free, Open source and No account |

**There is no caption field.** The Chrome Web Store shows screenshots without
text of their own, which is why each headline is part of the image.

**What in them is staged, said plainly.** The session is a demo one, from
`assets/promo/demo-session.mjs`, and the time each tab was last opened is staged
because no API can set it. Everything else is the shipped extension photographed
in a real browser. No capture run reaches the internet.

---

## Table S11: The three things to do after each store accepts it

These are easy to forget and each one is a silent failure if it is missed.

| # | Do this | Why |
|---|---|---|
| 1 | Put the listing URL into `LISTINGS` in `src/core/rating.ts` | Until a store's URL is there, `reviewUrl()` returns null and **the rating ask never appears**. That is deliberate: an ask that leads to a page that does not exist is worse than no ask |
| 2 | Add the same URL to `NETWORK_ALLOWLIST` in `scripts/lint.mjs` | The linter fails the build on any remote URL that is not on the list. This is the step that makes adding one a conscious act |
| 3 | Put all three URLs in `README.md` and on the website's home page | The install buttons currently point at GitHub releases, and the home page says the extension is not in the stores yet. Both need the real link the day it exists |

---

## Table S12: Per store notes

| Store | Note |
|---|---|
| **Chrome Web Store** | Upload `dist/artifacts/tabspack-1.0.0-chrome.zip`, written by `npm run pack` and audited: the manifest is at the archive root, which is the mistake that gets a hand-made zip rejected. The first review of a new extension is often a few days, and slower when a permission justification is thin, which is what Table S6 is for. |
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

---

## Table S14: The Chrome Web Store dashboard, field by field

Everything the dashboard asks for, in the order its tabs present it, with where
the answer is. **Title** and **Summary** are not typed in: they come from the
manifest inside the package, which is why the package is uploaded first.

The dashboard changes more often than this file. Where it asks for something not
listed here, that is a question to answer and record, not a sentence to improvise.

| Dashboard tab | Field | What to enter | Source |
|---|---|---|---|
| **Package** | Upload new package | `dist/artifacts/tabspack-1.0.0-chrome.zip` | `npm run pack` |
| **Store listing** | Title | Read from the manifest: `TabsPack: Cross Browser Tab Export & Restore` | Table S3 |
| | Summary | Read from the manifest, 129 characters | Table S4 |
| | Description | The block in "Detailed description", pasted exactly | Above |
| | Category | Workflow & Planning. Check it is still offered; the store has renamed categories before | Table S5 |
| | Language | English | Table S5 |
| | Store icon | `assets/store/store-icon-128.png` | Table S10 |
| | Global promo video | The YouTube link to `tabspack-promo-1080p.mp4`, uploaded as Public or Unlisted (a Private video will not play on the listing). Title and description in Table S15 | Table S10 |
| | Screenshots | The five, in the order in Table S10 | Table S10 |
| | Small promo tile | `assets/store/promo-small-440x280.png` | Table S10 |
| | Marquee promo tile | `assets/store/promo-marquee-1400x560.png` | Table S10 |
| | Official URL | Leave empty unless the site is verified in Google Search Console under your account. It is an unverified claim otherwise | Table S9 |
| | Homepage URL | `https://palworks.github.io/tabspack/` | Table S9 |
| | Support URL | `https://palworks.github.io/tabspack/contact/` | Table S9 |
| | Mature content | No | Table S9 |
| **Privacy practices** | Single purpose | The paragraph in Table S8, pasted exactly. It names one purpose and says why each feature belongs to it, which is what a reviewer checks | Table S8 |
| | Permission justification, one per permission | `tabs`, `storage`, `downloads`, the optional `tabGroups`, and the optional support host, word for word | Table S6 |
| | Are you using remote code? | No. Everything runs from the package, and the content security policy pins scripts to it | Table S8 |
| | Data usage | The answers in Table S8. The one that needs care: a support message the user chooses to send is "personal communications", and an optional reply address is "personally identifiable information". Both are sent only when the user presses Send, and only to answer them | Table S8 |
| | The three certifications | Tick all three: not sold, not used for anything unrelated to the single purpose, not used for creditworthiness or lending | Table S8 |
| | Privacy policy URL | `https://palworks.github.io/tabspack/privacy/` | Table S9 |
| **Distribution** | Visibility | Public. Choose Unlisted for a soft launch where only people with the link can install it | Table S9 |
| | Regions | All regions | Table S9 |
| | Pricing | Free. The store has no payments of its own any more | Table S9 |
| **Account** | Trader or non-trader declaration | Required for listings shown in the EU. A trader's contact details are shown publicly on the listing. Which one applies is a question about how palworks.ai operates, and it is yours to answer rather than mine | Not in this repository |
| | Verified contact email | Must be verified before the first submission is accepted | Your developer account |

## Table S15: The YouTube upload for the promo video

| Field | Value |
|---|---|
| File | `assets/promo/tabspack-promo-1080p.mp4` |
| Title | TabsPack: export your browser tabs and restore them in Chrome, Edge or Firefox |
| Description | TabsPack packs every open tab into one small file and puts them back exactly as they were: the same windows, the same order, pinned tabs and tab groups, in the same browser or a different one. Free, open source, no account, and your tabs never leave your device. Website: https://palworks.github.io/tabspack/ |
| Thumbnail | `assets/promo/youtube-thumbnail.png` |
| Visibility | Public or Unlisted. Not Private, which the listing cannot play |
| Audience | Not made for kids |
| Chapters | None. Thirty seconds does not need them |

What the video shows, in order: the explainer story up to the restored window
(13 seconds), the five store screenshots (12 seconds), and the end card, held.
It has no sound, which suits a listing that autoplays muted anyway.

**Before pressing Submit for review:** preview the listing from the dashboard and
read it once as a stranger would. The first screenshot and the summary are what
most people will ever see of it.
