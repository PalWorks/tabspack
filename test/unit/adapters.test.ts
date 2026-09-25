/**
 * T-302 to T-308 and T-310. One suite over every foreign format: the real file
 * imports without losing an address or a title, the malformed sibling fails with
 * something a person can act on, and neither is ever detected by its file name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, inputFor } from "../../src/core/adapters/detect.js";
import { parseCsv } from "../../src/core/adapters/csv.js";
import { decodeEntities } from "../../src/core/adapters/netscape.js";
import { loadPack } from "../../src/core/import.js";
import { errors } from "../../src/core/issues.js";
import { describeFidelity } from "../../src/core/report.js";
import { countSession } from "../../src/types/session.js";

const dir = path.join(process.cwd(), "test", "fixtures", "foreign");
const NOW = Date.parse("2026-09-25T00:00:00Z");

function read(name: string): string {
  return readFileSync(path.join(dir, name), "utf8");
}

function load(name: string) {
  return loadPack(read(name), { now: NOW });
}

/** Every fixture, the adapter that must claim it, and what it must yield. */
const CASES = [
  { file: "tab-session-manager.json", adapter: "tab-session-manager", windows: 2, tabs: 5, groups: 1 },
  { file: "session-buddy.json", adapter: "session-buddy-json", windows: 2, tabs: 4, groups: 0 },
  { file: "session-buddy.csv", adapter: "csv", windows: 2, tabs: 4, groups: 0 },
  { file: "onetab.txt", adapter: "onetab", windows: 2, tabs: 5, groups: 0 },
  { file: "urls.txt", adapter: "urls", windows: 1, tabs: 4, groups: 0 },
  { file: "links.md", adapter: "markdown", windows: 2, tabs: 4, groups: 0 },
  { file: "bookmarks.html", adapter: "netscape", windows: 3, tabs: 5, groups: 0 },
  { file: "flat.json", adapter: "flat-json", windows: 1, tabs: 3, groups: 0 },
  { file: "flat-strings.json", adapter: "flat-json", windows: 1, tabs: 3, groups: 0 },
] as const;

for (const entry of CASES) {
  test(`${entry.file} is detected as ${entry.adapter} and imports without loss`, () => {
    const result = load(entry.file);
    assert.equal(result.ok, true, errors(result.issues)[0]?.message);
    assert.equal(result.source?.id, entry.adapter);
    assert.ok(result.session);
    const counts = countSession(result.session);
    assert.deepEqual(counts, { windows: entry.windows, tabs: entry.tabs, groups: entry.groups });
    for (const win of result.session.windows) {
      for (const tab of win.tabs) {
        assert.match(tab.url, /^[a-z][a-z0-9+.-]*:/i, `${tab.url} is not an address`);
      }
    }
  });
}

test("a renamed file is still detected, because detection never looks at the name", () => {
  const disguised = loadPack(read("onetab.txt"), { now: NOW });
  assert.equal(disguised.source?.id, "onetab");
  // The same bytes under any name, since nothing in the path is ever consulted.
  assert.equal(detect(inputFor(read("bookmarks.html")))?.id, "netscape");
  assert.equal(detect(inputFor(read("tab-session-manager.json")))?.id, "tab-session-manager");
});

const MALFORMED = [
  "tab-session-manager.malformed.json",
  "session-buddy.malformed.json",
  "session-buddy.malformed.csv",
  "onetab.malformed.txt",
  "urls.malformed.txt",
  "links.malformed.md",
  "bookmarks.malformed.html",
  "flat.malformed.json",
];

for (const name of MALFORMED) {
  test(`${name} fails with something a person can act on`, () => {
    const result = load(name);
    assert.equal(result.ok, false);
    const first = errors(result.issues)[0];
    assert.ok(first, "a failure with no error is a silent failure");
    assert.ok((first.fix ?? "").length > 10, `${name}: no fix suggested`);
    assert.ok(first.message.length > 20, `${name}: message too thin`);
  });
}

test("Tab Session Manager keeps windows, order, pinned tabs, the active tab and its group", () => {
  const result = load("tab-session-manager.json");
  const [first, second] = result.session?.windows ?? [];
  assert.equal(first?.tabs[0]?.pinned, true);
  assert.equal(first?.tabs[1]?.active, true);
  assert.equal(first?.tabs[2]?.discarded, true);
  assert.deepEqual(first?.groups, [{ key: "g1", title: "Shipping", color: "cyan", collapsed: true }]);
  assert.equal(first?.tabs[1]?.groupKey, "g1");
  assert.equal(first?.state, "maximized");
  assert.deepEqual(first?.bounds, { left: 0, top: 0, width: 1920, height: 1080 });
  // Tabs are keyed by a process local tab id, so the order has to come from index.
  assert.deepEqual(
    second?.tabs.map((tab) => tab.title),
    ["Notes", "Roadmap"],
  );
  assert.equal(result.session?.name, "Release week");
});

