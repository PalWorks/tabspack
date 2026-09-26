/**
 * A relay for the TabsPack support form. Not shipped, and not wired in.
 *
 * The extension hands its support message to the user's own mail client, so it
 * makes no network request at all and `PRIVACY.md` stays true as written. This
 * is here for the day that is not enough, because the alternative people reach
 * for first is putting the Resend key in the extension, and that key would be
 * readable by anyone who downloads the package. Sending mail as
 * `@palworks.ai` would then be available to whoever wanted it. There is no
 * obfuscation that fixes it: a key in a client is a public key. ADR-035.
 *
 * Deploying this changes what the product is, so it also changes:
 *
 *   `scripts/lint.mjs`   the rule that forbids `fetch` anywhere in the source
 *   `PRIVACY.md`         "no network request of any kind" stops being true
 *   `docs/store/*`       both answers about network use
 *   `docs/DECISIONS.md`  a record superseding ADR-005 and ADR-035
 *
 * Deploy:
 *
 *   cd server/support-worker
 *   npx wrangler secret put RESEND_API_KEY
 *   npx wrangler deploy
 */

const FROM = "TabsPack.support@palworks.ai";
const TO = "support@palworks.ai";

/** No message is a real support message, and none is this large. */
const MAX_BODY = 8_000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "not JSON" }, 400);
    }

    const subject = String(payload?.subject ?? "").slice(0, 200);
    const body = String(payload?.body ?? "");
    const replyTo = String(payload?.replyTo ?? "").trim();

    if (body.trim().length < 10) return json({ error: "empty message" }, 400);
    if (body.length > MAX_BODY) return json({ error: "too long" }, 413);

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: subject === "" ? "TabsPack support" : subject,
        text: body,
        // Only when the user gave one, and only in the header a reply uses.
        ...(replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo) ? { reply_to: [replyTo] } : {}),
      }),
    });

    if (!sent.ok) return json({ error: "upstream refused" }, 502);
    return json({ ok: true }, 200);
  },
};

function preflight() {
  return new Response(null, { status: 204, headers: cors() });
}

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

/*
 * An extension page's origin is its own id, which differs per install and per
 * browser, so there is no origin list to allow. The endpoint therefore has to
 * be safe to call from anywhere: it sends to one fixed address, from one fixed
 * address, with a size cap, and it carries nothing an attacker would want.
 * Rate limiting belongs in front of it, at the Cloudflare rule level.
 */
function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}
