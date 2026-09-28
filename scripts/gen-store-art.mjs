/**
 * The Chrome Web Store artwork: five screenshots, the marquee and the small
 * promo tile, plus a padded store icon.
 *
 *   node scripts/gen-store-art.mjs              capture the interface, then compose
 *   node scripts/gen-store-art.mjs --compose    compose from the last captures only
 *   node scripts/gen-store-art.mjs --capture    capture only
 *
 * Two stages, and the split is the point.
 *
 * **Capture** runs the real, built extension in a real Chromium and photographs
 * its real pages: the popup, the export pane, the import preview, a restore and
 * the snapshots pane. The session in them is the demo one in
 * assets/promo/demo-session.mjs. Every page request is answered here with a page
 * carrying the demo title, so a capture run never reaches the internet, and the
 * browser is given no way to start a desktop application
 * (scripts/lib/no-mail-client.mjs).
 *
 * One thing is staged and it is said here rather than hidden: the last-opened
 * time of each tab. A browser sets that itself and no API can, so the export
 * pane is fed the demo session's ages through a wrapper on `windows.getAll`.
 * The page, the code and the wording are the shipped ones.
 *
 * **Compose** lays the captures into designed frames, from
 * assets/promo/art.html, and writes the PNGs the dashboard takes into
 * assets/store/. Composing is cheap and deterministic, so a change of headline
 * does not need a browser session.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { quietDesktop } from "./lib/no-mail-client.mjs";
import { DEMO_WINDOWS, demoIndex, demoPack } from "../assets/promo/demo-session.mjs";

const root = path.resolve(import.meta.dirname, "..");
const captures = path.join(root, "assets", "promo", "captures");
const store = path.join(root, "assets", "store");
const composeOnly = process.argv.includes("--compose");
const captureOnly = process.argv.includes("--capture");

const require = createRequire(import.meta.url);
let chromium;
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  ({ chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] })));
} catch {
  console.log("store-art: playwright is not installed, skipping");
  process.exit(0);
}

function bundledChromium() {
  const base = path.join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  const builds = readdirSync(base)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    const candidate = path.join(base, build, "chrome-linux64", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function unpackedId(absolutePath) {
  const digest = createHash("sha256").update(absolutePath, "utf8").digest("hex");
  return [...digest.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const executablePath = bundledChromium();
const desktop = await quietDesktop();

/* ----------------------------------------------------------------------- */
/* Capture                                                                  */
/* ----------------------------------------------------------------------- */

