/**
 * Proves the `tabspack` package works where a stranger would use it.
 *
 *   node scripts/test-package.mjs
 *
 * Builds it, packs the tarball npm would publish, installs that tarball into an
 * empty project outside the repository, and runs the fixture corpus through the
 * installed copy. A package that only works inside the repository it was built
 * in is the most ordinary way to publish something broken.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkgDir = path.join(root, "packages", "tabspack");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
/** A tarball over this is carrying something it should not. */
const MAX_TARBALL_BYTES = 80 * 1024;

execFileSync(process.execPath, [path.join(root, "scripts", "build-package.mjs")], { stdio: "inherit" });
const work = await mkdtemp(path.join(tmpdir(), "tabspack-package-"));
const problems = [];
try {
  const packed = JSON.parse(execFileSync(npm, ["pack", "--json", "--pack-destination", work], { cwd: pkgDir, encoding: "utf8" }))[0];
  if (packed.size > MAX_TARBALL_BYTES) problems.push(`tarball is ${packed.size} bytes, over ${MAX_TARBALL_BYTES}`);
  const shipped = packed.files.map((file) => file.path);
  for (const needed of ["package.json", "README.md", "LICENSE", "schema.json", "dist/package/index.js", "dist/package/index.d.ts"]) {
    if (!shipped.includes(needed)) problems.push(`tarball is missing ${needed}`);
  }
  for (const file of shipped) {
    if (/adapter\/|\.test\.|\.map$|^src\//.test(file)) problems.push(`tarball carries ${file}`);
  }

  const app = path.join(work, "app");
  execFileSync("mkdir", ["-p", app]);
  await writeFile(path.join(app, "package.json"), JSON.stringify({ name: "app", private: true, type: "module" }));
  execFileSync(npm, ["install", "--no-audit", "--no-fund", "--silent", path.join(work, packed.filename)], { cwd: app, stdio: "inherit" });

  const fixtures = path.join(root, "test", "fixtures");
  const expectations = JSON.parse(await readFile(path.join(fixtures, "expectations.json"), "utf8"));
  const cases = [];
  for (const name of await readdir(path.join(fixtures, "valid"))) cases.push({ dir: "valid", name, accepts: true });
  for (const dir of ["invalid", "edge"]) {
    for (const [name, expectation] of Object.entries(expectations[dir])) cases.push({ dir, name, accepts: expectation.readerAccepts });
  }
  for (const name of await readdir(path.join(fixtures, "foreign"))) {
    if (name === "README.md") continue;
    cases.push({ dir: "foreign", name, accepts: !name.includes(".malformed.") });
  }
  await writeFile(path.join(app, "cases.json"), JSON.stringify(cases.map((c) => ({ ...c, file: path.join(fixtures, c.dir, c.name) }))));
  await writeFile(
    path.join(app, "run.mjs"),
    `import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { read, write, validate, FORMAT, SCHEMA_VERSION } from "tabspack";
const require = createRequire(import.meta.url);
const schema = require("tabspack/schema.json");
const out = { wrong: [], roundtrip: 0 };
if (FORMAT !== "tabspack" || SCHEMA_VERSION !== 1 || !schema.$id) out.wrong.push("exports");
for (const c of JSON.parse(readFileSync("cases.json", "utf8"))) {
  const result = read(readFileSync(c.file, "utf8"));
  if (result.ok !== c.accepts && !c.name.includes(".malformed.")) out.wrong.push(c.dir + "/" + c.name);
  if (result.ok && c.dir === "valid") {
    const again = read(write(result.session));
    if (!again.ok || validate(write(result.session)).ok !== true) out.wrong.push("roundtrip " + c.name);
    else out.roundtrip += 1;
  }
}
console.log(JSON.stringify(out));
`,
  );
  const result = JSON.parse(execFileSync(process.execPath, ["run.mjs"], { cwd: app, encoding: "utf8" }));
  for (const wrong of result.wrong) problems.push(`installed package disagrees on ${wrong}`);
  if (result.roundtrip === 0) problems.push("no valid fixture round tripped");
  if (problems.length === 0) {
    console.log(`package: installed from a ${packed.size} byte tarball, ${cases.length} fixtures agree, ${result.roundtrip} round trip`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`package: ${problem}`);
  process.exit(1);
}
