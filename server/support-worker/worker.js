/**
 * The TabsPack support relay.
 *
 * The extension used to hand every support message to the user's own mail
 * client and make no network request at all. That was the safe default and it
 * is still the fallback, but it assumes a configured mail client, and a large
 * share of people do not have one: for them the Send button opened nothing and
 * the message went nowhere. ADR-039.
 *
 * This worker exists so the extension can send without shipping a key. The
 * Resend key lives here, as a Cloudflare secret, and never enters the package.
 * A key inside a published extension is a public key: anyone can unzip it, read
 * it, and send mail as `@palworks.ai` until the domain is burned. That has not
 * changed and is why this indirection is worth its cost.
 *
 * What the endpoint has to survive, since it is open to the whole internet:
 *
 *   An extension page's origin is its own extension id, which differs per
 *   install, per browser and per profile, so there is no origin list to allow
 *   and no referer worth trusting. The endpoint is therefore built to be safe
 *   when called by anybody. It sends to **one fixed address** from **one fixed
 *   address**, carries no attacker-chosen headers, and is capped three ways:
 *   per IP per minute, per IP per day, and globally per day. The global cap is
 *   the one that matters, because it bounds the damage a determined abuser can
 *   do to the sending reputation and to the bill, and past it the extension
 *   falls back to the mail client with no data lost.
 *
 * Deploy: see README.md in this directory.
 */

/** The only path that does anything. `src/core/relay.ts` posts to exactly this. */
const ENDPOINT_PATH = "/v1/support";

/** Fixed. Never taken from the request: a caller cannot choose who this is from. */
const FROM = "TabsPack Support <TabsPack.support@palworks.ai>";
/** Fixed. Never taken from the request: a caller cannot use this to send mail to a third party. */
const TO = "support@palworks.ai";

/** No real support message is this large, and a cap bounds what a body can cost. */
const MAX_BODY = 8_000;
const MAX_SUBJECT = 200;
const MAX_REPLY_TO = 254;
/** The shortest thing that can be a report. Matches `isSendable` in the extension. */
const MIN_BODY = 10;

/**
 * Per IP, per UTC day. Generous on purpose: an office, a university or a phone
 * network is one address to us, and a cap that punishes a shared connection
 * would silently cost real bug reports. The global cap below is the one that
 * does the protecting.
 */
const PER_IP_PER_DAY = 50;
/** Everyone, everywhere, in a UTC day. Past this the extension uses the mail client. */
const GLOBAL_PER_DAY = 500;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return refuse(405, "method");
    // One path, so the root stays free for something a person can read and a
    // scanner walking the host finds nothing else to talk to.
    if (new URL(request.url).pathname !== ENDPOINT_PATH) return refuse(404, "no such endpoint");

    /*
     * A browser will send a cross-origin POST from an ordinary HTML form with
     * no preflight, but only as a form content type. Requiring JSON means any
     * call has been preflighted, which puts this endpoint behind the same
     * check as the extension's own request and removes drive-by form spam.
     */
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/json")) return refuse(415, "content-type");

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY * 2) return refuse(413, "too long");

    let payload;
    try {
      payload = await request.json();
    } catch {
      return refuse(400, "not JSON");
    }

    /*
     * A field no interface shows and no person fills in. A bot that posts every
     * key it finds fills it, and says so about itself.
     */
    if (String(payload?.website ?? "") !== "") return accepted();

    const body = clamp(String(payload?.body ?? ""), MAX_BODY);
    if (body.trim().length < MIN_BODY) return refuse(400, "empty");

    const subject = header(clamp(String(payload?.subject ?? ""), MAX_SUBJECT)) || "TabsPack support";
    const replyToRaw = header(clamp(String(payload?.replyTo ?? "").trim(), MAX_REPLY_TO));
    const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToRaw) ? replyToRaw : "";

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    /*
     * Three caps, checked cheapest first. Each is optional at runtime: a worker
     * deployed without the rate limit binding or without KV still works and
     * still sends, it is simply less defended. Failing open here is deliberate,
     * because a KV hiccup must not swallow a bug report.
     */
    if (await burstExceeded(env, ip)) return refuse(429, "slow down");
    const caps = await dailyExceeded(env, ip);
    if (caps !== null) return refuse(429, caps);

    if (!env.RESEND_API_KEY) return refuse(503, "not configured");

    let sent;
    try {
      sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [TO],
          subject,
          // Text only. Nothing a sender writes is ever interpreted as markup.
          text: body,
          ...(replyTo === "" ? {} : { reply_to: [replyTo] }),
        }),
      });
    } catch {
      return refuse(502, "upstream unreachable");
    }

    if (!sent.ok) return refuse(sent.status === 429 ? 429 : 502, "upstream refused");

    // Counted only once it actually went, so a failing upstream cannot use up
    // somebody's daily allowance. Outside the response path: the user waits for
    // the mail, not for the bookkeeping.
    ctx.waitUntil(countSent(env, ip));
    return accepted();
  },
};

