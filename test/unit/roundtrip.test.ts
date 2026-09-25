/**
 * T-209, and the exit test for M2. Export, import, restore, export again, compare.
 * If this suite is green the product's central claim holds for the code path; the
 * browser half of the claim is checked by `npm run smoke`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPack } from "../../src/core/import.js";
import { stringify, toFile } from "../../src/core/serialize.js";
import { roundTrip } from "../tools/roundtrip.js";
import { referenceScenario, syntheticScenario } from "../tools/scenarios.js";

test("the reference session survives export, import, restore and re export", async () => {
  const outcome = await roundTrip({ scenario: referenceScenario() });
  assert.deepEqual(outcome.differences, []);
  assert.equal(outcome.report.ok, true);
  assert.equal(outcome.report.restored, 38);
  assert.equal(outcome.report.unopenable.length, 2, "the chrome:// and file:// tabs, as documented");
  assert.equal(outcome.report.groups, 3);
});

test("the round trip holds with discarding on, and on a browser that discards at creation", async () => {
  const eager = await roundTrip({ scenario: referenceScenario(), discardThreshold: 0 });
  assert.deepEqual(eager.differences, []);

  const gecko = await roundTrip({
    scenario: referenceScenario(),
    discardThreshold: 0,
    target: { capabilities: { discardOnCreate: true, containers: true } },
  });
  assert.deepEqual(gecko.differences, []);

  // A browser that creates a tab unloaded also accepts its title, so on that
  // engine the titles of unloaded tabs survive the restore. On Chromium they
  // come back from the page itself once it loads, which is why the comparison
  // ignores the field in general.
  //
  // Two exceptions, and both are tabs that were never created unloaded: the one
  // active tab per window, which no browser will leave unloaded, and a pinned
  // tab, which Gecko refuses to create unloaded at all. Both are created loaded
  // and take their title from their page like anywhere else: ADR-027.
  const restored = (JSON.parse(gecko.reexported) as {
    windows: { tabs: { title?: string; pinned?: boolean; active?: boolean }[] }[];
  }).windows.flatMap((win) => win.tabs);
  const lazy = restored.filter((tab) => tab.pinned !== true && tab.active !== true);
  const titled = lazy.filter((tab) => (tab.title ?? "") !== "");
  assert.equal(titled.length, lazy.length, `${titled.length} of ${lazy.length} unloaded tabs kept their title`);
  assert.ok(lazy.length >= 33, `${lazy.length} tabs were created unloaded`);
});

test("a browser without tab groups loses the grouping and nothing else", async () => {
  const outcome = await roundTrip({
    scenario: referenceScenario(),
    target: { capabilities: { tabGroups: false } },
  });
  const unexpected = outcome.differences.filter((line) => !line.includes("groupId") && !line.includes(".groups"));
  assert.deepEqual(unexpected, [], outcome.differences.join("\n"));
  assert.equal(outcome.report.ungrouped, 14);
});

test("a thousand tabs round trip", async () => {
  const outcome = await roundTrip({ scenario: syntheticScenario(1000) });
  assert.deepEqual(outcome.differences, []);
  assert.equal(outcome.report.restored, 1000);
});

test("a file carrying unknown fields at every level comes back byte identical", () => {
  const original = readFileSync(
    path.join(process.cwd(), "test", "fixtures", "valid", "canonical-unknown.tabspack.json"),
    "utf8",
  );
  const loaded = loadPack(original);
  assert.ok(loaded.session, loaded.issues[0]?.message);
  const rewritten = stringify(toFile(loaded.session, { keepFavicons: true }));
  assert.equal(rewritten, original, "SPEC section 7: never act on an unknown field, never delete it either");
});

test("the committed reference fixture also survives a rewrite unchanged", () => {
  const original = readFileSync(
    path.join(process.cwd(), "test", "fixtures", "valid", "three-windows.tabspack.json"),
    "utf8",
  );
  const loaded = loadPack(original);
  assert.ok(loaded.session);
  assert.equal(stringify(toFile(loaded.session, { keepFavicons: true })), original);
});
