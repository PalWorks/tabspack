/**
 * Local smoke check against a real Chromium with the built extension loaded.
 *
 *   node scripts/smoke.mjs [--headed] [--shots=dir]
 *
 * This is a developer aid, not part of `npm test`: it needs a browser and
 * Playwright, which CI does not install. It exercises the popup and the manager
 * page against the real extension APIs, because a green unit suite proves
 * nothing about a permission, a badge or a tab strip. It skips cleanly when
 * Playwright is not installed.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const shotsArg = process.argv.find((a) => a.startsWith("--shots="));
const shots = shotsArg ? path.resolve(shotsArg.split("=")[1]) : path.join(root, ".tmp", "shots");
const headed = process.argv.includes("--headed");

const require = createRequire(import.meta.url);
let chromium;
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  ({ chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] })));
} catch {
  console.log("smoke: playwright is not installed, skipping");
  process.exit(0);
}

/** The newest chromium-<build> directory Playwright has downloaded, if any. */
function findBundledChromium() {
  const base = path.join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  const builds = readdirSync(base)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    const candidate = path.join(base, build, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
    const mac = path.join(base, build, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium");
    if (existsSync(mac)) return mac;
  }
  return null;
}

function unpackedExtensionId(absolutePath) {
  const digest = createHash("sha256").update(absolutePath, "utf8").digest("hex");
  return [...digest.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const failures = [];
function check(name, condition, detail) {
  if (condition) console.log(`  ok    ${name}`);
  else {
    console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ""}`);
    failures.push(name);
  }
}

const profile = await mkdtemp(path.join(tmpdir(), "tabspack-profile-"));
await rm(shots, { recursive: true, force: true });
await mkdir(shots, { recursive: true });

const extension = path.join(root, "dist", "chrome");
/**
 * Playwright's bundled Chromium is used rather than the system Chrome, because
 * current Chrome releases ignore --load-extension entirely, and rather than the
 * bundled headless shell, which cannot load extensions at all. Extensions also
 * require a persistent context, never a plain browser launch.
 */
const executablePath = findBundledChromium();
const context = await chromium.launchPersistentContext(profile, {
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  headless: !headed,
  args: [
    // Recent Chrome ignores --load-extension unless this hardening feature is
    // turned off. Without it the browser starts with no extension at all.
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});

try {
  // An unpacked extension's id is derived from its absolute path, so it can be
  // computed rather than waited for: in headless Chrome the service worker may
  // not start until a page wakes it.
  const extensionId = unpackedExtensionId(extension);
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 5_000 }).catch(() => null));
  console.log(`smoke: extension ${extensionId}${worker ? " (service worker running)" : ""}`);

  // A session worth exporting: three tabs, one of them pinned by the browser.
  const pages = [
    "https://example.com/one",
    "https://example.com/two",
    "https://example.com/three",
  ];
  for (const url of pages) {
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: `<title>${url}</title>ok` }),
    );
    await page.goto(url).catch(() => undefined);
  }

  const popup = await context.newPage();
  const errors = [];
  popup.on("pageerror", (error) => errors.push(String(error)));
  popup.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(() => !document.querySelector("#export")?.hasAttribute("disabled"), {
    timeout: 10_000,
  });

  const summary = await popup.textContent("#summary");
  const exportLabel = await popup.textContent("#export");
  check("popup reports a tab count", /\d+ tabs?/.test(summary ?? ""), summary ?? "");
  check("primary button names the action and the count", /^Export \d+ tabs?$/.test(exportLabel ?? ""), exportLabel ?? "");
  check("popup loads without a console error", errors.length === 0, errors[0]);

  await popup.screenshot({ path: path.join(shots, "popup-light.png") });
  await popup.emulateMedia({ colorScheme: "dark" });
  await popup.screenshot({ path: path.join(shots, "popup-dark.png") });
  await popup.emulateMedia({ colorScheme: "light" });

  // Keyboard path: the segmented control must behave like a radio group.
  await popup.focus("#scope button[aria-checked='true']");
  await popup.keyboard.press("ArrowRight");
  const checked = await popup.getAttribute("#scope button[data-value='current_window']", "aria-checked");
  check("arrow keys move the segmented selection", checked === "true", `aria-checked=${checked}`);

  const download = popup.waitForEvent("download", { timeout: 15_000 });
  await popup.click("#export");
  const file = await download;

  /**
   * The on disk name cannot be observed here: Playwright intercepts downloads
   * and renames them into its own artifacts directory, and the blob URL's
   * suggested name is a UUID either way. What this check can prove is that the
   * download was started by this extension through the downloads API rather
   * than by an anchor fallback. The filename itself is covered deterministically
   * by the naming unit tests.
   */
  let record = null;
  if (worker) {
    for (let attempt = 0; attempt < 40 && !record; attempt += 1) {
      record = await worker.evaluate(async () => {
        const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 1 });
        const item = items[0];
        return item ? { byExtensionId: item.byExtensionId ?? null, state: item.state } : null;
      });
      if (!record) await popup.waitForTimeout(250);
    }
  }
  check(
    "export starts a download through the downloads API",
    record !== null && record.byExtensionId === extensionId,
    JSON.stringify(record),
  );

  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  check("the file declares the format and version", parsed.format === "tabspack" && parsed.schemaVersion === 1);
  check("the file carries the open tabs", (parsed.counts?.tabs ?? 0) >= 3, JSON.stringify(parsed.counts));
  check(
    "provenance names the browser it came from",
    typeof parsed.source?.browser === "string" && parsed.source.browser.length > 0,
    JSON.stringify(parsed.source),
  );

  await popup.waitForSelector("#report .headline");
  const report = await popup.textContent("#report");
  check("the report states the outcome", /Saved \d+ tabs?/.test(report ?? ""), report ?? "");
  await popup.screenshot({ path: path.join(shots, "popup-after-export.png") });

  const manager = await context.newPage();
  const managerErrors = [];
  manager.on("pageerror", (error) => managerErrors.push(String(error)));
  await manager.goto(`chrome-extension://${extensionId}/manager.html`);
  await manager.waitForFunction(() => !document.querySelector("#export")?.hasAttribute("disabled"), {
    timeout: 10_000,
  });
  await manager.setViewportSize({ width: 1100, height: 900 });
  check("manager loads without a console error", managerErrors.length === 0, managerErrors[0]);

  const incognitoDisabled = await manager.isDisabled("#opt-incognito");
  const incognitoHint = await manager.textContent("#incognito-hint");
  check(
    "private windows is disabled with a stated reason",
    incognitoDisabled && (incognitoHint ?? "").length > 0,
    incognitoHint ?? "",
  );

  await manager.click("#copy");
  // A textarea's value is not a child node, so :empty never changes: poll the
  // value instead.
  await manager.waitForFunction(
    () => (document.querySelector("#output")?.value ?? "").length > 0,
    { timeout: 10_000 },
  );
  const output = await manager.inputValue("#output");
  await manager.waitForSelector("#report .headline", { timeout: 10_000 });
  const managerReport = await manager.textContent("#report");
  check(
    "the manager states the outcome of a copy",
    /Copied \d+ tabs?/.test(managerReport ?? ""),
    managerReport ?? "",
  );
  check("the output panel shows the exact bytes", output.trimStart().startsWith("{"), output.slice(0, 40));
  await manager.screenshot({ path: path.join(shots, "manager-light.png"), fullPage: true });
  await manager.emulateMedia({ colorScheme: "dark" });
  await manager.screenshot({ path: path.join(shots, "manager-dark.png"), fullPage: true });

  console.log(`smoke: screenshots in ${path.relative(root, shots)}`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nsmoke: ${failures.length} check${failures.length === 1 ? "" : "s"} failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
