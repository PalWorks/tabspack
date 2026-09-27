/**
 * Builds the `tabspack` npm package, B-502, into packages/tabspack/.
 *
 *   node scripts/build-package.mjs
 *
 * Compiles src/package/index.ts and exactly what it imports, with the
 * extension's own sources, so the package and the extension share one reader
 * and one writer. Then copies in the JSON Schema and the licence, and checks
 * the package version is the one the schema version promises: the major
 * version is `schemaVersion`.
 */
import { execFileSync } from "node:child_process";
import { copyFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkgDir = path.join(root, "packages", "tabspack");

await rm(path.join(pkgDir, "dist"), { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(pkgDir, "tsconfig.json")], {
  stdio: "inherit",
});
await copyFile(path.join(root, "schema", "tabspack.v1.schema.json"), path.join(pkgDir, "schema.json"));
await copyFile(path.join(root, "LICENSE"), path.join(pkgDir, "LICENSE"));

const pkg = JSON.parse(await readFile(path.join(pkgDir, "package.json"), "utf8"));
const types = await readFile(path.join(root, "src", "types", "tabspack.ts"), "utf8");
const schemaVersion = Number(/SCHEMA_VERSION = (\d+)/.exec(types)?.[1]);
if (Number(pkg.version.split(".")[0]) !== schemaVersion) {
  console.error(`package: version ${pkg.version} does not start with schemaVersion ${schemaVersion}`);
  process.exit(1);
}
console.log(`package: tabspack ${pkg.version} built into packages/tabspack/`);
