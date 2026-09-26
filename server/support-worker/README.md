# The TabsPack support relay

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

## Deploy

```
cd server/support-worker

# 1. Pick the account. `wrangler whoami` lists them.
export CLOUDFLARE_ACCOUNT_ID=...

# 2. The key. It is typed in, never written to a file and never committed.
npx wrangler secret put RESEND_API_KEY

# 3. Optional but recommended: the daily caps need a KV namespace.
npx wrangler kv namespace create tabspack-support-counters
#    paste the id into wrangler.toml and uncomment the kv_namespaces block

npx wrangler deploy
```

Before it will send, two things have to be true at Resend: `palworks.ai` is a
verified sending domain, and `support@palworks.ai` receives mail.

`support.palworks.ai` has to resolve to the worker. `wrangler deploy` creates
the custom domain record when the zone is on the same Cloudflare account; if
the zone lives elsewhere, add a CNAME to the workers.dev hostname instead.

### Check it after deploying

```
curl -i https://support.palworks.ai/v1/support \
  -H 'content-type: application/json' \
  -d '{"subject":"deploy check","body":"Ignore this, it is a deploy check.","replyTo":""}'
```

`{"ok":true}` and a mail in the inbox. Anything else, the reason is in the body
and the detail is in `npx wrangler tail`.

## If the address changes

`support.palworks.ai` is written in four places and `npm run lint` fails the
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
| Burst, per IP | 5 a minute, from Cloudflare's rate limit binding |
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