async function capture() {
  if (!existsSync(path.join(root, "dist", "chrome", "manifest.json"))) {
    console.error("store-art: run npm run build first");
    process.exit(1);
  }
  await rm(captures, { recursive: true, force: true });
  await mkdir(captures, { recursive: true });

  // The tab groups permission is granted up front in a copy of the build,
  // because no driver can answer the prompt and a screenshot of unnamed groups
  // would show the product doing less than it does.
  const work = await mkdtemp(path.join(tmpdir(), "tabspack-art-"));
  const ext = path.join(work, "ext");
  await cp(path.join(root, "dist", "chrome"), ext, { recursive: true });
  const manifestPath = path.join(ext, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), "tabGroups"])];
  manifest.optional_permissions = (manifest.optional_permissions ?? []).filter((p) => p !== "tabGroups");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const id = unpackedId(ext);

  const packPath = path.join(work, "research.tabspack.json");
  await writeFile(packPath, `${JSON.stringify(demoPack(), null, 2)}\n`);

  const context = await chromium.launchPersistentContext(path.join(work, "profile"), {
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    headless: true,
    deviceScaleFactor: 2,
    viewport: { width: 1200, height: 800 },
    colorScheme: "light",
    env: desktop.env,
    args: [
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      /*
       * No hostname resolves. This is the guarantee; the route below is only a
       * nicety. Measured on 2026-09-26: Playwright's interception does not see
       * tabs the extension opens in new windows, and the first capture runs
       * loaded the demo pages from the real sites, which showed up as
       * zotero.org and github.com redirecting to their login pages. With every
       * name failing to resolve, a request the route misses dies here.
       */
      "--host-resolver-rules=MAP * ~NOTFOUND",
    ],
  });

  // Pages the route does see get the demo title. Nothing reaches the network
  // either way: see --host-resolver-rules above.
  const index = demoIndex();
  const byHref = new Map([...index].map(([url, tab]) => [new URL(url).href, tab]));
  await context.route(/^https?:\/\//, (route) => {
    const tab = byHref.get(new URL(route.request().url()).href);
    const title = tab ? tab.title : "Page";
    return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title><body style="font:16px system-ui;padding:40px">${title.replace(/</g, "&lt;")}</body>`,
    });
  });

  // The staged ages. Applied only on the extension's own pages.
  const ages = Object.fromEntries([...byHref].map(([href, tab]) => [href, tab.days]));
  await context.addInitScript(({ ages, now }) => {
    if (location.protocol !== "chrome-extension:") return;
    const api = globalThis.chrome?.windows;
    if (!api || api.__staged) return;
    const stage = (wins) => {
      for (const win of wins ?? []) {
        for (const tab of win.tabs ?? []) {
          let href = tab.url;
          try { href = new URL(tab.url).href; } catch {}
          if (href in ages) tab.lastAccessed = now - ages[href] * 86_400_000;
        }
      }
      return wins;
    };
    const original = api.getAll.bind(api);
    const staged = (...args) => {
      const last = args[args.length - 1];
      if (typeof last === "function") return original(...args.slice(0, -1), (wins) => last(stage(wins)));
      return Promise.resolve(original(...args)).then(stage);
    };
    try { api.getAll = staged; } catch {}
    if (api.getAll !== staged) Object.defineProperty(api, "getAll", { value: staged, configurable: true, writable: true });
    api.__staged = true;
  }, { ages, now: Date.now() });

  try {
    if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker", { timeout: 15_000 });

    const meta = {};
    const manager = context.pages()[0] ?? (await context.newPage());
    // Boxes in page pixels, so the templates crop to the real card rather than
    // to a guess that drifts whenever a page scrolls a little differently.
    const boxOf = (...selectors) => manager.evaluate((sels) => {
      const rs = sels.map((s) => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean);
      const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
      const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
      return { x, y, width: right - x, height: bottom - y, scrollY: window.scrollY };
    }, selectors);
    for (const p of context.pages()) if (p !== manager) await p.close().catch(() => {});

    /*
     * 1. The import preview, into a browser with nothing else open, so the
     * preview says what it would say to somebody opening this file fresh.
     */
    // One viewport for every manager capture: after the fold below the tab
    // lives in another window, and Playwright can no longer resize it.
    await manager.setViewportSize({ width: 1200, height: 860 });
    await manager.goto(`chrome-extension://${id}/manager.html#import`);
    await manager.reload();
    await manager.setInputFiles("#file", packPath);
    await manager.waitForSelector("#preview:not([hidden])", { timeout: 15_000 });
    await manager.waitForTimeout(700);
    meta.import = { meta: await manager.textContent("#file-meta"), card: await boxOf("#panel-import > section.card:first-of-type", "#preview") };
    // The tree focuses its first row for keyboard users, and in a still a focus
    // ring reads as a selection.
    await manager.evaluate(() => document.activeElement?.blur());
    await manager.waitForTimeout(200);
    await manager.screenshot({ path: path.join(captures, "import.png"), fullPage: true });

    /*
     * 2. The restore. It is also what builds the session for every capture
     * after it: the windows, pins and groups in the later shots are the ones
     * the product itself restored, not ones this script arranged.
     *
     * Unloading is off, and the threshold above the pack's size, because
     * tabs.discard crashes any browser Playwright launches (docs/LIMITATIONS.md
     * Table L3). npm run matrix proves unloading on the real browsers.
     */
    await manager.uncheck("#opt-unload");
    await manager.fill("#opt-threshold", "100");
    await manager.press("#opt-threshold", "Tab");
    await manager.click("#restore");
    await manager.waitForFunction(() => /Restored/.test(document.querySelector("#restore-report")?.textContent ?? ""), null, { timeout: 60_000 });
    await manager.waitForTimeout(1200);
    meta.restore = { report: await manager.textContent("#restore-report") };
    await manager.locator("#restore-report").screenshot({ path: path.join(captures, "restored.png") });
    // The report's lines are block elements, so its range spans the full
    // width. The text's real extent is the rightmost line box.
    meta.restore.text = await manager.evaluate(() => {
      const node = document.querySelector("#restore-report");
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const right = Math.max(...[...range.getClientRects()].filter((r) => r.width > 0 && r.width < box.width - 1).map((r) => r.right));
      return { width: right - box.left, height: box.height, full: box.width };
    });

    // Fold the manager's own window into the first restored one, as a person
    // with the manager open would have it, and let every tab settle its title.
    const folded = await manager.evaluate(async (firstUrl) => {
      const self = await chrome.tabs.getCurrent();
      const all = await chrome.windows.getAll({ populate: true });
      const url = (t) => t.pendingUrl || t.url;
      const target = all.find((w) => w.id !== self.windowId && w.tabs.some((t) => url(t) === firstUrl || url(t) === new URL(firstUrl).href));
      if (!target) return { moved: false, windows: all.map((w) => w.tabs.map(url).slice(0, 2)) };
      const others = all.find((w) => w.id === self.windowId).tabs.filter((t) => t.id !== self.id);
      await chrome.tabs.move(self.id, { windowId: target.id, index: -1 });
      // Anything else left in the manager's first window is an empty start tab.
      for (const t of others) if (url(t) === "about:blank" || url(t) === "chrome://newtab/") await chrome.tabs.remove(t.id).catch(() => {});
      await chrome.tabs.update(self.id, { active: true });
      return { moved: true, left: others.map(url) };
    }, DEMO_WINDOWS[0].tabs[0].url);
    console.log("store-art: fold", JSON.stringify(folded));

    // Proof, not assertion: a redirect is the one visible trace of a request
    // that reached a real server, so every tab must still be where it was sent.
    const sent = new Set([...byHref.keys()]);
    const stray = await manager.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.map((t) => t.pendingUrl || t.url);
    }).then((urls) => urls.filter((u) => !u.startsWith("chrome-extension://") && !u.startsWith("chrome-error://") && !sent.has((() => { try { return new URL(u).href; } catch { return u; } })())));
    if (stray.length > 0) throw new Error(`store-art: tabs moved off their demo address, so a request reached a server: ${stray.join(", ")}`);
    meta.network = "no tab left its demo address";
    await manager.waitForTimeout(2500);
    for (const p of context.pages()) if (p !== manager && p.url() === "about:blank") await p.close().catch(() => {});

    // 3. The popup.
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 320 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(() => /\d+ tabs/.test(document.querySelector("#summary")?.textContent ?? ""), null, { timeout: 15_000 });
    await popup.waitForTimeout(400);
    const popupHeight = await popup.evaluate(() => Math.ceil(document.body.scrollHeight));
    await popup.screenshot({ path: path.join(captures, "popup.png"), clip: { x: 0, y: 0, width: 360, height: popupHeight } });
    meta.popup = { summary: await popup.textContent("#summary"), button: await popup.textContent("#export") };
    await popup.close();

    // 4. The export pane, with the age line and the age filter on.
    await manager.goto(`chrome-extension://${id}/manager.html#export`);
    await manager.reload();
    await manager.waitForFunction(() => /\d+ tabs/.test(document.querySelector("#summary")?.textContent ?? ""), null, { timeout: 15_000 });
    await manager.waitForSelector("#age:not([hidden])", { timeout: 15_000 });
    await manager.check("#opt-stale");
    await manager.waitForFunction(() => document.querySelector("#opt-stale-days")?.disabled === false);
    await manager.waitForTimeout(800);
    // Since the export pane was redesigned (ADR-046) the age line sits under
    // the tab list, so the capture is of that card, scrolled into view.
    await manager.evaluate(() => document.querySelector("#export-preview")?.scrollIntoView({ block: "start" }));
    await manager.waitForTimeout(300);
    const box = (sel) => manager.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, sel);
    const ageText = await manager.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#age"));
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    meta.export = {
      age: await manager.textContent("#age"),
      summary: await manager.textContent("#summary"),
      ageBox: await box("#age"),
      ageText,
      card: await boxOf("#export-preview-legend", "#export-tree", "#age", "#summary", "#export"),
    };
    await manager.screenshot({ path: path.join(captures, "export.png") });
    await manager.uncheck("#opt-stale");

    // 5. Snapshots.
    await manager.goto(`chrome-extension://${id}/manager.html#snapshots`);
    await manager.reload();
    await manager.waitForSelector("#snapshot-name");
    const names = ["Lisbon trip, before booking", "Q4 planning", "Thesis, the week before the committee"];
    for (const [k, name] of names.entries()) {
      await manager.fill("#snapshot-name", name);
      await manager.click("#save-snapshot");
      // A snapshot's name is an editable field, so its value is not in the
      // list's text. Count the entries instead.
      await manager.waitForFunction((n) => document.querySelectorAll("#snapshot-list > li").length >= n, k + 1, { timeout: 10_000 });
    }
    await manager.waitForTimeout(500);
    meta.snapshots = { card: await boxOf("#panel-snapshots > section.card:first-of-type") };
    await manager.screenshot({ path: path.join(captures, "snapshots.png") });

    await writeFile(path.join(captures, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    console.log("store-art: captured", Object.keys(meta).join(", "));
    for (const [k, v] of Object.entries(meta)) console.log(`  ${k}:`, JSON.stringify(v).slice(0, 220));
  } finally {
    await context.close();
    await rm(work, { recursive: true, force: true });
  }
}

