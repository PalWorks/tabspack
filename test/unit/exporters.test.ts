import { test } from "node:test";
import assert from "node:assert/strict";
import { toFlatJson, toUrlList } from "../../src/core/exporters.js";
import type { Session } from "../../src/types/session.js";

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
          url: "https://example.com/a",
          title: "Page A",
          pinned: false,
          active: false,
          muted: false,
          discarded: false,
          openerIndex: null,
          cookieStoreId: null,
          lastAccessed: null,
        },
        {
          index: 1,
          url: "https://example.com/b",
          title: "",
          pinned: false,
          active: false,
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

test("the URL list is one URL per line by default", () => {
  assert.equal(toUrlList(session, { includeTitles: false }), "https://example.com/a\nhttps://example.com/b\n");
});

test("with titles on, each entry is a title line above its URL", () => {
  assert.equal(
    toUrlList(session, { includeTitles: true }),
    "Page A\nhttps://example.com/a\n\nhttps://example.com/b\n",
  );
});

test("a titled list still contains every URL on its own line, so it reimports", () => {
  const text = toUrlList(session, { includeTitles: true });
  const urls = text.split("\n").filter((line) => line.startsWith("https://"));
  assert.deepEqual(urls, ["https://example.com/a", "https://example.com/b"]);
});

test("an empty session produces an empty file, not a stray newline", () => {
  const empty: Session = { windows: [], source: {}, capturedAt: 0 };
  assert.equal(toUrlList(empty, { includeTitles: false }), "");
  assert.equal(toFlatJson(empty), "[]\n");
});

test("flat JSON is an array of title and URL pairs", () => {
  assert.deepEqual(JSON.parse(toFlatJson(session)), [
    { title: "Page A", url: "https://example.com/a" },
    { title: "", url: "https://example.com/b" },
  ]);
});
