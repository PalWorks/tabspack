# The TabsPack support relay

**Deployed and live.** `https://tabspack-support.palworks.ai/v1/support`, on the
Cloudflare account pinned in `wrangler.toml`, sending through Resend with a
send-only key scoped to the `palworks.ai` domain. Verified end to end on
2026-09-26: the shipped extension, in a real browser, reached it and the message
arrived in the inbox.

The Send button in TabsPack's Support pane posts to this worker, and this
worker sends the mail. The point of the indirection is the key: Resend's API
key lives here as a Cloudflare secret and never enters the extension package.

A key inside a published extension is a public key. Anyone can unzip it, read
it, and send mail as `@palworks.ai` until the domain is burned. No amount of
obfuscation changes that, because the code has to read it at runtime and so can
a person. See ADR-035 and ADR-039.

The extension keeps its mail client route as the fallback for every case this
worker cannot serve: permission declined, offline, rate limited, deployed
nowhere. A support message is never lost to a failure here.

## What it is made of

| | |
|---|---|
| Worker | `tabspack-support`, on the account pinned in `wrangler.toml` |
| Hostname | `tabspack-support.palworks.ai`, a Cloudflare custom domain created by `wrangler deploy` |
| Secret | `RESEND_API_KEY`, a Resend **sending_access** key scoped to the `palworks.ai` domain alone. It cannot read logs, list contacts or mint other keys |
| KV | `tabspack-support-counters`, id in `wrangler.toml`. Its own namespace rather than the shared `palworks-resend-quota`, whose key scheme belongs to another product |
| Rate limit | Cloudflare's own binding, roughly five a minute per IP |

The key is dedicated to TabsPack, not shared with the other palworks products.
If it ever has to be revoked, nothing else stops working.

**Not `support.palworks.ai`.** That looks like the obvious name and is already
a live worker belonging to another product on the same domain. Deploying over
it would have taken that product down. A hostname whose domain you own is not
a hostname that is free: make one request to it before you deploy.

## Redeploying

```
npm run relay:deploy          # from the repository root
npm run relay:check           # the same thing, --dry-run
```

**Not `wrangler deploy` directly.** The committed `wrangler.toml` has
placeholders where the Cloudflare account id and the KV namespace id would be.
Neither is a credential and Cloudflare treats both as safe to commit, but this
repository is public and there is no reason to publish which account anything
runs on. They live in `server/support-worker/.env`, which is not committed;
`scripts/deploy-relay.mjs` renders them in, deploys, and deletes the rendered
file whether or not the deploy worked. `scripts/lint.mjs` fails the build if a
real id ever appears in the committed config.

Copy `.env.example` to `.env` on a fresh checkout. The secret and the KV
namespace already exist on the account and survive every deploy.

### Rotating the key

```
resend api-keys create --name TabsPack-Support-Form \
  --permission sending_access --domain-id <the palworks.ai domain id>
npx wrangler secret put RESEND_API_KEY        # paste the new one
resend api-keys delete <the old id>           # only after a live check passes
```

### Check it after deploying

```
curl -i https://tabspack-support.palworks.ai/v1/support \
  -H 'content-type: application/json' \
  -d '{"subject":"deploy check","body":"Ignore this, it is a deploy check.","replyTo":""}'
```

`{"ok":true}` and a mail in the inbox. Anything else, the reason is in the body
and the detail is in `npx wrangler tail`.

**A 200 alone is not proof, and the client does not accept one.** It requires
this worker's own `{"ok":true}` body, because the first hostname chosen for
this relay was already live, serving a different product, and answering with
HTML. Check the body, never the status.

## If the address changes

`tabspack-support.palworks.ai` is written in four places and `npm run lint` fails the
build if they disagree, which is deliberate: a Send button pointing at a host
nobody deployed fails silently and nothing else would catch it.

| Where | What |
|---|---|
| `src/core/relay.ts` | `RELAY_ORIGIN`, the one the others are checked against |
| `manifest.chrome.json` | `optional_host_permissions` |
| `manifest.firefox.json` | `optional_host_permissions` |
| `wrangler.toml` | the route pattern |

## What it accepts

`POST /v1/support`, `application/json`, four fields and no others:

| Field | |
|---|---|
| `subject` | clamped to 200 characters, newlines stripped |
| `body` | 10 to 8000 characters, sent as text and never as markup |
| `replyTo` | used only if it has the shape of an address, newlines stripped |
| `website` | a honeypot. Always empty from the extension. Filled means a bot, and the worker answers as though it sent |

`from` and `to` are constants in the source. A caller cannot choose either, so
this endpoint cannot be used to send mail to anybody but us.

## What defends it

The extension's origin is its own extension id, which differs per install, per
browser and per profile, so there is no origin list to allow and no referer
worth trusting. The endpoint is built to be safe when called by anyone.

| Layer | |
|---|---|
| One method, one path | anything else is 405 or 404 |
| JSON only | forces a preflight, so an HTML form on another site cannot reach it |
| Size caps | on the declared length, the body, the subject and the reply address |
| Honeypot | a filled `website` is answered `ok` and dropped |
| Burst, per IP | roughly 5 a minute, from Cloudflare's rate limit binding. **Approximate**: measured with the limit set to 1, three got through before the fourth was refused, because the counter is eventually consistent. It is a brake on a flood, not a quota |
| Daily, per IP | 50, in KV. High on purpose: an office is one address |
| Daily, global | 500, in KV. This is the one that bounds the damage |
| Header hygiene | CR and LF stripped from every value that becomes a header |
| No state | no cookie, no session, nothing to read back, so permissive CORS grants an attacker exactly what curl already would |

Past the global cap the worker answers 429 and the extension quietly uses the
mail client instead, so the failure mode of an attack is a slower support
channel, not a lost message and not a bill.

Every cap is optional at runtime. A worker deployed without the rate limit
binding or without KV still sends; it is simply less defended. Failing open is
deliberate: a KV hiccup must not swallow a bug report.

## What it does not do

It does not log the message, store it, or forward it anywhere but the one
inbox. It has no database. Nothing about anybody's tabs can reach it, because
nothing about them is in the payload, which `test/unit/relay.test.ts` and
`test/unit/support.test.ts` both check.
