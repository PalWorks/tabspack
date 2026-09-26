/**
 * Sending a support message from inside TabsPack, task T-715.
 *
 * This is the one place in the whole extension that makes a network request,
 * and it is confined to this file so that the claim stays checkable: the
 * `no-network` rule in `scripts/lint.mjs` still fails the build on a `fetch`
 * anywhere else in `src/`.
 *
 * Why it exists. The first version handed every support message to the user's
 * own mail client and made no request at all. That is still the fallback and it
 * is still what happens if anything here goes wrong, but it assumes a mail
 * client is configured, and for a large share of people none is: the Send
 * button opened nothing and the report was lost. ADR-039.
 *
 * Why it is a relay rather than a direct send. Sending mail directly needs an
 * API key, and a key inside a published extension is a public key: anyone can
 * unzip the package, read it, and send mail as `@palworks.ai`. The key
 * therefore lives on a Cloudflare Worker, in `server/support-worker/`, and the
 * extension knows only an address. Nothing secret ships.
 *
 * Three things hold the promise together, and none of them is a good intention:
 *
 *   1. **The address is asked for, not assumed.** `RELAY_ORIGIN` is an optional
 *      host permission, so a default install has no host access at all and the
 *      browser asks the first time Send is pressed. Declining is a supported
 *      answer: the mail client route is still there.
 *   2. **What is sent is what is on screen.** The payload is the composed
 *      message from `core/support.ts` and nothing else. No identifier, no
 *      counter, no tab.
 *   3. **A failure loses nothing.** Every outcome other than `sent` is a signal
 *      to fall back, never a dead end.
 */

/**
 * Where the relay lives. This exact string appears in three other places, and
 * `scripts/lint.mjs` fails the build if they ever disagree: the
 * `optional_host_permissions` entry in both manifests, and the route in
 * `server/support-worker/wrangler.toml`. One address written four times is
 * three chances to ship a Send button that reaches nothing.
 */
export const RELAY_ORIGIN = "https://support.palworks.ai";

/** The match pattern the browser is asked to grant. */
export const RELAY_PERMISSION = `${RELAY_ORIGIN}/*`;

/** The only path the worker answers on. */
export const RELAY_ENDPOINT = `${RELAY_ORIGIN}/v1/support`;

/**
 * Long enough for a slow connection, short enough that a hung request does not
 * sit on a disabled Send button. A relay that has not answered in this time is
 * treated as unreachable and the mail client takes over, which is the right
 * answer either way: the user gets their message out.
 */
export const RELAY_TIMEOUT_MS = 15_000;

export interface RelayPayload {
  subject: string;
  body: string;
  /** Empty when the user did not give one. */
  replyTo: string;
}

/**
 * What happened, in terms the interface can act on rather than HTTP terms.
 *
 * Only `sent` means the message arrived. Everything else means fall back, and
 * they are kept apart only because `busy` deserves a different sentence: it is
 * us, not them, and it will work later.
 */
export type RelayOutcome = "sent" | "busy" | "refused" | "unreachable";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface RelayOptions {
  /** Injected by the tests. The extension uses the page's own `fetch`. */
  fetch?: Fetcher;
  timeoutMs?: number;
}

/**
 * The body of the request, split out so a test can assert on exactly what
 * leaves without having to intercept a request to do it.
 *
 * `website` is a honeypot: no interface shows it and no person fills it in, so
 * the worker treats a filled one as a bot. It is sent empty and always present,
 * because a field that appears only sometimes is a signal of its own.
 */
export function relayBody(payload: RelayPayload): Record<string, string> {
  return {
    subject: payload.subject,
    body: payload.body,
    replyTo: payload.replyTo.trim(),
    website: "",
  };
}

export async function sendViaRelay(payload: RelayPayload, options: RelayOptions = {}): Promise<RelayOutcome> {
  const send = options.fetch ?? (globalThis.fetch.bind(globalThis) as Fetcher);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? RELAY_TIMEOUT_MS);

  try {
    const response = await send(RELAY_ENDPOINT, {
      method: "POST",
      // JSON rather than a form body, so the request is preflighted and the
      // endpoint cannot be reached by a drive-by HTML form on some other site.
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relayBody(payload)),
      // Nothing about the user travels with this request beyond what is in the
      // body they read on screen.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.ok) return "sent";
    // 429 is a cap being hit, ours or theirs, and it is temporary by
    // construction. 503 is the worker saying it is not configured to send.
    if (response.status === 429 || response.status === 503) return "busy";
    return "refused";
  } catch {
    // Offline, DNS gone, blocked by a proxy, or the timeout above fired. From
    // here they are the same thing: it did not arrive, so use the mail client.
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
