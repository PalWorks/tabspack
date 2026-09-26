/**
 * The cross browser matrix, TESTING.md Table X2, task T-507.
 *
 *   node scripts/matrix.mjs --target=chrome|edge|chromium [--headed] [--restore=200]
 *
 * This runs the rows that `npm run smoke` deliberately leaves out, against the
 * real browsers installed on this machine rather than against the one Playwright
 * downloads. How an extension gets into each of them differs, and finding that
 * out was most of the work:
 *
 *   Chrome 154   ignores `--load-extension` entirely, but accepts the CDP
 *                command `Extensions.loadUnpacked`, which is the supported
 *                replacement. Measured on 2026-09-25.
 *   Edge 153     still honours `--load-extension`.
 *   Chromium     Chrome for Testing, what Playwright downloads, same as smoke.
 *
 * Firefox is a different protocol and lives in `scripts/matrix-firefox.mjs`.
 */
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { quietDesktop } from "./lib/no-mail-client.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
let chromium;
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  ({ chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] })));
} catch {
  console.log("matrix: playwright is not installed, skipping");
  process.exit(0);
}

const arg = (name, fallback) =>
  (process.argv.find((item) => item.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];

const target = arg("target", "chrome");
const headed = process.argv.includes("--headed");
const restoreWanted = Number(arg("restore", "200"));
const keepProfile = arg("profile", "");

function bundledChromium() {
  const base = path.join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((name) => name.startsWith("chromium-")).sort().reverse()) {
    const candidate = path.join(base, dir, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const TARGETS = {
  chrome: { binary: "/usr/bin/google-chrome", how: "cdp", label: "Chrome" },
  edge: { binary: "/usr/bin/microsoft-edge", how: "switch", label: "Edge" },
  chromium: { binary: bundledChromium(), how: "switch", label: "Chrome for Testing" },
};

const plan = TARGETS[target];
if (!plan?.binary || !existsSync(plan.binary)) {
  console.log(`matrix: ${target} is not installed here, skipping`);
  process.exit(0);
}

const results = [];
function row(name, state, detail) {
  const verdict = state === "skip" ? "skip" : state === true || state === "pass" ? "pass" : "fail";
  results.push({ name, state: verdict, detail });
  const mark = verdict === "pass" ? "ok  " : verdict === "skip" ? "skip" : "FAIL";
  console.log(`  ${mark}  ${name}${detail ? ` · ${detail}` : ""}`);
}

/**
 * `--grant-groups` loads a copy of the build whose `tabGroups` permission is
 * required rather than optional. The prompt cannot be answered by a driver, and
 * the rows about groups are about what a restore does once the permission is
 * there, not about the prompt: that one stays a line for a person.
 */
const grantGroups = process.argv.includes("--grant-groups");
let extension = path.join(root, "dist", "chrome");
if (grantGroups) {
  const copy = path.join(root, ".tmp", "matrix-ext");
  await rm(copy, { recursive: true, force: true });
  execSync(`cp -r ${JSON.stringify(extension)} ${JSON.stringify(copy)}`);
  const manifestPath = path.join(copy, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.permissions = [...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])];
  delete manifest.optional_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  extension = copy;
}
const downloads = await mkdtemp(path.join(tmpdir(), "matrix-dl-"));
const profile = keepProfile || (await mkdtemp(path.join(tmpdir(), "matrix-profile-")));
await mkdir(downloads, { recursive: true });

/** Starts the browser and returns everything the rows need. */
async function start(profileDir) {
  // Written before the browser starts, or it is overwritten by the defaults.
  await mkdir(path.join(profileDir, "Default"), { recursive: true });
  await writeFile(
    path.join(profileDir, "Default", "Preferences"),
    JSON.stringify({
      download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
      savefile: { default_directory: downloads },
      profile: { default_content_setting_values: { automatic_downloads: 1 } },
    }),
    "utf8",
  );
  const port = 9500 + Math.floor(Math.random() * 300);
  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    ...(headed ? [] : ["--headless=new"]),
    ...(plan.how === "switch"
      ? [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`]
      : []),
    "about:blank",
  ];
  // The installed Chrome and Edge are the maintainer's own browsers, so the
  // guard matters more here, not less: scripts/lib/no-mail-client.mjs.
  const desktop = await quietDesktop();
  const child = spawn(plan.binary, args, { stdio: "ignore", detached: true, env: desktop.env });

  let browser = null;
  for (let attempt = 0; attempt < 40 && !browser; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
  }
  if (!browser) throw new Error(`${plan.label} did not answer on the debugging port`);

  const session = await browser.newBrowserCDPSession();
  let id = null;
  if (plan.how === "cdp") {
    id = (await session.send("Extensions.loadUnpacked", { path: extension })).id;
  }

  const context = browser.contexts()[0];
  /*
   * Edge ships extensions of its own, so the id has to be the one whose path is
   * this build. `chrome://extensions-internals` is a JSON dump of every loaded
   * extension, which is the only place that mapping is visible.
   */
  if (!id) {
    const probe = await context.newPage();
    await probe.goto("chrome://extensions-internals").catch(() => undefined);
    id = await probe
      .evaluate((wanted) => {
        const text = document.body.innerText;
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          return null;
        }
        const list = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
        const hit = list.find(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            JSON.stringify(item).includes(wanted),
        );
        return hit?.id ?? null;
      }, extension)
      .catch(() => null);
    await probe.close();
  }
  if (!id) throw new Error(`${plan.label} did not load the extension`);

  /*
   * Playwright takes over downloads on every context it connects to, which
   * renames each file to a UUID: that is the limitation `npm run smoke` lives
   * with. Handing the behaviour back to the browser lets the profile preference
   * above decide where the file goes, and lets the browser name it, so this run
   * can assert the name TabsPack asked for.
   */
  await session.send("Browser.setDownloadBehavior", { behavior: "default" });

  const worker = async (fn, argument) => {
    const workers = context.serviceWorkers();
    let sw = workers.find((candidate) => candidate.url().includes(id));
    if (!sw) {
      // The worker starts on demand: opening a page of the extension wakes it.
      const waker = await context.newPage();
      await waker.goto(`chrome-extension://${id}/popup.html`);
      await waker.close();
      sw = context.serviceWorkers().find((candidate) => candidate.url().includes(id));
    }
    if (!sw) throw new Error("no service worker");
    return await sw.evaluate(fn, argument);
  };

  return { browser, context, session, id, child, port, worker };
}

let rig = await start(profile);
row("load unpacked, extension id resolved", "pass", `${plan.label} · ${rig.id}`);

/* A console error on any surface is a failure of the load row ------------- */
const consoleErrors = [];
const ours = (url) => url.startsWith("chrome-extension://") || url.startsWith("moz-extension://");
rig.context.on("page", (page) => {
  page.on("pageerror", (error) => {
    if (ours(page.url())) consoleErrors.push(`${page.url()}: ${String(error)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && ours(page.url())) consoleErrors.push(`${page.url()}: ${message.text()}`);
  });
});

/* Row: a session worth exporting ----------------------------------------- */

const SEED = [
  { url: "https://example.com/one", title: "One", pinned: true },
  { url: "https://example.com/two", title: "Two", group: "Reading" },
  { url: "https://example.com/three", title: "Three", group: "Reading" },
  { url: "https://example.com/four", title: "Four" },
];

async function seed() {
  return await rig.worker(async (seedTabs) => {
    const made = await chrome.windows.create({ url: "https://example.com/first", focused: true });
    const windowId = made.id;
    const ids = [];
    for (const item of seedTabs) {
      const tab = await chrome.tabs.create({ windowId, url: item.url, pinned: !!item.pinned, active: false });
      ids.push({ id: tab.id, group: item.group ?? null });
    }
    const second = await chrome.windows.create({ url: "https://example.net/second", focused: false });
    let grouped = false;
    const inReading = ids.filter((entry) => entry.group === "Reading").map((entry) => entry.id);
    if (chrome.tabs.group && inReading.length > 0) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: inReading, createProperties: { windowId } });
        if (chrome.tabGroups?.update) {
          await chrome.tabGroups.update(groupId, { title: "Reading", color: "green", collapsed: true });
        }
        grouped = true;
      } catch {
        grouped = false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { windowId, second: second.id, grouped };
  }, SEED);
}

const seeded = await seed();

async function newExtensionPage(page) {
  const opened = await rig.context.newPage();
  await opened.goto(`chrome-extension://${rig.id}/${page}`);
  return opened;
}

/* Row: export all windows ------------------------------------------------ */

const popup = await newExtensionPage("popup.html");
await popup.waitForFunction(() => !document.querySelector("#export")?.hasAttribute("disabled"), {
  timeout: 20_000,
});
const downloadPromise = rig.context.waitForEvent("page", { timeout: 1 }).catch(() => null);
await popup.click("#export");
await popup.waitForSelector("#report .headline", { timeout: 30_000 });
const exportReport = (await popup.textContent("#report")) ?? "";
await downloadPromise;

/*
 * The file itself, read from disk, is the only proof that matters. Where it
 * landed is the browser's decision, so the browser is asked: `downloads.search`
 * returns the absolute path it actually wrote.
 */
let exported = null;
let exportedPath = null;
for (let attempt = 0; attempt < 60 && !exported; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  exportedPath = await rig
    .worker(async () => {
      const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 5 });
      const done = items.find((item) => item.state === "complete" && (item.filename ?? "").endsWith(".tabspack.json"));
      return done?.filename ?? null;
    })
    .catch(() => null);
  if (exportedPath && existsSync(exportedPath)) {
    exported = JSON.parse(await readFile(exportedPath, "utf8"));
  }
}
row(
  "export all windows writes a file the browser named",
  exported !== null && exported.format === "tabspack",
  exported ? `${exported.counts.windows} windows, ${exported.counts.tabs} tabs, ${exported.counts.groups} groups` : exportReport,
);
row(
  "the file on disk carries the name TabsPack asked for",
  /tabspack-\d{8}-\d{4}\.tabspack\.json$/.test(exportedPath ?? ""),
  exportedPath ?? "no file",
);
row(
  "the exported file carries pinned tabs and window bounds",
  Boolean(
    exported?.windows?.some((win) => win.tabs.some((tab) => tab.pinned)) &&
      exported?.windows?.some((win) => win.bounds?.width > 0),
  ),
  exported ? JSON.stringify(exported.windows[0]?.bounds ?? {}) : "",
);
row(
  "groups are captured with title, colour and collapsed state",
  seeded.grouped
    ? Boolean(exported?.windows?.some((win) => win.groups?.some((group) => group.title === "Reading" && group.color === "green")))
    : false,
  seeded.grouped ? JSON.stringify(exported?.windows?.flatMap((win) => win.groups ?? [])) : "the seed could not group tabs",
);
await popup.close();

/* Row: clipboard from a page --------------------------------------------- */

const manager = await newExtensionPage("manager.html");
await manager.waitForFunction(() => !document.querySelector("#export")?.hasAttribute("disabled"), {
  timeout: 20_000,
});
await rig.session.send("Browser.grantPermissions", {
  origin: `chrome-extension://${rig.id}`,
  permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
});
await manager.click("#copy");
await manager.waitForSelector("#report .headline", { timeout: 20_000 });
const copied = await manager.evaluate(() => navigator.clipboard.readText().catch(() => ""));
row(
  "copy puts the pack on the clipboard, from the page",
  copied.trimStart().startsWith("{") && copied.includes("tabspack"),
  `${copied.length} characters`,
);

/* Row: import, restore into new windows, bounds, groups, unloading -------- */

const packPath = path.join(downloads, "matrix.tabspack.json");
const pack = {
  format: "tabspack",
  schemaVersion: 1,
  exportedAt: "2026-09-25T08:00:00.000Z",
  name: "Matrix pack",
  counts: { windows: 1, tabs: 5, groups: 1 },
  windows: [
    {
      id: "w1",
      type: "normal",
      focused: true,
      state: "normal",
      bounds: { left: 60, top: 60, width: 900, height: 700 },
      groups: [{ id: "g1", title: "Restored group", color: "purple", collapsed: true }],
      tabs: [
        { index: 0, url: "https://example.com/r-pinned", title: "Pinned", pinned: true },
        { index: 1, url: "https://example.com/r-grouped-a", title: "Grouped A", groupId: "g1" },
        { index: 2, url: "https://example.com/r-grouped-b", title: "Grouped B", groupId: "g1" },
        { index: 3, url: "https://example.com/r-plain", title: "Plain", active: true },
        {
          index: 4,
          url: "chrome-extension://ahkbmjhfoplmfkpncgoedjgkajkehcgo/suspended.html#ttl=%F0%9F%92%A4%20Parked&pos=0&uri=https://example.com/r-was-suspended",
          title: "💤 Parked",
        },
      ],
    },
  ],
};
await writeFile(packPath, JSON.stringify(pack, null, 2), "utf8");

await manager.click("#tab-import");
await manager.setInputFiles("#file", packPath);
await manager.waitForSelector("#preview:not([hidden])", { timeout: 20_000 });
const fileMeta = (await manager.textContent("#file-meta")) ?? "";
row(
  "a suspended tab is recovered on import",
  /1 recovered from a tab suspender/.test(fileMeta),
  fileMeta.slice(0, 120),
);

const unloadDefault = await manager.isChecked("#opt-unload");
row("restored tabs are unloaded by default", unloadDefault);

const windowsBefore = await rig.worker(async () => (await chrome.windows.getAll({})).length);
await manager.click("#restore");
await manager
  .waitForFunction(() => /Restored/.test(document.querySelector("#restore-report")?.textContent ?? ""), {
    timeout: 120_000,
  })
  .catch(() => undefined);
const restoreReport = (await manager.textContent("#restore-report")) ?? "";
row("restore reports its outcome", /Restored \d+ tabs?/.test(restoreReport), restoreReport.slice(0, 120));

/*
 * The report appears when the engine has finished asking, which is a moment
 * before the browser has finished answering. The run waits for the tabs the
 * pack names to appear rather than reading the strip once and calling the
 * difference a defect.
 */
for (let attempt = 0; attempt < 30; attempt += 1) {
  const arrived = await rig.worker(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((tab) => (tab.url || tab.pendingUrl || "").includes("/r-")).length;
  });
  if (arrived >= 5) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const after = await rig.worker(async () => {
  const windows = await chrome.windows.getAll({ populate: true });
  const groups = chrome.tabGroups ? await chrome.tabGroups.query({}) : [];
  return {
    windows: windows.length,
    tabs: windows.flatMap((win) => win.tabs ?? []).map((tab) => ({
      url: tab.url || tab.pendingUrl || "",
      pinned: tab.pinned,
      active: tab.active,
      discarded: tab.discarded,
      groupId: tab.groupId ?? -1,
    })),
    bounds: windows.map((win) => ({ width: win.width, height: win.height, state: win.state })),
    groups: groups.map((group) => ({ title: group.title, color: group.color, collapsed: group.collapsed })),
  };
});

const urls = after.tabs.map((tab) => tab.url);
row("restore opened a new window", after.windows > windowsBefore, `${windowsBefore} before, ${after.windows} after`);
row(
  "every address in the pack was opened",
  ["r-pinned", "r-grouped-a", "r-grouped-b", "r-plain", "r-was-suspended"].every((part) =>
    urls.some((url) => url.includes(part)),
  ),
  urls.filter((url) => url.includes("/r-")).length + " of 5",
);
row(
  "the suspender's own page was never opened",
  urls.every((url) => !url.includes("suspended.html")),
);
row("the pinned tab came back pinned", after.tabs.some((tab) => tab.pinned && tab.url.includes("r-pinned")));

const restoredBounds = after.bounds.find((item) => Math.abs((item.width ?? 0) - 900) < 40);
row(
  "window bounds from the pack were applied",
  Boolean(restoredBounds),
  JSON.stringify(after.bounds),
);

const restoredGroup = after.groups.find((group) => group.title === "Restored group");
row(
  "the group came back with its title, colour and collapsed state",
  Boolean(restoredGroup && restoredGroup.color === "purple" && restoredGroup.collapsed === true),
  JSON.stringify(after.groups),
);

const restoredTabs = after.tabs.filter((tab) => tab.url.includes("/r-"));
const unloaded = restoredTabs.filter((tab) => tab.discarded);
row(
  "restored tabs are actually unloaded, and the browser survived it",
  unloaded.length >= restoredTabs.length - 2,
  `${unloaded.length} of ${restoredTabs.length} unloaded`,
);
const reportedUnloaded = Number(/(\d+) left asleep/.exec(restoreReport)?.[1] ?? "-1");
row(
  "the report's unloaded count is what the browser actually shows",
  reportedUnloaded === unloaded.length,
  `${reportedUnloaded} reported, ${unloaded.length} in the browser`,
);

/* Row: a large restore with unloading on ---------------------------------- */

if (restoreWanted > 0) {
  const bigPath = path.join(downloads, "matrix-large.tabspack.json");
  const big = {
    format: "tabspack",
    schemaVersion: 1,
    exportedAt: "2026-09-25T08:00:00.000Z",
    counts: { windows: 1, tabs: restoreWanted, groups: 0 },
    windows: [
      {
        id: "w1",
        type: "normal",
        /*
         * A port nothing listens on, so two hundred tabs cost two hundred
         * instant refusals rather than two hundred requests to somebody's site.
         * A refused page still commits its address, which is what this row is
         * about. Not a low port: Firefox blocks those outright and shows a
         * blocked page whose address is not the one that was asked for.
         */
        tabs: Array.from({ length: restoreWanted }, (_, index) => ({
          index,
          url: `http://127.0.0.1:9999/large/${index}`,
          title: `Tab ${index}`,
          ...(index === 0 ? { active: true } : {}),
        })),
      },
    ],
  };
  await writeFile(bigPath, JSON.stringify(big), "utf8");

  const started = Date.now();
  await manager.setInputFiles("#file", bigPath);
  await manager.waitForFunction(
    (count) => new RegExp(`${count} tabs`).test(document.querySelector("#file-meta")?.textContent ?? ""),
    restoreWanted,
    { timeout: 60_000 },
  );
  await manager.click("#restore");
  let outcome = "";
  try {
    await manager.waitForFunction(
      () => /Restored/.test(document.querySelector("#restore-report")?.textContent ?? ""),
      { timeout: 300_000 },
    );
    outcome = (await manager.textContent("#restore-report")) ?? "";
  } catch (error) {
    outcome = `no outcome: ${String(error).split("\n")[0]}`;
  }
  const alive = await rig
    .worker(async () => (await chrome.tabs.query({})).length)
    .catch(() => null);
  row(
    `restoring ${restoreWanted} tabs with unloading on does not take the browser down`,
    alive !== null && /Restored/.test(outcome),
    `${Math.round((Date.now() - started) / 1000)}s · ${alive ?? "browser gone"} tabs open · ${outcome.slice(0, 60)}`,
  );

  const loadedNow = await rig
    .worker(async () => {
      const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:9999/large/*" });
      return { total: tabs.length, loaded: tabs.filter((tab) => !tab.discarded).length };
    })
    .catch(() => null);
  row(
    "a large restore leaves almost everything unloaded",
    loadedNow !== null && loadedNow.loaded <= 4,
    loadedNow ? `${loadedNow.loaded} loaded of ${loadedNow.total}` : "browser gone",
  );
}

/* Row: the browser's own Options link lands on the settings pane ----------- */

/*
 * Settings are a pane of the manager page now, and `options_ui.page` carries the
 * fragment that selects it: ADR-028. Whether a browser accepts a fragment there
 * at all is the one thing that decision rests on, so it is measured rather than
 * assumed. This is the browser's own link, not the extension's gear.
 */
{
  const landed = await rig
    .worker(async () => {
      const before = (await chrome.tabs.query({})).map((tab) => tab.id);
      await chrome.runtime.openOptionsPage();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = await chrome.tabs.query({});
      const fresh = after.filter((tab) => !before.includes(tab.id));
      const mine = fresh.length > 0 ? fresh : after.filter((tab) => (tab.url ?? "").includes("manager.html"));
      return (mine[mine.length - 1]?.url ?? "") || (mine[mine.length - 1]?.pendingUrl ?? "");
    })
    .catch((error) => `failed: ${String(error).split("\n")[0]}`);

  row(
    "the browser's own Options link opens the settings pane",
    typeof landed === "string" && landed.includes("manager.html#settings"),
    landed || "nothing opened",
  );
}

/* Row: a page that is slow to commit is not unloaded before it does --------- */

/*
 * The row that would have caught ADR-026, and did not exist when it shipped.
 *
 * Every other restore row here points at a port nothing listens on, because two
 * hundred real requests to somebody's site is not a test. A refused connection
 * commits its address in under a millisecond, which is the one case where
 * unloading a tab too early cannot be seen. A real remote page takes a hundred
 * times longer, and a tab unloaded in that window comes back blank for good.
 *
 * So this row serves the pages itself, slowly, and asserts the one thing that
 * matters: no tab came back without its address.
 */
{
  const SLOW_MS = 400;
  const SLOW_TABS = 24;
  const server = createServer((request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><title>slow ${request.url}</title>`);
    }, SLOW_MS);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const slowPort = server.address().port;

  const slowPath = path.join(downloads, "matrix-slow.tabspack.json");
  await writeFile(
    slowPath,
    JSON.stringify({
      format: "tabspack",
      schemaVersion: 1,
      exportedAt: "2026-09-25T08:00:00.000Z",
      counts: { windows: 1, tabs: SLOW_TABS, groups: 0 },
      windows: [
        {
          id: "w1",
          type: "normal",
          tabs: Array.from({ length: SLOW_TABS }, (_, index) => ({
            index,
            url: `http://127.0.0.1:${slowPort}/slow/${index}`,
            title: `Slow ${index}`,
            ...(index === 0 ? { active: true } : {}),
          })),
        },
      ],
    }),
    "utf8",
  );

  await manager.setInputFiles("#file", slowPath);
  await manager.waitForFunction(
    (count) => new RegExp(`${count} tabs`).test(document.querySelector("#file-meta")?.textContent ?? ""),
    SLOW_TABS,
    { timeout: 60_000 },
  );
  await manager.click("#restore");
  let slowOutcome = "";
  try {
    await manager.waitForFunction(
      () => /Restored/.test(document.querySelector("#restore-report")?.textContent ?? ""),
      { timeout: 300_000 },
    );
    slowOutcome = (await manager.textContent("#restore-report")) ?? "";
  } catch (error) {
    slowOutcome = `no outcome: ${String(error).split("\n")[0]}`;
  }

  const slow = await rig
    .worker(async (port) => {
      const all = await chrome.tabs.query({});
      const mine = all.filter((tab) => (tab.url ?? "").includes(`127.0.0.1:${port}/slow/`));
      const blank = all.filter((tab) => (tab.url ?? "") === "" && (tab.pendingUrl ?? "") === "");
      return { held: mine.length, blank: blank.length, unloaded: mine.filter((tab) => tab.discarded).length };
    }, slowPort)
    .catch(() => null);

  row(
    "a page slow to commit keeps its address through the unload",
    slow !== null && slow.blank === 0 && slow.held === SLOW_TABS,
    slow
      ? `${slow.held} of ${SLOW_TABS} addresses held · ${slow.blank} blank · ${slow.unloaded} unloaded`
      : "browser gone",
  );
  server.close();
}

/* Row: snapshots survive a browser restart -------------------------------- */

const snapshotName = `matrix-${Date.now()}`;
await manager.click("#tab-snapshots");
await manager.fill("#snapshot-name", snapshotName);
await manager.click("#save-snapshot");
await manager
  .waitForFunction(
    (name) => (document.querySelector("#snapshot-list")?.textContent ?? "").includes(name),
    snapshotName,
    { timeout: 30_000 },
  )
  .catch(() => undefined);
const snapshotReport = (await manager.textContent("#snapshot-report")) ?? "";
const storedBefore = await rig.worker(async () => {
  const all = await chrome.storage.local.get(null);
  const index = all["snapshots"];
  return { count: Array.isArray(index) ? index.length : 0, keys: Object.keys(all) };
});
row(
  "a snapshot is written to local storage",
  storedBefore.count > 0,
  `${snapshotReport.slice(0, 80)} · ${JSON.stringify(storedBefore.keys)}`,
);

await manager.close();
await rig.browser.close();
try {
  process.kill(-rig.child.pid, "SIGKILL");
} catch {
  /* already gone */
}
await new Promise((resolve) => setTimeout(resolve, 2000));

rig = await start(profile);
const storedAfter = await rig.worker(async (name) => {
  const all = await chrome.storage.local.get(null);
  const index = Array.isArray(all["snapshots"]) ? all["snapshots"] : [];
  return { count: index.length, named: index.some((item) => item.name === name) };
}, snapshotName);
row(
  "snapshots survive a browser restart",
  storedAfter.count >= storedBefore.count && storedBefore.count > 0,
  JSON.stringify(storedAfter),
);

/* Row: a keyboard command actually fires --------------------------------- */

/**
 * The browser handles a command before any page or driver sees it, so the only
 * way to press one is to press it: `xdotool` sends the key to the real window
 * on the X display this run is using. Headed only, for the obvious reason.
 */
if (process.argv.includes("--keys") && headed) {
  const send = (combo) => {
    const windowId = execSync(
      `DISPLAY=${process.env.DISPLAY} xdotool search --onlyvisible --class "${target === "edge" ? "edge" : "chrome"}" | tail -1`,
      { encoding: "utf8" },
    ).trim();
    execSync(
      `DISPLAY=${process.env.DISPLAY} xdotool windowactivate --sync ${windowId} key --clearmodifiers ${combo}`,
    );
  };

  /*
   * A control first: if a plain Ctrl+T does not open a tab, this display cannot
   * deliver a keystroke to this browser at all, and the rows below would be
   * measuring the rig rather than the product. Measured on Xvfb with metacity:
   * Chrome ignores XTEST keys there, so the rows report as skipped and the
   * shortcuts stay a line for a person in TESTING.md Table X2.
   */
  const tabsBefore = await rig.worker(async () => (await chrome.tabs.query({})).length);
  send("ctrl+t");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const tabsAfter = await rig.worker(async () => (await chrome.tabs.query({})).length);
  const keysArrive = tabsAfter > tabsBefore;

  if (!keysArrive) {
    row("Alt+Shift+E exports every window, with no page involved", "skip", "this display does not deliver keystrokes to the browser");
    row("Alt+Shift+S saves a snapshot, with no page involved", "skip", "same");
  }

  const before = keysArrive ? await rig.worker(async () => (await chrome.downloads.search({ limit: 50 })).length) : 0;
  if (keysArrive) send("alt+shift+e");
  let after = before;
  for (let attempt = 0; keysArrive && attempt < 40 && after === before; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    after = await rig.worker(async () => (await chrome.downloads.search({ limit: 50 })).length);
  }
  if (keysArrive) {
    row("Alt+Shift+E exports every window, with no page involved", after > before, `${before} downloads before, ${after} after`);
  }

  const snapsBefore = !keysArrive ? 0 : await rig.worker(async () => {
    const index = (await chrome.storage.local.get("snapshots")).snapshots;
    return Array.isArray(index) ? index.length : 0;
  });
  if (keysArrive) send("alt+shift+s");
  let snapsAfter = snapsBefore;
  for (let attempt = 0; keysArrive && attempt < 40 && snapsAfter === snapsBefore; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    snapsAfter = await rig.worker(async () => {
      const index = (await chrome.storage.local.get("snapshots")).snapshots;
      return Array.isArray(index) ? index.length : 0;
    });
  }
  if (keysArrive) {
    row(
      "Alt+Shift+S saves a snapshot, with no page involved",
      snapsAfter > snapsBefore,
      `${snapsBefore} snapshots before, ${snapsAfter} after`,
    );
  }
}

/* Row: the keyboard commands are declared and bound ------------------------ */

const commands = await rig.worker(async () => await chrome.commands.getAll());
row(
  "every keyboard command is declared with the shortcut the browser accepted",
  commands.filter((command) => command.shortcut).length >= 3,
  commands.map((command) => `${command.name}=${command.shortcut || "none"}`).join(" "),
);

row(
  "no console error on any surface",
  consoleErrors.length === 0,
  consoleErrors[0] ?? "",
);

await rig.browser.close();
try {
  process.kill(-rig.child.pid, "SIGKILL");
} catch {
  /* already gone */
}
if (!keepProfile) await rm(profile, { recursive: true, force: true });

const failed = results.filter((item) => item.state === "fail");
const passedRows = results.filter((item) => item.state === "pass").length;
const skipped = results.filter((item) => item.state === "skip").length;
console.log(
  `\nmatrix ${plan.label}: ${passedRows} passed, ${skipped} skipped, ${failed.length} failed, of ${results.length} rows`,
);
process.exit(failed.length > 0 ? 1 : 0);
