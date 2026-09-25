/**
 * Generates the fixtures produced by the real pipeline.
 *
 * The timezone is pinned here rather than in the npm script, so the committed
 * fixtures are identical on every machine and on Windows too, where an inline
 * environment assignment is not portable. Node applies a change to process.env.TZ
 * to every Date created afterwards, and the generator runs afterwards.
 */
import path from "node:path";
import { runTs } from "./run-ts.mjs";

process.env.TZ = "UTC";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
await runTs(path.join(root, "test", "tools", "make-fixtures.ts"));
