/**
 * Bundles a TypeScript entry point and runs it in node. Used by the fixture
 * generator and the performance harness, which both need the real source
 * without a separate compile step or a test framework.
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function runTs(entry, argv = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "tabspack-"));
  const out = path.join(dir, "entry.mjs");
  try {
    await build({
      entryPoints: [entry],
      outfile: out,
      bundle: true,
      platform: "node",
      format: "esm",
      target: ["node20"],
      logLevel: "warning",
    });
    process.argv = [process.argv[0], out, ...argv];
    await import(pathToFileURL(out).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
