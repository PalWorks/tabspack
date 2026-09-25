/**
 * Recovering the real address of a suspended tab, task T-601.
 *
 * A tab suspender replaces a tab's address with one of its own pages and hides
 * the real address inside it. To the browser that tab is an extension page, so
 * every honest export records an extension page, and no browser will reopen one
 * belonging to an extension it does not have. A session of seventy tabs turns
 * into a handful, which is the one failure this product cannot have.
 *
 * The rules below were written against the suspenders' own source, not guessed:
 *
 *   The Great Suspender and its forks, `src/js/gsUtils.js`
 *     generateSuspendedUrl: `suspended.html#ttl=<enc>&pos=<n>&uri=<RAW url>`
 *     getOriginalUrl:       `uri` first, then a legacy encoded `url`
 *     The `uri` value is NOT encoded and always last, so everything after it is
 *     the address, including any `&` and `#` of its own. A parser that reaches
 *     for URLSearchParams here truncates every Gmail address at its fragment.
 *
 *   Tiny Suspender, `src/tiny-suspender/js/core.js`
 *     buildSuspendUrl: `suspend.html?url=<enc>&title=<enc>&favIconUrl=<enc>&scroll_x=&scroll_y=`
 *     with a legacy hash form of `#uri=<enc>&title=<enc>`
 *
 *   Auto Tab Discard, `v2/plugins/dummy/core.js`
 *     `plugins/dummy/page.html?title=<enc>&href=<enc>&icon=<enc>`
 *     Only its v2 dummy mode rewrote addresses. The current build discards
 *     natively and keeps the address, so it needs nothing from us.
 *
 *   Firefox reader mode
 *     `about:reader?url=<enc>`, which no extension may open either.
 *
 * Detection is by the shape of the address and never by extension id. Your
 * suspender is a fork of a fork, the next person's is a different one, and an id
 * list would be stale the day it shipped. This is the same rule the foreign
 * format readers follow in `src/core/adapters/detect.ts`.
 */
import type { Session, SessionTab } from "../types/session.js";

export interface Unsuspended {
  /** The address the tab really held. Always absolute http or https. */
  url: string;
  /** The page's own title, where the wrapper carried one. */
  title?: string;
  /** The page's own favicon, where the wrapper carried one. */
  favIconUrl?: string;
  /** Which rule matched. Reported in tests, never shown to the user. */
  via: Carrier;
}

export type Carrier = "great-suspender" | "tiny-suspender" | "auto-tab-discard" | "reader" | "generic";

/**
 * The schemes a browser gives to an extension's own pages. Chromium and Gecko
 * are what TabsPack ships on; the other two cost nothing and mean a pack from
 * Safari or an older Edge is read the same way.
 */
const EXTENSION_SCHEMES = new Set([
  "chrome-extension:",
  "moz-extension:",
  "ms-browser-extension:",
  "safari-web-extension:",
  "extension:",
]);

/**
 * Parameter names that carry an address, for the generic rule. Short enough to
 * read, long enough to catch the forks nobody has told us about. A name is only
 * believed when its value is an absolute http or https address, which is what
 * keeps an extension's own `?u=42` out of this.
 */
const CARRIER_KEYS = ["uri", "url", "u", "href", "target", "originalUrl"];

/** A wrapper around a wrapper happens. Three is past anything seen in the wild. */
const MAX_DEPTH = 3;

/** The sleep marker a suspender puts in front of the title it kept. */
const SLEEP_MARK = /^[\s\u{1F4A4}\u{1F634}\u{1F4A1}]+/u;

/**
 * The real address of a suspended tab, or null when this is not one.
 *
 * Every recovered address is checked to be absolute http or https before it is
 * returned, so this can never turn a harmless extension page into a `javascript:`
 * or `data:` address. `src/core/urls.ts` judges it again at restore time, which
 * is the gate that actually opens tabs; this is the earlier of the two.
 */
export function unsuspend(url: string, title?: string): Unsuspended | null {
  let current = url;
  let found: Unsuspended | null = null;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const step = unwrapOnce(current);
    if (!step) break;
    // A later unwrap keeps the title the first one found: the outermost wrapper
    // is the one that saw the page.
    found = found ? { ...step, title: found.title ?? step.title, via: found.via } : step;
    current = step.url;
    if (webUrl(current)) break;
  }

  // A wrapper may hold another wrapper, so an intermediate address is allowed to
  // be an extension page. What is handed back never is: if the chain has not
  // reached an ordinary web address by the depth limit, this was not a suspended
  // tab that anyone can reopen, and saying so is better than inventing one.
  if (!found || !webUrl(current)) return null;
  const cleanTitle = cleanUpTitle(found.title ?? title);
  const result: Unsuspended = { url: current, via: found.via };
  if (cleanTitle) result.title = cleanTitle;
  if (found.favIconUrl) result.favIconUrl = found.favIconUrl;
  return result;
}

function unwrapOnce(url: string): Unsuspended | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;

  if (parsed.protocol === "about:" && parsed.pathname === "reader") {
    const target = parsed.searchParams.get("url");
    return carriesOn(target) ? { url: target as string, via: "reader" } : null;
  }

  if (!EXTENSION_SCHEMES.has(parsed.protocol)) return null;
  const path = parsed.pathname.toLowerCase();

  if (path.endsWith("/suspended.html")) {
    const hit = greatSuspender(parsed);
    if (hit) return hit;
  }
  if (path.endsWith("/suspend.html")) {
    const hit = tinySuspender(parsed);
    if (hit) return hit;
  }
  if (path.endsWith("/page.html")) {
    const hit = autoTabDiscard(parsed);
    if (hit) return hit;
  }
  return generic(parsed);
}