test("a Tab Session Manager file with several sessions reads the first and says so", () => {
  const one = JSON.parse(read("tab-session-manager.json")) as unknown[];
  const two = JSON.stringify([...one, ...one]);
  const result = loadPack(two, { now: NOW });
  assert.equal(result.ok, true);
  assert.ok(result.issues.some((issue) => issue.code === "tsm.many_sessions"));
});

test("Session Buddy keeps its windows and their order", () => {
  const result = load("session-buddy.json");
  assert.equal(result.session?.windows[0]?.tabs[0]?.pinned, true);
  assert.deepEqual(
    result.session?.windows[1]?.tabs.map((tab) => tab.title),
    ["Inbox", "Calendar"],
  );
  assert.equal(result.source?.fidelity, "high");
  assert.deepEqual(result.source?.missing, ["Tab groups", "Window size and state"]);
});

test("a CSV names its window column and survives quoted commas", () => {
  const result = load("session-buddy.csv");
  assert.equal(result.session?.windows[0]?.tabs[1]?.title, "The dataset, annotated");
  assert.equal(result.session?.windows[1]?.tabs[1]?.title, 'He said "hello" once');
  assert.equal(result.source?.fidelity, "low");
});

test("the CSV reader handles quotes, doubled quotes and both line endings", () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"two, ish"\n2,"say ""hi"""'), [
    ["a", "b"],
    ["1", "two, ish"],
    ["2", 'say "hi"'],
  ]);
});

test("OneTab treats a blank line as a window boundary", () => {
  const result = load("onetab.txt");
  assert.equal(result.session?.windows.length, 2);
  assert.equal(result.session?.windows[0]?.tabs.length, 3);
  assert.equal(result.session?.windows[0]?.tabs[0]?.title, "A paper worth keeping");
  assert.equal(result.source?.fidelity, "medium");
});

test("a list of addresses accepts comments, blank lines and a missing scheme", () => {
  const result = load("urls.txt");
  const urls = result.session?.windows[0]?.tabs.map((tab) => tab.url) ?? [];
  assert.equal(urls.includes("https://example.org/no-scheme-here"), true);
  assert.equal(urls.length, 4);
});

test("a titled text export written by TabsPack reads back with its titles", () => {
  const result = loadPack("A paper worth keeping\nhttps://example.com/paper\n\nThe dataset\nhttps://example.com/dataset\n", {
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.session?.windows[0]?.tabs.map((tab) => tab.title),
    ["A paper worth keeping", "The dataset"],
  );
});

test("Markdown headings become windows and titles survive", () => {
  const result = load("links.md");
  assert.equal(result.session?.windows[0]?.name, "Research");
  assert.equal(result.session?.windows[1]?.name, "Admin");
  assert.equal(result.session?.windows[0]?.tabs[0]?.title, "A paper worth keeping");
  assert.equal(result.session?.windows[1]?.tabs.length, 2, "a bare address under a heading counts");
});

test("bookmark folders become windows, and entities are decoded", () => {
  const result = load("bookmarks.html");
  const names = result.session?.windows.map((win) => win.name) ?? [];
  assert.deepEqual(names, ["Bookmarks", "Research", "Admin"]);
  assert.equal(result.session?.windows[1]?.tabs[0]?.title, "A paper & its notes");
  assert.equal(result.session?.windows[2]?.tabs[0]?.title, "Inbox <work>");
  assert.ok(result.issues.some((issue) => issue.code === "netscape.loose_links"));
});

test("entity decoding covers the five that matter plus numeric references", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x2F;"), `a & b <c> "d" 'e' /`);
});

test("every adapter declares what it cannot carry, so the preview can say so", () => {
  for (const entry of CASES) {
    const result = load(entry.file);
    assert.ok(result.source, entry.file);
    if (result.source.fidelity === "high" && result.source.id === "tab-session-manager") {
      assert.deepEqual(result.source.missing, []);
      continue;
    }
    assert.ok(result.source.missing.length > 0, `${entry.file} claims to carry everything`);
    assert.ok(result.source.carries.length > 0);
  }
});

test("a TabsPack file is never handed to a foreign adapter", () => {
  const text = readFileSync(
    path.join(process.cwd(), "test", "fixtures", "valid", "three-windows.tabspack.json"),
    "utf8",
  );
  const result = loadPack(text, { now: NOW });
  assert.equal(result.source?.id, "tabspack");
  assert.equal(countSession(result.session!).tabs, 40);
});

test("the fidelity line names what came through and what the format cannot hold", () => {
  const onetab = load("onetab.txt");
  const line = describeFidelity(onetab.source!);
  assert.match(line, /^OneTab export\. Carried: /);
  assert.match(line, /Not carried by this format: Pinned tabs, Tab groups, Window size and state\.$/);

  const pack = loadPack(
    readFileSync(path.join(process.cwd(), "test", "fixtures", "valid", "minimal.tabspack.json"), "utf8"),
  );
  assert.equal(describeFidelity(pack.source!), "TabsPack file. Everything in it can be restored.");
});
