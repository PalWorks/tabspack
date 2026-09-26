# Support relay, not deployed and not wired in

The extension does not use this. It hands a support message to the user's own
mail client, so it makes no network request and the privacy policy stays true
as written.

This exists because the obvious shortcut is dangerous and somebody will suggest
it: putting the Resend API key in the extension. A key in a published extension
is a public key. Anyone can unzip the package, read it, and send mail as
`@palworks.ai` until the domain's sending reputation is gone. No amount of
obfuscation changes that, because the code has to be able to read it at runtime
and so can a person. See ADR-035.

If in-app sending is wanted later, deploy this and the key stays on a server.

## Deploy

```
cd server/support-worker
npx wrangler secret put RESEND_API_KEY     # paste the key, it is never in git
npx wrangler deploy
```

## Then, and only then, change the product to match

Switching this on makes TabsPack a thing that talks to a server. Four places
say it does not:

| File | What has to change |
|---|---|
| `scripts/lint.mjs` | the `no-network` rule, which currently fails the build on any `fetch` in `src/` |
| `PRIVACY.md` | "no network request of any kind" stops being true |
| `docs/store/listing.md` and `docs/store/submission.md` | both answers about network use, on all three stores |
| `docs/DECISIONS.md` | a record superseding ADR-005 and ADR-035, saying why the trade was worth it |

The extension side is then a `fetch` in `src/ui/manager/support-panel.ts`
posting `{subject, body, replyTo}` to the deployed URL.

## What it sends

Exactly the body the user read on screen, to one fixed address, from one fixed
address. `reply_to` is set only when the user typed an address that has the
shape of one. Nothing about their tabs is in the payload, and the composer in
`src/core/support.ts` has a test that proves it.