/**
 * `#ttl=<enc>&pos=<n>&uri=<raw>`. The raw value runs to the end of the string,
 * which is why this reads the fragment as text rather than as parameters.
 */
function greatSuspender(parsed: URL): Unsuspended | null {
  const hash = parsed.hash.replace(/^#/, "");
  if (hash === "") return null;

  const at = hash.indexOf("uri=");
  const target = at >= 0 ? hash.slice(at + 4) : decode(hashValue(hash, "url"));
  if (!carriesOn(target)) return null;

  const head = at >= 0 ? hash.slice(0, at) : hash;
  const title = decode(hashValue(head, "ttl"));
  return { url: target as string, ...(title ? { title } : {}), via: "great-suspender" };
}

/** `?url=<enc>&title=<enc>&favIconUrl=<enc>`, with a legacy `#uri=&title=`. */
function tinySuspender(parsed: URL): Unsuspended | null {
  const target = parsed.searchParams.get("url") ?? decode(hashValue(parsed.hash.replace(/^#/, ""), "uri"));
  if (!carriesOn(target)) return null;

  const title =
    parsed.searchParams.get("title") ?? decode(hashValue(parsed.hash.replace(/^#/, ""), "title"));
  const icon = parsed.searchParams.get("favIconUrl");
  return {
    url: target as string,
    ...(title ? { title } : {}),
    ...(webUrl(icon) ? { favIconUrl: icon as string } : {}),
    via: "tiny-suspender",
  };
}

/** `?title=<enc>&href=<enc>&icon=<enc>`. */
function autoTabDiscard(parsed: URL): Unsuspended | null {
  const target = parsed.searchParams.get("href");
  if (!carriesOn(target)) return null;
  const title = parsed.searchParams.get("title");
  const icon = parsed.searchParams.get("icon");
  return {
    url: target as string,
    ...(title ? { title } : {}),
    ...(webUrl(icon) ? { favIconUrl: icon as string } : {}),
    via: "auto-tab-discard",
  };
}

/**
 * Any extension page carrying an address in a parameter. The fork nobody has
 * named yet, and the reason this feature does not need a new release every time
 * somebody publishes another suspender.
 */
function generic(parsed: URL): Unsuspended | null {
  const hash = parsed.hash.replace(/^#/, "");
  for (const key of CARRIER_KEYS) {
    const raw = parsed.searchParams.get(key) ?? decode(hashValue(hash, key));
    if (carriesOn(raw)) {
      const title = parsed.searchParams.get("title") ?? decode(hashValue(hash, "ttl"));
      return { url: raw as string, ...(title ? { title } : {}), via: "generic" };
    }
  }
  return null;
}

/** One value out of an `a=1&b=2` string, without decoding it. */
function hashValue(text: string, key: string): string | null {
  for (const pair of text.split("&")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    if (pair.slice(0, at) === key) return pair.slice(at + 1);
  }
  return null;
}

/** The suspenders use `encodeURIComponent` with a fallback to the raw string. */
function decode(value: string | null): string | null {
  if (value === null || value === "") return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Absolute http or https, and nothing else, ever. */
function webUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = safeUrl(value);
  return parsed !== null && (parsed.protocol === "http:" || parsed.protocol === "https:");
}

/**
 * What a wrapper is allowed to point at: an ordinary page, or another wrapper to
 * unwrap on the next turn. Everything else, and `javascript:`, `data:` and
 * `file:` above all, stops the chain here.
 */
function carriesOn(value: string | null | undefined): boolean {
  if (!value) return false;
  if (webUrl(value)) return true;
  const parsed = safeUrl(value);
  if (!parsed) return false;
  return EXTENSION_SCHEMES.has(parsed.protocol) || (parsed.protocol === "about:" && parsed.pathname === "reader");
}

/**
 * A suspender marks its titles, typically with a sleep emoji. The mark belongs
 * to the suspended state, which is exactly the state being undone here.
 */
function cleanUpTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const cleaned = title.replace(SLEEP_MARK, "").trim();
  return cleaned === "" ? undefined : cleaned;
}

/**
 * The whole session, with every suspended tab restored to the address it stands
 * for. Pure: it returns a new session and leaves the one it was given alone.
 *
 * A tab whose favicon belonged to the suspender loses it, because a sleep icon
 * beside a recovered page is a picture of something that is no longer true. The
 * wrapper's own favicon is kept when it carried one.
 */
export function unsuspendSession(session: Session): { session: Session; recovered: number } {
  let recovered = 0;

  const windows = session.windows.map((win) => {
    let touched = false;
    const tabs = win.tabs.map((tab) => {
      const hit = unsuspend(tab.url, tab.title);
      if (!hit) return tab;
      recovered += 1;
      touched = true;
      const next: SessionTab = { ...tab, url: hit.url };
      if (hit.title) next.title = hit.title;
      if (hit.favIconUrl) next.favIconUrl = hit.favIconUrl;
      else delete next.favIconUrl;
      return next;
    });
    return touched ? { ...win, tabs } : win;
  });

  return recovered === 0 ? { session, recovered } : { session: { ...session, windows }, recovered };
}
