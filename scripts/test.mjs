/**
 * Test runner.
 *
 * `src/core/` is pure and takes the adapter as a parameter, so the unit suite
 * needs no browser: the tests are bundled with esbuild and run on node's own
 * test runner. TZ is pinned so timestamp assertions and the committed fixture
 * mean the same thing on every machine.
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { files as walkFiles } from "./lib/walk.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outdir = path.join(root, ".tmp", "tests");

const entries = (await walkFiles("test/unit/*.test.ts", root)).map((entry) => path.join(root, entry));

if (entries.length === 0) {
  console.error("test: no test files found");
  process.exit(1);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: entries,
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  sourcemap: "inline",
  logLevel: "warning",
});

const built = entries.map((entry) =>
  path.join(outdir, `${path.basename(entry, ".ts")}.mjs`),
);

const unit = spawnSync(process.execPath, ["--test", ...built], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, TZ: "UTC" },
});

const conformance = spawnSync(process.execPath, [path.join(root, "scripts", "schema-conformance.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, TZ: "UTC" },
});

process.exit(unit.status === 0 && conformance.status === 0 ? 0 : 1);