/* ----------------------------------------------------------------------- */
/* Compose                                                                  */
/* ----------------------------------------------------------------------- */

const OUTPUTS = [
  { q: "slide=1", file: "screenshot-1-export-in-one-click-1280x800.png", w: 1280, h: 800 },
  { q: "slide=2", file: "screenshot-2-everything-comes-back-1280x800.png", w: 1280, h: 800 },
  { q: "slide=3", file: "screenshot-3-any-browser-1280x800.png", w: 1280, h: 800 },
  { q: "slide=4", file: "screenshot-4-tabs-you-forgot-1280x800.png", w: 1280, h: 800 },
  { q: "slide=5", file: "screenshot-5-never-leaves-your-device-1280x800.png", w: 1280, h: 800 },
  { q: "tile=marquee", file: "promo-marquee-1400x560.png", w: 1400, h: 560 },
  { q: "tile=small", file: "promo-small-440x280.png", w: 440, h: 280 },
  { q: "tile=icon", file: "store-icon-128.png", w: 128, h: 128, transparent: true },
];

async function compose() {
  for (const need of ["popup.png", "export.png", "import.png", "restored.png", "snapshots.png", "meta.json"]) {
    if (!existsSync(path.join(captures, need))) {
      console.error(`store-art: ${need} is missing, run without --compose first`);
      process.exit(1);
    }
  }
  await mkdir(store, { recursive: true });
  const meta = JSON.parse(await readFile(path.join(captures, "meta.json"), "utf8"));
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), env: desktop.env });
  const errors = [];
  try {
    for (const out of OUTPUTS) {
      const page = await browser.newPage({ viewport: { width: out.w, height: out.h }, deviceScaleFactor: 1 });
      page.on("pageerror", (e) => errors.push(`${out.q}: ${e}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${out.q}: ${m.text()}`));
      // Where things sit on a capture, measured during capture, so a highlight
      // lands on the real element rather than a guess.
      await page.addInitScript((m) => { window.__META__ = m; }, meta);
      await page.goto(`${pathToFileURL(path.join(root, "assets", "promo", "art.html")).href}?${out.q}`);
      await page.waitForSelector("body[data-ready='1']", { timeout: 15_000 });
      await page.screenshot({ path: path.join(store, out.file), omitBackground: Boolean(out.transparent) });
      await page.close();
      console.log(`store-art: ${out.file}`);
    }
  } finally {
    await browser.close();
  }
  if (errors.length > 0) {
    console.error(`store-art: ${errors.length} page error(s)\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
}

if (!composeOnly) await capture();
if (!captureOnly) await compose();