/* Caps ------------------------------------------------------------------- */

/**
 * The burst limit, from Cloudflare's own rate limiting binding, configured in
 * `wrangler.toml`. Per colo rather than global, which is the right shape for
 * this: it stops one machine hammering one data centre.
 *
 * It is also **approximate**. Measured against the deployed worker with the
 * limit set to 1, three requests got through before the fourth was refused,
 * because the counter is eventually consistent. It is a brake on a flood, not
 * a quota. The daily counters below are the real ceiling, and they are checked
 * after this one precisely because this one cannot be trusted to be exact.
 */
async function burstExceeded(env, ip) {
  if (!env.BURST?.limit) return false;
  try {
    const { success } = await env.BURST.limit({ key: ip });
    return !success;
  } catch {
    return false;
  }
}

/** The two daily counters, in KV. Absent KV means no daily cap, not a failure. */
async function dailyExceeded(env, ip) {
  if (!env.COUNTERS) return null;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const [mine, all] = await Promise.all([
      env.COUNTERS.get(`ip:${day}:${ip}`),
      env.COUNTERS.get(`all:${day}`),
    ]);
    if (Number(mine ?? 0) >= PER_IP_PER_DAY) return "daily limit";
    if (Number(all ?? 0) >= GLOBAL_PER_DAY) return "busy";
    return null;
  } catch {
    return null;
  }
}

/**
 * Read, add one, write. Two sends in the same second can lose a count, which is
 * acceptable: these are a safety valve on a support inbox, not an audit log,
 * and a Durable Object for exactness would cost more than the thing it guards.
 */
async function countSent(env, ip) {
  if (!env.COUNTERS) return;
  const day = new Date().toISOString().slice(0, 10);
  // Two days, so a counter written just before midnight UTC still expires.
  const expirationTtl = 60 * 60 * 48;
  try {
    for (const key of [`ip:${day}:${ip}`, `all:${day}`]) {
      const now = Number((await env.COUNTERS.get(key)) ?? 0);
      await env.COUNTERS.put(key, String(now + 1), { expirationTtl });
    }
  } catch {
    // A counter that did not increment is not a reason to fail a sent message.
  }
}

/* Plumbing --------------------------------------------------------------- */

function clamp(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * A carriage return or newline in a value that becomes a mail header is how
 * header injection works. Resend takes JSON and escapes its own headers, so
 * this is a second line rather than the only one, which is how it should be.
 */
function header(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function accepted() {
  return json({ ok: true }, 200);
}

/**
 * One shape for every refusal, with a short reason and nothing else. The
 * extension shows its own sentence and falls back to the mail client, so there
 * is nothing here worth tuning an attack against.
 */
function refuse(status, reason) {
  return json({ ok: false, reason }, status);
}

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...cors(),
    },
  });
}

function preflight() {
  return new Response(null, { status: 204, headers: cors() });
}

/*
 * `*`, because an extension page's origin is its own id and there is no list to
 * write. Nothing here is protected by the origin: there is no session, no
 * cookie and nothing to read back, so a permissive CORS header grants an
 * attacker exactly what a curl command would have given them anyway.
 */
function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}
