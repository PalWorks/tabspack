import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, saveSettings } from "../../src/core/settings.js";
import { createFakeAdapter } from "../tools/fake-adapter.js";

test("defaults are returned when nothing is stored", () => {
  assert.deepEqual(mergeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(mergeSettings({}), DEFAULT_SETTINGS);
});

test("a stored value of the wrong type falls back to the default", () => {
  const merged = mergeSettings({ dedupe: "yes" as unknown as boolean, restoreBatchSize: -5 });
  assert.equal(merged.dedupe, DEFAULT_SETTINGS.dedupe);
  assert.equal(merged.restoreBatchSize, DEFAULT_SETTINGS.restoreBatchSize);
});

test("an unrecognised enum value falls back rather than reaching the pipeline", () => {
  const merged = mergeSettings({
    scope: "everything" as never,
    format: "pdf" as never,
    sort: "vibes" as never,
  });
  assert.equal(merged.scope, "all_windows");
  assert.equal(merged.format, "tabspack");
  assert.equal(merged.sort, "natural");
});

test("unknown keys are dropped", () => {
  const merged = mergeSettings({ nonsense: true } as never) as unknown as Record<string, unknown>;
  assert.equal("nonsense" in merged, false);
});

test("settings round trip through storage", async () => {
  const adapter = createFakeAdapter({ windows: [], groups: [] });
  assert.deepEqual(await loadSettings(adapter), DEFAULT_SETTINGS);
  const saved = await saveSettings(adapter, { scope: "current_window", keepFavicons: false });
  assert.equal(saved.scope, "current_window");
  assert.equal(saved.keepFavicons, false);
  const reloaded = await loadSettings(adapter);
  assert.equal(reloaded.scope, "current_window");
  assert.equal(reloaded.dedupe, DEFAULT_SETTINGS.dedupe);
});
