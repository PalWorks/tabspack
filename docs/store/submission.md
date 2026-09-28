# Submission answers

What each store asks at upload time, with the answer already decided. Task T-505.

## Table T1: Permission justifications

Word for word from [PLAN.md](../../PLAN.md) Table P8. A reviewer who asks about a
permission gets this, not an improvisation.

| Permission | Required | Justification |
|---|---|---|
| `tabs` | Yes | Read the address and title of the tabs you have open, which is the whole function of the extension: exporting them. It is never used to read page content, and no content script is injected anywhere |
| `storage` | Yes | Keep your settings and the snapshots you save, in this browser profile only |
| `downloads` | Yes | Write the export file you asked for, with a sensible name, without a save dialog every time |
| `tabGroups` | Optional, requested from a button in the interface | Restore a tab group's title, colour and collapsed state. Refusing it still restores the tabs, and the extension says so |
| Host permissions | **None required** | The extension never reads or changes the content of a page. At install it holds no host access at all |
| `https://tabspack-support.palworks.ai/*` | Optional, requested from the Send button in the Support pane | The address that receives a support message the user has written and read. It is the only host the extension can ever reach, it is requested at the moment of use rather than at install, and declining it is handled: the same message goes to the user's own mail client instead |

**If a reviewer asks about the support form.** The user writes a message and
sees it in full. Send posts exactly four fields to `https://tabspack-support.palworks.ai/v1/support`
(subject, body, an optional reply address, and an always-empty honeypot field)
and that message is forwarded to one fixed inbox. No identifier, no cookie, no
account, no analytics and nothing about the user's tabs is in the payload, which
two unit tests assert. The browser's own optional-permission prompt gates the
request, so no user can be connected to anything without agreeing first.

**If a reviewer asks how the no-network claim is enforced.** `scripts/lint.mjs`
fails the build on `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` or
`importScripts` anywhere in `src/`, with a single exception: `fetch` in
`src/core/relay.ts`, which is the eighty lines that make the support request and
nothing else. Every other transport is banned even there. No remote script,
font, stylesheet or image exists anywhere in the package, and the content
security policy pins `script-src` to `'self'`.

## Table T2: Privacy answers

| Question | Answer |
|---|---|
| Does it collect personally identifiable information? | Yes, only if the user types a reply email address into the optional field in the Support pane and presses Send. It is used to answer that message and for nothing else. Nothing is collected otherwise |
| Health information? | No |
| Financial or payment information? | No |
| Authentication information? | No. A pack never contains cookies, tokens, headers or form values, by design and by specification |
| Personal communications? | Only what a user chooses to write in the Support pane and press Send on, which is a message addressed to us. It is used to answer them and nothing else, it is not stored by the relay that carries it, and it is never combined with anything else |
| Location? | No |
| Web history? | The extension reads the tabs you have open **only when you ask it to export**, and writes them to a file on your own machine. No tab, address, title or count is ever transmitted anywhere |
| User activity? | No |
| Website content? | No. No content script, no page access |
| Is data sold or transferred to third parties? | Never sold, never transferred for anyone else's purposes. A support message the user sends is carried by Cloudflare Workers and delivered by Resend, acting only to get it to our inbox |
| Is data used for anything other than the single purpose? | No |
| Is data used to determine creditworthiness or for lending? | No |
| Remote code | None. Everything runs from the package, and the content security policy pins scripts to the package itself |

## Chrome Web Store

- Single purpose: the paragraph in `store_listing.md` Table S8, pasted exactly.
- Upload the contents of `dist/chrome`, zipped, not the folder itself.
- Assets: the 128 px store icon, five 1280 by 800 screenshots, the 440 by 280
  small promo tile and the 1400 by 560 marquee. All in `assets/store/`, made by
  `npm run store-art`. The upload order and what each shows are in
  `store_listing.md` Table S10. They were recaptured from 1.1.0 on 2026-09-28,
  so screenshot 5 shows the snapshot tools: upload them with 1.1.0, not before.

## Edge Add-ons

- The same package as Chrome.
- Assets: the 300 by 300 logo, at least one 1280 by 800 screenshot.
- Note in the submission that the extension requests no host permission at
  install and makes no network request unless the user presses Send in the
  Support pane, which is gated by the browser's own permission prompt.

## Firefox, AMO

