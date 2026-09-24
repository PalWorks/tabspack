/**
 * Writes the generated fixtures. They are produced by the real pipeline rather
 * than hand written, so a fixture can never drift from what the product emits.
 * Run through `npm run fixtures`, which pins TZ=UTC so the output is identical
 * on every machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createFakeAdapter } from "./fake-adapter.js";
import { referenceScenario, syntheticScenario } from "./scenarios.js";
import type { Scenario } from "./scenarios.js";
import { collectSession } from "../../src/core/collect.js";
import { applyFilters } from "../../src/core/filters.js";
import { stringify, toFile } from "../../src/core/serialize.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";

const root = path.resolve(process.cwd());
const FIXED_DATE = new Date("2026-09-24T08:29:40Z");

async function sessionFrom(scenario: Scenario, keepFavicons: boolean): Promise<string> {
  const adapter = createFakeAdapter(scenario);
  const collected = await collectSession(adapter, {
    scope: "all_windows",
    includeIncognito: false,
    now: FIXED_DATE.getTime(),
  });
  const { session } = applyFilters(collected, { ...DEFAULT_SETTINGS, dedupe: false });
  return stringify(toFile(session, { keepFavicons, exportedAt: FIXED_DATE }));
}

async function main(): Promise<void> {
  const validDir = path.join(root, "test", "fixtures", "valid");
  const syntheticDir = path.join(root, "test", "fixtures", "synthetic");
  mkdirSync(validDir, { recursive: true });
  mkdirSync(syntheticDir, { recursive: true });

  const reference = await sessionFrom(referenceScenario(), true);
  writeFileSync(path.join(validDir, "three-windows.tabspack.json"), reference, "utf8");
  console.log("fixtures: valid/three-windows.tabspack.json");

  for (const size of [1000, 5000]) {
    const text = await sessionFrom(syntheticScenario(size), false);
    writeFileSync(path.join(syntheticDir, `synthetic-${size}.tabspack.json`), text, "utf8");
    console.log(`fixtures: synthetic/synthetic-${size}.tabspack.json`);
  }
}

await main();
