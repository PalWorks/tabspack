/**
 * T-601. Recovering the real address of a suspended tab.
 *
 * Every positive case below is the shape the suspender's own source builds, and
 * the Great Suspender cases are taken from a real export: the address carries
 * its own fragment after the unencoded `uri=`, which is the detail that breaks a
 * parser written from the documentation rather than from the code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { unsuspend, unsuspendSession, type Carrier } from "../../src/core/unsuspend.js";
import type { Session, SessionTab } from "../../src/types/session.js";

const GREAT = "chrome-extension://ahkbmjhfoplmfkpncgoedjgkajkehcgo";
const TINY = "chrome-extension://bbomjaikkcabgmfaomdichgcodnaeecf";
const ATD = "chrome-extension://jjkfgcdmkjfbjkcdkjmcjcbfhmnfmfnk";

interface Case {
  name: string;
  url: string;
  title?: string;
  expect: { url: string; title?: string; favIconUrl?: string; via: Carrier };
}

const CASES: Case[] = [
  {
    name: "the great suspender, with the page's own fragment after uri=",
    url: `${GREAT}/suspended.html#ttl=%F0%9F%92%A4%20Gmail&pos=0&uri=https://mail.google.com/mail/u/6/#inbox/FMfcgzQhWTptbwpmRJCkNXXfpvqtljvW`,
    title: "💤 Gmail",
    expect: {
      url: "https://mail.google.com/mail/u/6/#inbox/FMfcgzQhWTptbwpmRJCkNXXfpvqtljvW",
      title: "Gmail",
      via: "great-suspender",
    },
  },
  {
    name: "the great suspender, with an address holding its own query",
    url: `${GREAT}/suspended.html#ttl=Search&pos=0&uri=https://example.com/s?q=a&b=2`,
    expect: { url: "https://example.com/s?q=a&b=2", title: "Search", via: "great-suspender" },
  },
  {
    name: "the great suspender, legacy encoded url= form",
    url: `${GREAT}/suspended.html#ttl=Old&url=https%3A%2F%2Fexample.com%2Fold`,
    expect: { url: "https://example.com/old", title: "Old", via: "great-suspender" },
  },
  {
    name: "the great suspender, no title kept",
    url: `${GREAT}/suspended.html#ttl=&pos=0&uri=https://example.com/`,
    title: "💤 Example",
    expect: { url: "https://example.com/", title: "Example", via: "great-suspender" },
  },
  {
    name: "tiny suspender, query form with a favicon",
    url: `${TINY}/suspend.html?url=https%3A%2F%2Fexample.com%2Fa&title=An%20article&favIconUrl=https%3A%2F%2Fexample.com%2Ff.ico&scroll_x=0&scroll_y=120`,
    expect: {
      url: "https://example.com/a",
      title: "An article",
      favIconUrl: "https://example.com/f.ico",
      via: "tiny-suspender",
    },
  },
  {
    name: "tiny suspender, legacy hash form",
    url: `${TINY}/suspend.html#uri=https%3A%2F%2Fexample.com%2Fb&title=Legacy`,
    expect: { url: "https://example.com/b", title: "Legacy", via: "tiny-suspender" },
  },
  {
    name: "auto tab discard, dummy page",
    url: `${ATD}/plugins/dummy/page.html?title=Docs&href=https%3A%2F%2Fexample.com%2Fdocs&icon=https%3A%2F%2Fexample.com%2Fi.png`,
    expect: {
      url: "https://example.com/docs",
      title: "Docs",
      favIconUrl: "https://example.com/i.png",
      via: "auto-tab-discard",
    },
  },
  {
    name: "firefox reader mode",
    url: "about:reader?url=https%3A%2F%2Fexample.com%2Farticle",
    expect: { url: "https://example.com/article", via: "reader" },
  },
  {
    name: "an unknown suspender, caught by shape alone",
    url: "moz-extension://8f1c-4a2b/park/index.html?title=Parked&u=https%3A%2F%2Fexample.com%2Fparked",
    expect: { url: "https://example.com/parked", title: "Parked", via: "generic" },
  },
  {
    name: "a suspended tab that was suspended again",
    // `uri=` is written raw, so the inner wrapper arrives whole, query and all.
    url: `${GREAT}/suspended.html#ttl=Outer&pos=0&uri=${TINY}/suspend.html?url=https%3A%2F%2Fexample.com%2Finner&title=Inner`,
    expect: { url: "https://example.com/inner", title: "Outer", via: "great-suspender" },
  },
];

for (const item of CASES) {
  test(`recovers ${item.name}`, () => {
    const found = unsuspend(item.url, item.title);
    assert.ok(found, "nothing recovered");
    assert.equal(found.url, item.expect.url);
    assert.equal(found.title, item.expect.title);
    assert.equal(found.favIconUrl, item.expect.favIconUrl);
    assert.equal(found.via, item.expect.via);
  });
}

/**
 * The generic rule is the one that could do damage, so every one of these has to
 * stay untouched. A recovery that fires on an ordinary page would rewrite the
 * user's session into something they never had.
 */
