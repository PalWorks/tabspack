/**
 * Does the Firefox package actually load in Firefox, task T-507.
 *
 *   node scripts/firefox-load.mjs [--firefox=/path/to/firefox] [--seconds=45]
 *
 * This is the one cross browser check that can be automated here. It hands the
 * built `dist/firefox` to a real Firefox through web-ext, which installs it as a
 * temporary add-on over the browser's own debugging protocol, exactly as the
 * Load Temporary Add-on button does. If the manifest, the permissions, the
 * background declaration or the content security policy were wrong for Gecko,
 * the install fails and so does this.
 *
 * What it does not do is drive the interface. Firefox has no equivalent of the
 * Chromium automation the smoke run uses for extensions, so exporting, importing
 * and restoring in Firefox remain manual matrix cases in docs/TESTING.md.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const firefox = (
  process.argv.find((arg) => arg.startsWith("--firefox=")) ?? "--firefox=/usr/bin/firefox"
).split("=")[1];
const seconds = Number(
  (process.argv.find((arg) => arg.startsWith("--seconds=")) ?? "--seconds=45").split("=")[1],
);
const build = path.join(root, "dist", "firefox");

if (!existsSync(firefox)) {
  console.log(`firefox-load: no Firefox at ${firefox}, skipping`);
  process.exit(0);
}
if (!existsSync(path.join(build, "manifest.json"))) {
  console.error("firefox-load: dist/firefox is missing. Run npm run build first.");
  process.exit(1);
}

/**
 * Detached, so the whole tree can be signalled at once: the runner starts the
 * browser, the browser starts several processes of its own, and signalling only
 * the first of them leaves the rest running and this script waiting for an exit
 * that never comes.
 */
const child = spawn(
  "npx",
  ["web-ext", "run", "--source-dir", build, "--firefox", firefox, "--no-input", "--no-reload", "--args=-headless"],
  { cwd: root, detached: true },
);

function stopTree(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

let output = "";
const collect = (chunk) => {
  output += String(chunk);
};
child.stdout.on("data", collect);
child.stderr.on("data", collect);

const stop = setTimeout(() => stopTree("SIGTERM"), seconds * 1000);
// A browser that will not go quietly must not hold this script open either.
const giveUp = setTimeout(() => stopTree("SIGKILL"), (seconds + 8) * 1000);
await Promise.race([
  new Promise((resolve) => {
    child.on("close", resolve);
    child.on("error", (error) => {
      output += String(error);
      resolve();
    });
  }),
  new Promise((resolve) => setTimeout(resolve, (seconds + 12) * 1000)),
]);
clearTimeout(stop);
clearTimeout(giveUp);
stopTree("SIGKILL");

const installed = /Installed .* as a temporary add-on/.test(output);
const problems = output
  .split("\n")
  .filter((line) => /\b(error|exception|failed|refus)/i.test(line) && !/reload/i.test(line));

console.log(output.trim().split("\n").slice(0, 12).join("\n"));

if (!installed) {
  console.error("\nfirefox-load: Firefox did not install the package. The output above says why.");
  process.exit(1);
}
if (problems.length > 0) {
  console.error("\nfirefox-load: the install reported problems:");
  for (const line of problems) console.error(`  ${line.trim()}`);
  process.exit(1);
}
console.log(`\nfirefox-load: the package installs in ${path.basename(firefox)} as a temporary add-on`);
