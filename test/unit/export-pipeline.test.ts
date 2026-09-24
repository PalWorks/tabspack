import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildExport, byteLength, collectFiltered } from "../../src/core/export.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import { createFakeAdapter } from "../tools/fake-adapter.js";
import { referenceScenario } from "../tools/scenarios.js";

const WHEN = new Date("2026-09-24T08:29:40Z");

function adapter() {
  return createFakeAdapter(referenceScenario());
}

test("the default export is a TabsPack file naming itself after the local time", async () => {
  const payload = await buildExport(adapter(), DEFAULT_SETTINGS, { now: WHEN });
  assert.equal(payload.format, "tabspack");
  assert.match(payload.filename, /^tabspack-\d{8}-\d{4}\.tabspack\.json$/);
  assert.equal(payload.mime, "application/json;charset=utf-8");
  assert.equal(payload.bytes, byteLength(payload.text));

  const parsed = JSON.parse(payload.text) as { format: string; counts: { tabs: number } };
  assert.equal(parsed.format, "tabspack");
  // One duplicate URL is removed by the default settings.
  assert.equal(parsed.counts.tabs, 39);
});

test("the committed fixture is exactly what the pipeline emits", async () => {
  const payload = await buildExport(
    adapter(),
    { ...DEFAULT_SETTINGS, dedupe: false, keepFavicons: true },
    { now: WHEN },
  );
  const fixture = readFileSync(
    path.join(process.cwd(), "test", "fixtures", "valid", "three-windows.tabspack.json"),
    "utf8",
  );
  assert.equal(
    payload.text,
    fixture,
    "regenerate with npm run fixtures when the serializer changes on purpose",
  );
});

test("the URL list and flat JSON formats name themselves differently", async () => {
  const urls = await buildExport(adapter(), { ...DEFAULT_SETTINGS, format: "urls" }, { now: WHEN });
  assert.match(urls.filename, /\.txt$/);
  assert.equal(urls.mime, "text/plain;charset=utf-8");
  assert.equal(urls.text.split("\n").filter(Boolean).length, 39);

  const flat = await buildExport(adapter(), { ...DEFAULT_SETTINGS, format: "flatjson" }, { now: WHEN });
  assert.match(flat.filename, /\.json$/);
  assert.equal((JSON.parse(flat.text) as unknown[]).length, 39);
});

test("a scope change changes what is collected", async () => {
  const all = await collectFiltered(adapter(), DEFAULT_SETTINGS, WHEN);
  const current = await collectFiltered(
    adapter(),
    { ...DEFAULT_SETTINGS, scope: "current_window" },
    WHEN,
  );
  const one = await collectFiltered(adapter(), { ...DEFAULT_SETTINGS, scope: "current_tab" }, WHEN);
  assert.equal(all.session.windows.length, 3);
  assert.equal(current.session.windows.length, 1);
  assert.equal(one.session.windows[0]?.tabs.length, 1);
});

test("the report counts survive the whole pipeline", async () => {
  const payload = await buildExport(adapter(), DEFAULT_SETTINGS, { now: WHEN });
  assert.equal(payload.removed.duplicate, 1);
  assert.equal(payload.removed.scheme, 0);

  const strict = await buildExport(
    adapter(),
    { ...DEFAULT_SETTINGS, webPagesOnly: true, skipPinned: true },
    { now: WHEN },
  );
  // chrome:// and file:// in window three, plus the two pinned tabs in window one.
  assert.equal(strict.removed.scheme, 2);
  assert.equal(strict.removed.pinned, 2);
});

test("an export of nothing is empty rather than a broken file", async () => {
  const empty = createFakeAdapter({ windows: [], groups: [] });
  const payload = await buildExport(empty, DEFAULT_SETTINGS, { now: WHEN });
  const parsed = JSON.parse(payload.text) as { windows: unknown[]; counts: { tabs: number } };
  assert.deepEqual(parsed.windows, []);
  assert.equal(parsed.counts.tabs, 0);
});