const LEAVES_ALONE: [string, string][] = [
  ["an ordinary page", "https://example.com/?url=https://other.example/"],
  ["an extension page with no address in it", "chrome-extension://abc/options.html?tab=2"],
  ["a parameter that is not an address", "chrome-extension://abc/page.html?u=42"],
  ["a relative value", "chrome-extension://abc/suspended.html#uri=/local/path"],
  ["a javascript payload", "chrome-extension://abc/suspended.html#uri=javascript:alert(1)"],
  ["a data payload", "chrome-extension://abc/suspend.html?url=data%3Atext%2Fhtml%2Chi"],
  ["a file address", "chrome-extension://abc/suspended.html#uri=file:///etc/passwd"],
  ["another extension's page as the target", "chrome-extension://abc/suspended.html#uri=chrome-extension://def/x.html"],
  ["a browser page", "chrome://settings/"],
  ["reader mode with nothing in it", "about:reader"],
  ["nonsense", "not a url at all"],
  ["the empty string", ""],
];

for (const [name, url] of LEAVES_ALONE) {
  test(`leaves ${name} alone`, () => {
    assert.equal(unsuspend(url), null, url);
  });
}

test("a wrapper nested past the limit is refused, not followed forever", () => {
  let url = "https://example.com/end";
  for (let depth = 0; depth < 6; depth += 1) {
    url = `${GREAT}/suspended.html#ttl=L${depth}&pos=0&uri=${url}`;
  }
  // Six deep, the chain has not reached a page by the third unwrap, so nothing
  // is claimed. Handing back a half unwrapped extension address would be worse
  // than leaving the tab as it was found.
  assert.equal(unsuspend(url), null);
});

test("a session keeps everything it is not recovering", () => {
  const tab = (over: Partial<SessionTab>): SessionTab => ({
    index: 0,
    url: "https://example.com/",
    title: "Example",
    pinned: false,
    active: false,
    muted: false,
    discarded: false,
    openerIndex: null,
    cookieStoreId: null,
    lastAccessed: null,
    ...over,
  });

  const session: Session = {
    windows: [
      {
        key: "w1",
        focused: true,
        incognito: false,
        type: "normal",
        groups: [{ key: "g1", title: "Work" }],
        tabs: [
          tab({
            index: 0,
            url: `${GREAT}/suspended.html#ttl=Mail&pos=0&uri=https://mail.example.com/`,
            title: "💤 Mail",
            pinned: true,
            groupKey: "g1",
            favIconUrl: "chrome-extension://ahkb/img/sleep.png",
            unknown: { futureField: 1 },
          }),
          tab({ index: 1, url: "https://example.com/live", title: "Live" }),
        ],
      },
    ],
    source: {},
    capturedAt: 0,
  };

  const { session: next, recovered } = unsuspendSession(session);
  assert.equal(recovered, 1);

  const [first, second] = next.windows[0]!.tabs;
  assert.equal(first!.url, "https://mail.example.com/");
  assert.equal(first!.title, "Mail");
  assert.equal(first!.pinned, true, "pinned survives");
  assert.equal(first!.groupKey, "g1", "group membership survives");
  assert.deepEqual(first!.unknown, { futureField: 1 }, "unknown fields survive");
  assert.equal(first!.favIconUrl, undefined, "the suspender's own icon is dropped");
  assert.equal(second!.url, "https://example.com/live", "an ordinary tab is untouched");

  // Pure: the session it was given still says what it said.
  assert.match(session.windows[0]!.tabs[0]!.url, /^chrome-extension:/);
});

test("a session with nothing to recover is handed back unchanged", () => {
  const session: Session = {
    windows: [
      {
        key: "w1",
        focused: true,
        incognito: false,
        type: "normal",
        groups: [],
        tabs: [
          {
            index: 0,
            url: "https://example.com/",
            title: "Example",
            pinned: false,
            active: true,
            muted: false,
            discarded: false,
            openerIndex: null,
            cookieStoreId: null,
            lastAccessed: null,
          },
        ],
      },
    ],
    source: {},
    capturedAt: 0,
  };

  const { session: next, recovered } = unsuspendSession(session);
  assert.equal(recovered, 0);
  assert.equal(next, session, "no copy is made when nothing changed");
});

/* The two ends of the pipeline, T-602 ------------------------------------ */

