import { test } from "node:test";
import assert from "node:assert/strict";
import { keepableFavicon, stringify, toFile } from "../../src/core/serialize.js";
import { collectSession } from "../../src/core/collect.js";
import { createFakeAdapter, tab, window_ } from "../tools/fake-adapter.js";
import { referenceScenario } from "../tools/scenarios.js";
import type { Session } from "../../src/types/session.js";

const WHEN = new Date("2026-09-24T08:29:40Z");

async function referenceSession(): Promise<Session> {
  return await collectSession(createFakeAdapter(referenceScenario()), {
    scope: "all_windows",
    includeIncognito: false,
    now: WHEN.getTime(),
  });
}

test("the same session serialises to identical bytes twice", async () => {
  const session = await referenceSession();
  const first = stringify(toFile(session, { keepFavicons: true, exportedAt: WHEN }));
  const second = stringify(toFile(session, { keepFavicons: true, exportedAt: WHEN }));
  assert.equal(first, second);
});

test("only exportedAt changes between two exports of the same session", async () => {
  const session = await referenceSession();
  const a = toFile(session, { keepFavicons: true, exportedAt: WHEN });
  const b = toFile(session, { keepFavicons: true, exportedAt: new Date(WHEN.getTime() + 60_000) });
  assert.notEqual(a.exportedAt, b.exportedAt);
  assert.deepEqual({ ...a, exportedAt: "" }, { ...b, exportedAt: "" });
});

test("writes the format header, counts and window ids", async () => {
  const file = toFile(await referenceSession(), { keepFavicons: true, exportedAt: WHEN });
  assert.equal(file.format, "tabspack");
  assert.equal(file.schemaVersion, 1);
  assert.deepEqual(file.counts, { windows: 3, tabs: 40, groups: 3 });
  assert.deepEqual(file.windows.map((w) => w.id), ["w1", "w2", "w3"]);
  assert.equal(file.windows[0]?.state, "maximized");
  assert.deepEqual(file.windows[0]?.bounds, { left: 0, top: 0, width: 1920, height: 1080 });
});

test("omits defaults so a file stays readable", async () => {
  const session = await collectSession(
    createFakeAdapter({
      windows: [window_({ id: 1, focused: true, tabs: [tab({ index: 0, url: "https://example.com/" })] })],
      groups: [],
    }),
    { scope: "all_windows", includeIncognito: false, now: WHEN.getTime() },
  );
  const file = toFile(session, { keepFavicons: true, exportedAt: WHEN });
  const tabOut = file.windows[0]?.tabs[0] as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(tabOut), ["index", "url", "title"]);
  assert.equal("pinned" in tabOut, false);
  assert.equal("openerIndex" in tabOut, false);
  assert.equal("cookieStoreId" in tabOut, false);
});

test("embedded favicons are dropped unless asked for, remote ones are kept", () => {
  assert.equal(keepableFavicon("data:image/png;base64,AAAA", false), undefined);
  assert.equal(keepableFavicon("data:image/png;base64,AAAA", true), "data:image/png;base64,AAAA");
  assert.equal(keepableFavicon("https://example.com/favicon.ico", false), "https://example.com/favicon.ico");
  assert.equal(keepableFavicon(undefined, true), undefined);
});

test("stripping favicons makes the file smaller and changes nothing else", async () => {
  const session = await referenceSession();
  const withIcons = toFile(session, { keepFavicons: true, exportedAt: WHEN });
  const without = toFile(session, { keepFavicons: false, exportedAt: WHEN });
  assert.ok(stringify(without).length < stringify(withIcons).length);
  assert.equal(without.counts?.tabs, withIcons.counts?.tabs);
  const embedded = JSON.stringify(without).includes("data:image");
  assert.equal(embedded, false);
});

test("unrecognised fields survive a rewrite, in sorted order", () => {
  const session: Session = {
    windows: [
      {
        key: "w1",
        focused: true,
        incognito: false,
        type: "normal",
        groups: [],
        unknown: { zeta: 1, alpha: 2 },
        tabs: [
          {
            index: 0,
            url: "https://example.com/",
            title: "",
            pinned: false,
            active: false,
            muted: false,
            discarded: false,
            openerIndex: null,
            cookieStoreId: null,
            lastAccessed: null,
            unknown: { futureTabField: ["keep", "me"] },
          },
        ],
      },
    ],
    source: {},
    capturedAt: 0,
    unknown: { futureTopLevel: { written: "by a later version" } },
  };
  const file = toFile(session, { keepFavicons: true, exportedAt: WHEN }) as unknown as Record<string, unknown>;
  assert.deepEqual(file.futureTopLevel, { written: "by a later version" });
  const win = (file.windows as Record<string, unknown>[])[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(win).slice(-2), ["alpha", "zeta"]);
  const tabOut = (win.tabs as Record<string, unknown>[])[0] as Record<string, unknown>;
  assert.deepEqual(tabOut.futureTabField, ["keep", "me"]);
});

test("the serialised file ends with a newline", async () => {
  const text = stringify(toFile(await referenceSession(), { keepFavicons: false, exportedAt: WHEN }));
  assert.equal(text.endsWith("}\n"), true);
});
