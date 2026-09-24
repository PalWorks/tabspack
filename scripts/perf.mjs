/** Runs the performance harness. See test/tools/bench.ts for the budgets. */
import path from "node:path";
import { runTs } from "./run-ts.mjs";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
await runTs(path.join(root, "test", "tools", "bench.ts"));