- `npm run pack` writes every archive to `dist/artifacts/`, including the `.xpi` and the source zip. Upload those rather than zipping a folder by hand.
- AMO requires the source when the submitted code is generated by a build step,
  which this is: submit the repository archive with `README.md`, `package.json`
  and the build instruction `npm ci && npm run build`, and name node 20 or later.
- The extension id is in `manifest.firefox.json` under `browser_specific_settings`.
- **The source archive rebuilds byte identical.** Checked 2026-09-28 for 1.1.0: `tabspack-1.1.0-source.zip` unpacked into an empty directory, `npm ci && npm run build`, and `diff -r` against `dist/firefox` and `dist/chrome` found no difference. The archive is made from committed files, so pack only after committing: an uncommitted file is missing from it, which is how the first attempt failed.
- `npm run lint:amo` runs AMO's own linter over `dist/firefox`. It must report **zero errors**. It reports about forty warnings and two notices, all of them the same thing: `strict_min_version` is 115 while `tabs.group`, `tabGroups.query`, `tabGroups.update` and `permissions.request` arrived in Firefox 139. That is deliberate. Every one of those calls sits behind a capability probe, so on Firefox 115 to 138 the extension installs and works with everything except tab group titles and colours, which it says it cannot do. Raising the minimum to 139 to silence the warnings would lock out those versions for a feature they were never going to have. Since 1.1.0 four more warnings say the same about `data_collection_permissions`, which Firefox 140 introduced and older versions ignore.
- **Data collection, 1.1.0.** AMO requires new extensions to declare what they collect, in `browser_specific_settings.gecko.data_collection_permissions` ([Mozilla's guide](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), read 2026-09-28). TabsPack requires nothing, `"required": ["none"]`. It lists as optional what a support message can carry:
  - `personalCommunications`, the message itself
  - `personallyIdentifyingInfo`, a reply address, only if one is typed
  - `technicalAndInteraction`, the browser name and version, only if the box is ticked

  Firefox asks for them in the same prompt as the relay's address, at the moment Send is pressed. Local storage is not collection under Mozilla's definition, so snapshots, automatic snapshots and the recovery copy need no declaration. ADR-048

## Installing a build in Firefox before it is signed

The route that looks obvious does not work, and the error does not say why.
`about:addons` → gear → **Install Add-on From File** refuses anything Mozilla
has not signed, with **"This add-on could not be installed because it appears to
be corrupt"**. The file is fine. Release Firefox simply will not run an unsigned
extension, and it does not say so: ADR-034.

Two routes work.

| Route | How | Lasts |
|---|---|---|
| **Temporary add-on**, the normal one for testing | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `dist/firefox/manifest.json` | Until Firefox closes |
| **Developer Edition or Nightly** | `about:config` → set `xpinstall.signatures.required` to `false`, then install `dist/artifacts/tabspack-<version>-firefox.xpi` from `about:addons` | Permanently, in that build only |

Release Firefox will install the `.xpi` permanently only once AMO has signed it.
AMO signs unlisted submissions too, so a signed private build can be had before
the listing is public.

## Before any submission

1. The milestone exit test in [ROADMAP.md](../ROADMAP.md) passes.
2. The cross browser matrix in [TESTING.md](../TESTING.md) Table X2 is green, by hand.
3. `npm run verify` and `npm run smoke` are green.
4. The version in `package.json` and both manifests match, and CHANGELOG.md has
   a heading for it.

## Where the release stands, updated 2026-09-28

Everything that can be prepared without a person is prepared. What is left needs
an account, a fee or a decision, and none of those is something an agent may do
on somebody's behalf.

### Table T5: The pre-submission gate, checked

| Gate | State |
|---|---|
| Milestone exit test | M8 passed 2026-09-26, recorded in ROADMAP.md Table R13. For 1.1.0, M9's rows in Table R14 are done, and B-502 was published to npm on 2026-09-28 |
| Cross browser matrix | Chrome 27/27, Edge 27/27, Firefox 26 of 28 with 2 skipped, nothing failed, run 2026-09-26 for 1.0.0. For 1.1.0, re-run 2026-09-28 headed with the flags: **Chrome 30/30, Edge 30/30, Firefox 26 of 28 with 2 skipped, nothing failed**, the three new recovery rows included. Adding `alarms` adds no Chrome update warning, measured with Chromium's own warning API. The two skips and the four rows in Table R10 are in [MANUAL-CHECKS.md](../MANUAL-CHECKS.md) and are **not yet done** |
| `npm run verify` | Green for 1.1.0 on 2026-09-28, including 309 unit tests, 0 addons-linter errors and the npm package test |
| `npm run smoke` | Green, 129 checks, on 2026-09-28 |
| Version | `1.1.0` in `package.json` and both manifests, with a CHANGELOG heading. 1.0.0 is live on Chrome; 1.1.0 is uploaded there as a draft |
| Packages | Built, in `dist/artifacts/`, and audited: manifest at the archive root, no source map, no `.env`, no 32 character account id, no credential shape anywhere in the source archive |

### Table T6: What is actually blocking each store

| Store | Credential | Blocking |
|---|---|---|
| **Chrome Web Store** | On this machine, and verified: an OAuth client, a publisher id, and a refresh token that exchanges for an access token carrying the `chromewebstore` scope. Checked 2026-09-26, read only | Nothing. 1.0.0, item `bgomldlmhkecjeceibdphdkoencnghjm`, was rejected once for keyword spam (other products named in the description), fixed, resubmitted 2026-09-26, and is **live**, confirmed through the API on 2026-09-28: [chromewebstore.google.com/detail/tabspack-cross-browser-ta/bgomldlmhkecjeceibdphdkoencnghjm](https://chromewebstore.google.com/detail/tabspack-cross-browser-ta/bgomldlmhkecjeceibdphdkoencnghjm). **1.1.0 was uploaded through the API on 2026-09-28** (`uploadState: SUCCESS`) and waits as a draft for the dashboard steps below |
| **Edge Add-ons** | None on this machine | An account has to be created |
| **AMO** | None on this machine | An account has to be created |
| **npm**, for the `tabspack` package | Published 2026-09-28, [npmjs.com/package/tabspack](https://www.npmjs.com/package/tabspack). The `palworks` npm account, company owned, on this machine's npm CLI through `npmu palworks` | npm refuses a publish without two factor authentication. `npm publish --access public` from `packages/tabspack` prints a browser link to approve with two factor; `--otp` is not used. Fallback: a granular token with bypass two factor, seven day expiry, revoked after the publish |

### The 1.1.0 update, uploaded 2026-09-28

The package is in the dashboard as a draft. Uploading does not submit it. Before
pressing **Submit for review**, in this order:

1. **Privacy practices**: add the justification for `alarms`, and for the
   optional `sessions`, from `store_listing.md` Table S6. A new permission with
   no justification is a rejection waiting to happen.
2. **Privacy practices**: replace the "Web history" answer with the one in
   Table S8, which now says the recovery copy is on from install.
3. **Store listing**: paste the description box from `store_listing.md` again
   (it gained the crash and recent sessions paragraph), and replace
   screenshots 1, 4 and 5 with the files in `assets/store/`.
4. **Submit for review.** Existing users keep 1.0.0 until it is approved, and
   adding `alarms` shows them no warning (TESTING.md, measured 2026-09-28).

The upload call, for the next version: the same as below, but a `PUT` to
`/upload/chromewebstore/v1.1/items/bgomldlmhkecjeceibdphdkoencnghjm`.

### The first Chrome upload, as it was done for 1.0.0

A new item, so it is a `POST` to the items endpoint rather than a `PUT` to one.
Nothing here publishes: the upload creates a draft, and publishing is a second,
separate call or a button in the dashboard.

```
ACCESS=$(curl -s https://oauth2.googleapis.com/token \
  -d client_id=... -d client_secret=... \
  -d refresh_token=... -d grant_type=refresh_token | jq -r .access_token)

curl -s -X POST -H "Authorization: Bearer $ACCESS" \
  -H "x-goog-api-version: 2" \
  -T dist/artifacts/tabspack-1.0.0-chrome.zip \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items"
```

The credentials are in `~/.secrets` and are read at the moment of use. None of
them is in this repository and none of them should ever be.

The listing text to paste into the dashboard is [`store_listing.md`](../../store_listing.md),
which carries the name, the summary, the description, a justification for every
permission, the privacy answers and the artwork list, in the order the dashboard
asks for them.

### After a store accepts it

Table S11 of `store_listing.md` has the three things, and the one that changes
behaviour is this: the listing URL goes into `LISTINGS` in `src/core/rating.ts`
and into `NETWORK_ALLOWLIST` in `scripts/lint.mjs`. Until then `anyListingKnown()`
is false and no rating ask is ever shown, which is correct: an ask with nowhere
to go is worse than no ask.
