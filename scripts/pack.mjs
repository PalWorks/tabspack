/**
 * The archives each store wants, and the one a person can actually install.
 *
 *   node scripts/pack.mjs            every artefact
 *   node scripts/pack.mjs --only=firefox
 *
 * Four things land in `dist/artifacts/`:
 *
 *   tabspack-<version>-chrome.zip    upload to the Chrome Web Store
 *   tabspack-<version>-edge.zip      upload to Edge Add-ons, same bytes
 *   tabspack-<version>-firefox.xpi   upload to AMO, and see the note below
 *   tabspack-<version>-source.zip    the source archive AMO asks for when a
 *                                    submission is built rather than plain
 *
 * **The Firefox note, because it cost a user an afternoon.** A `.xpi` is a zip,
 * and release Firefox will not install one that Mozilla has not signed:
 * `about:addons` answers "This add-on could not be installed because it appears
 * to be corrupt", which says nothing about signing and sends you looking for a
 * broken file. There is no build that changes that. The two routes that work
 * are in `docs/store/submission.md`, and the short version is: use
 * `about:debugging` for a temporary install, or run Developer Edition with
 * `xpinstall.signatures.required` off. See ADR-034.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "artifacts");
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "--only=all").split("=")[1];

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

if (!existsSync(path.join(root, "dist", "chrome")) || !existsSync(path.join(root, "dist", "firefox"))) {
  console.error("pack: run npm run build first");
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

/** Zips the contents of a directory, not the directory itself, which is what every store wants. */
function zipDir(dir, archive) {
  execFileSync("zip", ["-r", "-q", "-X", archive, "."], { cwd: dir });
}

const made = [];

if (only === "all" || only === "chrome" || only === "edge") {
  const chrome = path.join(out, `tabspack-${version}-chrome.zip`);
  zipDir(path.join(root, "dist", "chrome"), chrome);
  made.push(chrome);
  // Edge takes the same package. Copied rather than symlinked, because the
  // upload form reads a file and a dashboard is not the place to discover that.
  const edge = path.join(out, `tabspack-${version}-edge.zip`);
  execFileSync("cp", [chrome, edge]);
  made.push(edge);
}

if (only === "all" || only === "firefox") {
  const xpi = path.join(out, `tabspack-${version}-firefox.xpi`);
  zipDir(path.join(root, "dist", "firefox"), xpi);
  made.push(xpi);
}

if (only === "all" || only === "source") {
  /*
   * AMO reviews the source of anything it cannot read directly, and this build
   * is bundled by esbuild, so the archive has to hold everything needed to
   * reproduce `dist/firefox`. Git decides what is in it, so an ignored file
   * cannot leak into a public archive by accident.
   */
  const source = path.join(out, `tabspack-${version}-source.zip`);
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString()
    .split("\0")
    .filter(Boolean);
  execFileSync("zip", ["-q", "-X", source, ...tracked], { cwd: root });
  made.push(source);
}

for (const file of made) {
  const { size } = await stat(file);
  console.log(`pack: ${path.relative(root, file)} · ${(size / 1024).toFixed(0)} KB`);
}
console.log(`pack: ${made.length} artefact${made.length === 1 ? "" : "s"} for version ${version}`);
