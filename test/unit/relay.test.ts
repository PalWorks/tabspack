/**
 * T-715. The one network request TabsPack can make.
 *
 * Two things are being protected here, and they are different. The first is
 * the promise: exactly four fields leave, they are the message the user read,
 * and nothing is added on the way out. The second is the fallback: every way
 * this can fail has to end in an outcome the interface can act on, because the
 * mail client route is what catches all of them and a message must never be
 * lost to a bad connection. ADR-039.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELAY_ENDPOINT,
  RELAY_ORIGIN,
  RELAY_PERMISSION,
  relayBody,
  sendViaRelay,
  type RelayPayload,
} from "../../src/core/relay.js";

const payload: RelayPayload = {
  subject: "TabsPack 0.0.3: Something is broken",
  body: "The preview did not appear after I chose a file.\n",
  replyTo: "  someone@example.com  ",
};

/** A fetch that records what it was given and answers with a status. */
function stub(status: number) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ ok: status < 400 }), { status });
  };
  return { fetch, seen };
}

test("exactly four fields leave, and the honeypot is one of them", () => {
  const body = relayBody(payload);
  assert.deepEqual(Object.keys(body).sort(), ["body", "replyTo", "subject", "website"]);
  assert.equal(body.website, "");
  assert.equal(body.subject, payload.subject);
  assert.equal(body.body, payload.body);
});

test("the reply address is trimmed, because a mail header with spaces is not one", () => {
  assert.equal(relayBody(payload).replyTo, "someone@example.com");
  assert.equal(relayBody({ ...payload, replyTo: "" }).replyTo, "");
});

test("the endpoint is on the origin the manifest asks permission for", () => {
  assert.ok(RELAY_ENDPOINT.startsWith(`${RELAY_ORIGIN}/`));
  assert.equal(RELAY_PERMISSION, `${RELAY_ORIGIN}/*`);
  assert.ok(RELAY_ORIGIN.startsWith("https://"), "a support message never travels in the clear");
});

test("the request is a preflighted JSON POST that carries no identity", async () => {
  const { fetch, seen } = stub(200);
  await sendViaRelay(payload, { fetch });

  assert.equal(seen.length, 1);
  const call = seen[0];
  assert.ok(call);
  assert.equal(call.url, RELAY_ENDPOINT);
  assert.equal(call.init.method, "POST");
  // JSON rather than a form body is what forces a preflight, which is what
  // keeps a drive-by form on some other page from reaching the endpoint.
  assert.equal((call.init.headers as Record<string, string>)["content-type"], "application/json");
  assert.equal(call.init.credentials, "omit");
  assert.equal(call.init.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(String(call.init.body)), relayBody(payload));
});

test("nothing about the tabs can reach the wire, because nothing about them is in scope", () => {
  const wire = JSON.stringify(relayBody(payload));
  for (const leak of ["http://", "tab", "window", "favicon", "snapshot"]) {
    if (leak === "tab") continue; // the word appears in the product's own name
    assert.ok(!wire.toLowerCase().includes(leak), `${leak} must not be in the payload`);
  }
});

test("200 is sent", async () => {
  assert.equal(await sendViaRelay(payload, { fetch: stub(200).fetch }), "sent");
});

test("a cap or an unconfigured worker is busy, which is temporary and says so", async () => {
  assert.equal(await sendViaRelay(payload, { fetch: stub(429).fetch }), "busy");
  assert.equal(await sendViaRelay(payload, { fetch: stub(503).fetch }), "busy");
});

test("anything else it answers is a refusal", async () => {
  assert.equal(await sendViaRelay(payload, { fetch: stub(400).fetch }), "refused");
  assert.equal(await sendViaRelay(payload, { fetch: stub(502).fetch }), "refused");
});

test("offline, blocked or DNS gone is unreachable, never a throw", async () => {
  const fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.equal(await sendViaRelay(payload, { fetch }), "unreachable");
});

test("a relay that never answers is unreachable, and does not hold the button forever", async () => {
  const started = Date.now();
  const fetch = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  assert.equal(await sendViaRelay(payload, { fetch, timeoutMs: 30 }), "unreachable");
  assert.ok(Date.now() - started < 2_000, "the timeout has to fire, not the test runner");
});
