/** Generates the fixtures produced by the real pipeline. TZ is pinned by npm run fixtures. */
import path from "node:path";
import { runTs } from "./run-ts.mjs";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
await runTs(path.join(root, "test", "tools", "make-fixtures.ts"));