test("an export carries the real addresses, and says how many it recovered", async () => {
  const { buildExport } = await import("../../src/core/export.js");
  const { DEFAULT_SETTINGS } = await import("../../src/core/settings.js");
  const { createFakeAdapter, tab, window_ } = await import("../tools/fake-adapter.js");

  const state = {
    groups: [],
    windows: [
      window_({
        id: 1,
        focused: true,
        tabs: [
          tab({
            index: 0,
            active: true,
            url: `${GREAT}/suspended.html#ttl=%F0%9F%92%A4%20Mail&pos=0&uri=https://mail.example.com/u/0/#inbox`,
            title: "💤 Mail",
          }),
          tab({ index: 1, url: "https://example.com/live", title: "Live" }),
        ],
      }),
    ],
  };

  const payload = await buildExport(createFakeAdapter(state), DEFAULT_SETTINGS, {
    now: new Date("2026-09-25T04:00:00Z"),
  });
  assert.equal(payload.recovered, 1);
  assert.match(payload.text, /https:\/\/mail\.example\.com\/u\/0\/#inbox/);
  assert.doesNotMatch(payload.text, /suspended\.html/);

  // The same session with the setting off is left exactly as the browser had it.
  const asFound = await buildExport(
    createFakeAdapter(state),
    { ...DEFAULT_SETTINGS, recoverSuspended: false },
    { now: new Date("2026-09-25T04:00:00Z") },
  );
  assert.equal(asFound.recovered, 0);
  assert.match(asFound.text, /suspended\.html/);
});

test("web pages only keeps a suspended tab, because it is a web page underneath", async () => {
  const { collectFiltered } = await import("../../src/core/export.js");
  const { DEFAULT_SETTINGS } = await import("../../src/core/settings.js");
  const { createFakeAdapter, tab, window_ } = await import("../tools/fake-adapter.js");

  const state = {
    groups: [],
    windows: [
      window_({
        id: 1,
        focused: true,
        tabs: [
          tab({
            index: 0,
            active: true,
            url: `${GREAT}/suspended.html#ttl=Docs&pos=0&uri=https://example.com/docs`,
            title: "💤 Docs",
          }),
        ],
      }),
    ],
  };

  const kept = await collectFiltered(createFakeAdapter(state), {
    ...DEFAULT_SETTINGS,
    webPagesOnly: true,
  });
  assert.equal(kept.recovered, 1);
  assert.equal(kept.session.windows[0]?.tabs.length, 1, "the filter sees the page, not the wrapper");
  assert.equal(kept.removed.scheme, 0);

  // Without recovery the same filter throws it away, which is the bug this fixes.
  const lost = await collectFiltered(createFakeAdapter(state), {
    ...DEFAULT_SETTINGS,
    webPagesOnly: true,
    recoverSuspended: false,
  });
  assert.equal(lost.session.windows.length, 0);
  assert.equal(lost.removed.scheme, 1);
});

test("a file already on disk is healed when it is imported", async () => {
  const { loadPack } = await import("../../src/core/import.js");
  const file = JSON.stringify({
    format: "tabspack",
    schemaVersion: 1,
    exportedAt: "2026-09-25T04:00:00.000Z",
    counts: { windows: 1, tabs: 1, groups: 0 },
    windows: [
      {
        id: "w1",
        tabs: [
          {
            index: 0,
            url: `${GREAT}/suspended.html#ttl=Inbox&pos=0&uri=https://mail.example.com/`,
            title: "💤 Inbox",
          },
        ],
      },
    ],
  });

  const healed = loadPack(file, { now: 0 });
  assert.equal(healed.recovered, 1);
  assert.equal(healed.session?.windows[0]?.tabs[0]?.url, "https://mail.example.com/");
  assert.equal(healed.session?.windows[0]?.tabs[0]?.title, "Inbox");

  const asWritten = loadPack(file, { now: 0, recoverSuspended: false });
  assert.equal(asWritten.recovered, undefined);
  assert.match(asWritten.session?.windows[0]?.tabs[0]?.url ?? "", /^chrome-extension:/);
});

test("another tool's export is healed the same way", async () => {
  const { loadPack } = await import("../../src/core/import.js");
  const oneTab = [
    `${GREAT}/suspended.html#ttl=Parked&pos=0&uri=https://example.com/parked | 💤 Parked`,
    "https://example.com/plain | Plain",
  ].join("\n");

  const healed = loadPack(oneTab, { now: 0 });
  assert.equal(healed.recovered, 1);
  const urls = healed.session?.windows.flatMap((win) => win.tabs.map((entry) => entry.url));
  assert.deepEqual(urls, ["https://example.com/parked", "https://example.com/plain"]);
});

test("the committed fixture recovers three of its five tabs, and only those three", async () => {
  const { loadPack } = await import("../../src/core/import.js");
  const { readFileSync } = await import("node:fs");
  const pathModule = await import("node:path");

  const file = readFileSync(
    pathModule.default.join(process.cwd(), "test", "fixtures", "valid", "suspended.tabspack.json"),
    "utf8",
  );
  const result = loadPack(file, { now: 0 });
  assert.equal(result.recovered, 3);

  const tabs = result.session?.windows[0]?.tabs ?? [];
  assert.deepEqual(
    tabs.map((entry) => entry.url),
    [
      "https://mail.example.com/mail/u/0/#inbox/FMfcgz",
      "https://example.com/legacy",
      "https://example.com/tiny",
      "https://example.com/never-suspended",
      // An extension's own settings page is not a suspended tab, and rewriting
      // it would be inventing a page the user never had.
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html?tab=2",
    ],
  );
  assert.equal(tabs[0]?.pinned, true, "pinned survives the rewrite");
  assert.equal(tabs[0]?.title, "Inbox");
  assert.equal(tabs[2]?.favIconUrl, "https://example.com/f.ico", "the wrapper's own favicon is kept");
});
