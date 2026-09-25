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
import type { Session } from "../../src/types/session.js";
import { applyFilters } from "../../src/core/filters.js";
import { stringify, toFile } from "../../src/core/serialize.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";

const root = path.resolve(process.cwd());
const FIXED_DATE = new Date("2026-09-24T08:29:40Z");

async function sessionFrom(
  scenario: Scenario,
  keepFavicons: boolean,
  decorate?: (session: Session) => void,
): Promise<string> {
  const adapter = createFakeAdapter(scenario);
  const collected = await collectSession(adapter, {
    scope: "all_windows",
    includeIncognito: false,
    now: FIXED_DATE.getTime(),
  });
  const { session } = applyFilters(collected, { ...DEFAULT_SETTINGS, dedupe: false });
  decorate?.(session);
  return stringify(toFile(session, { keepFavicons, exportedAt: FIXED_DATE }));
}

/**
 * Fields no version of TabsPack understands, attached at every level of the
 * document. The round trip test in test/unit/roundtrip.test.ts reads this file,
 * imports it and writes it out again, and the two must be identical byte for
 * byte: that is the whole of docs/SPEC.md section 7 in one assertion.
 */
function decorateWithUnknownFields(session: Session): void {
  session.name = "Canonical pack with unknown fields";
  session.tags = ["fixture", "round-trip"];
  session.unknown = { futureTopLevel: { written: "by a later version" }, zzzLast: 1 };
  session.source.profile = "Default";
  session.source.deviceName = "workstation";
  session.source.unknown = { futureSourceField: "kept" };
  session.windows.forEach((win, index) => {
    win.unknown = { futureWindowField: index + 1 };
    win.groups.forEach((group) => {
      group.unknown = { futureGroupField: true };
    });
    const first = win.tabs[0];
    if (first) {
      first.unknown = { futureTabField: ["keep", "me"] };
      first.notes = "carried through untouched";
      first.tags = ["todo"];
    }
  });
}

async function main(): Promise<void> {
  const validDir = path.join(root, "test", "fixtures", "valid");
  const syntheticDir = path.join(root, "test", "fixtures", "synthetic");
  mkdirSync(validDir, { recursive: true });
  mkdirSync(syntheticDir, { recursive: true });

  const reference = await sessionFrom(referenceScenario(), true);
  writeFileSync(path.join(validDir, "three-windows.tabspack.json"), reference, "utf8");
  console.log("fixtures: valid/three-windows.tabspack.json");

  const canonical = await sessionFrom(referenceScenario(), true, decorateWithUnknownFields);
  writeFileSync(path.join(validDir, "canonical-unknown.tabspack.json"), canonical, "utf8");
  console.log("fixtures: valid/canonical-unknown.tabspack.json");

  for (const size of [1000, 5000]) {
    const text = await sessionFrom(syntheticScenario(size), false);
    writeFileSync(path.join(syntheticDir, `synthetic-${size}.tabspack.json`), text, "utf8");
    console.log(`fixtures: synthetic/synthetic-${size}.tabspack.json`);
  }
}

await main();
