/**
 * T-404. The keyboard commands do their work in the background, so the checks
 * are on what reaches the browser: a file written by whichever route this engine
 * allows, a snapshot in storage, and a badge the user can read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, runCommand } from "../../src/background/commands.js";
import { base64, saveFromBackground, DATA_URL_LIMIT } from "../../src/background/save-file.js";
import { listSnapshots } from "../../src/core/snapshots.js";
import { createFakeAdapter } from "../tools/fake-adapter.js";
import { referenceScenario } from "../tools/scenarios.js";

function browser() {
  return createFakeAdapter(referenceScenario());
}

test("exporting all windows writes a file and reports the count", async () => {
  const adapter = browser();
  const outcome = await runCommand(adapter, COMMANDS.exportAll);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.tabs, 39, "the default settings remove the one duplicate");
  assert.equal(adapter.downloads.length, 1);
  assert.match(adapter.downloads[0]?.filename ?? "", /^tabspack-\d{8}-\d{4}\.tabspack\.json$/);
  assert.match(outcome.detail, /^saved as tabspack-/);
});

test("exporting this window exports only this window", async () => {
  const adapter = browser();
  const outcome = await runCommand(adapter, COMMANDS.exportCurrent);
  assert.equal(outcome.tabs, 18);
});

test("saving a snapshot stores it and names it after the moment", async () => {
  const adapter = browser();
  const outcome = await runCommand(adapter, COMMANDS.saveSnapshot);
  assert.equal(outcome.ok, true);
  const list = await listSnapshots(adapter);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.counts.tabs, 40, "a snapshot is the session, before export filters");
  assert.match(outcome.detail, /^saved as "/);
  assert.equal(adapter.downloads.length, 0, "a snapshot is not a file");
});

test("a command with nothing to act on says so rather than writing an empty file", async () => {
  const empty = createFakeAdapter({ windows: [], groups: [] });
  const exported = await runCommand(empty, COMMANDS.exportAll);
  assert.equal(exported.ok, false);
  assert.equal(empty.downloads.length, 0);
  const snapshot = await runCommand(empty, COMMANDS.saveSnapshot);
  assert.equal(snapshot.ok, false);
  assert.deepEqual(await listSnapshots(empty), []);
});

/**
 * Node has `URL.createObjectURL`, and so does a Gecko event page. A Chromium
 * service worker does not, which was measured rather than assumed, so the data
 * URL route is exercised by taking it away.
 */
async function withoutBlobUrls<T>(action: () => Promise<T>): Promise<T> {
  const holder = globalThis.URL as unknown as { createObjectURL?: unknown };
  const original = holder.createObjectURL;
  delete holder.createObjectURL;
  try {
    return await action();
  } finally {
    holder.createObjectURL = original;
  }
}

test("a background that can make a blob URL uses it", async () => {
  const adapter = createFakeAdapter({ windows: [], groups: [] });
  const outcome = await saveFromBackground(
    adapter,
    { text: "{}", filename: "a.tabspack.json", mime: "application/json" },
    "manager.html#export=all_windows",
  );
  assert.equal(outcome.route, "blob");
  assert.equal(adapter.downloads.length, 1);
});

test("a background without blob URLs writes the file as a data URL", async () => {
  const adapter = createFakeAdapter({ windows: [], groups: [] });
  const outcome = await withoutBlobUrls(() =>
    saveFromBackground(
      adapter,
      { text: '{"format":"tabspack"}', filename: "a.tabspack.json", mime: "application/json" },
      "manager.html#export=all_windows",
    ),
  );
  assert.equal(outcome.route, "data-url");
  assert.match(adapter.downloads[0]?.url ?? "", /^data:application\/json;base64,/);
});

test("the background save falls back to the page when it cannot write a file itself", async () => {
  const adapter = createFakeAdapter({ windows: [], groups: [], failDownload: true });
  const outcome = await saveFromBackground(
    adapter,
    { text: "{}", filename: "a.tabspack.json", mime: "application/json" },
    "manager.html#export=all_windows",
  );
  assert.equal(outcome.saved, false);
  assert.equal(outcome.route, "page");
  assert.deepEqual(adapter.opened, ["manager.html#export=all_windows"]);
});

test("a pack too large for a data URL goes to the page instead", async () => {
  const adapter = createFakeAdapter({ windows: [], groups: [] });
  const huge = "x".repeat(DATA_URL_LIMIT + 1);
  const outcome = await withoutBlobUrls(() =>
    saveFromBackground(
      adapter,
      { text: huge, filename: "a.tabspack.json", mime: "application/json" },
      "manager.html#export=all_windows",
    ),
  );
  assert.equal(outcome.route, "page");
  assert.equal(adapter.downloads.length, 0);
});

test("base64 survives text that is not plain ASCII", () => {
  assert.equal(base64("hi\n"), "aGkK");
  const round = Buffer.from(base64("héllo · 日本語"), "base64").toString("utf8");
  assert.equal(round, "héllo · 日本語");
});

test("base64 handles a payload larger than one call can spread", () => {
  const long = "a".repeat(200_000);
  assert.equal(Buffer.from(base64(long), "base64").toString("utf8"), long);
});
