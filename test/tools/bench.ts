/**
 * Performance harness for NFR-002 and NFR-003.
 *
 * It measures the whole export path, collect through filter through serialize
 * through stringify, against synthetic sessions. A threshold breach exits non
 * zero, so a regression fails a run rather than being noticed later.
 */
import { buildExport, byteLength } from "../../src/core/export.js";
import { DEFAULT_SETTINGS } from "../../src/core/settings.js";
import { createFakeAdapter } from "./fake-adapter.js";
import { syntheticScenario } from "./scenarios.js";

interface Budget {
  tabs: number;
  maxMs: number;
  maxBytes: number | null;
  requirement: string;
}

const BUDGETS: Budget[] = [
  { tabs: 1000, maxMs: 2000, maxBytes: 400 * 1024, requirement: "NFR-002, NFR-003" },
  { tabs: 5000, maxMs: 10_000, maxBytes: null, requirement: "NFR-005 input size" },
];

const WHEN = new Date("2026-09-24T08:29:40Z");
const RUNS = 3;

async function measure(tabs: number): Promise<{ ms: number; bytes: number }> {
  const scenario = syntheticScenario(tabs);
  let best = Number.POSITIVE_INFINITY;
  let bytes = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const adapter = createFakeAdapter(scenario);
    const started = performance.now();
    const payload = await buildExport(
      adapter,
      { ...DEFAULT_SETTINGS, keepFavicons: false },
      { now: WHEN },
    );
    const elapsed = performance.now() - started;
    best = Math.min(best, elapsed);
    bytes = byteLength(payload.text);
  }
  return { ms: best, bytes };
}

async function main(): Promise<void> {
  const failures: string[] = [];
  console.log("tabs      best ms   file size   budget");
  for (const budget of BUDGETS) {
    const { ms, bytes } = await measure(budget.tabs);
    const kb = `${(bytes / 1024).toFixed(0)} KB`;
    const limit = budget.maxBytes === null ? `${budget.maxMs} ms` : `${budget.maxMs} ms, ${(budget.maxBytes / 1024).toFixed(0)} KB`;
    console.log(
      `${String(budget.tabs).padEnd(9)} ${ms.toFixed(0).padStart(7)}   ${kb.padStart(9)}   ${limit} (${budget.requirement})`,
    );
    if (ms > budget.maxMs) {
      failures.push(`${budget.tabs} tabs took ${ms.toFixed(0)} ms, over the ${budget.maxMs} ms budget`);
    }
    if (budget.maxBytes !== null && bytes > budget.maxBytes) {
      failures.push(
        `${budget.tabs} tabs produced ${kb}, over the ${(budget.maxBytes / 1024).toFixed(0)} KB budget`,
      );
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`perf: ${failure}`);
    process.exit(1);
  }
  console.log("perf: every budget met");
}

await main();
