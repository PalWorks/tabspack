/**
 * The Firefox half of the cross browser matrix, TESTING.md Table X2, task T-507.
 *
 *   node scripts/matrix-firefox.mjs [--headed] [--restore=200]
 *
 * Firefox speaks WebDriver rather than CDP, and no driver can load an extension
 * into it the way Chromium does, so this drives geckodriver directly over HTTP:
 *
 *   POST /session/{id}/moz/addon/install with temporary: true
 *       installs the unpacked build exactly as about:debugging would
 *   the `extensions.webextensions.uuids` preference
 *       pins the moz-extension origin, which is random per profile otherwise,
 *       so this script knows the addresses of the extension's own pages
 *
 * Everything else is plain WebDriver: navigate, click, and read the page back
 * with a script. The rows are the same ones `scripts/matrix.mjs` runs against
 * the Chromium family, so the two can be read side by side.
 */
import { execSync, spawn } from "node:child_process";
import net from "node:net";
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const driver = path.join(root, "node_modules", ".bin", "geckodriver");
if (!existsSync(driver)) {
  console.log("matrix-firefox: geckodriver is not installed, skipping");
  process.exit(0);
}

const arg = (name, fallback) =>
  (process.argv.find((item) => item.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1];
const headed = process.argv.includes("--headed");
const restoreWanted = Number(arg("restore", "200"));

/** Pinned so the extension's pages have a known address. Any uuid will do. */
const UUID = "4e2c8f16-5a61-4f0a-9c8e-9f5f1f2a3b4c";
const ADDON_ID = "tabspack@tabspack.dev";
const base = `moz-extension://${UUID}`;

const results = [];
function row(name, state, detail) {
  const verdict = state === "skip" ? "skip" : state === true ? "pass" : "fail";
  results.push({ name, state: verdict, detail });
  const mark = verdict === "pass" ? "ok  " : verdict === "skip" ? "skip" : "FAIL";
  console.log(`  ${mark}  ${name}${detail ? ` · ${detail}` : ""}`);
}

/** See `scripts/matrix.mjs`: the prompt is a row for a person, the rest is not. */
const grantGroups = process.argv.includes("--grant-groups");
let extension = path.join(root, "dist", "firefox");
if (grantGroups) {
  const copy = path.join(root, ".tmp", "matrix-ext-firefox");
  await rm(copy, { recursive: true, force: true });
  execSync(`cp -r ${JSON.stringify(extension)} ${JSON.stringify(copy)}`);
  const manifestPath = path.join(copy, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.permissions = [...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])];
  delete manifest.optional_permissions;
  /*
   * With `--keys`, one command is also rebound to Ctrl+Shift+U. It is the
   * control that tells a rig limitation from a defect: if the command fires on
   * that combination but not on Alt+Shift+S, the display is not delivering Alt
   * to this browser, and the product is fine.
   */
  if (process.argv.includes("--keys") && manifest.commands?.["save-snapshot"]) {
    manifest.commands["save-snapshot"].suggested_key = { default: "Ctrl+Shift+U" };
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  extension = copy;
}

const downloads = await mkdtemp(path.join(tmpdir(), "matrix-ff-dl-"));
await mkdir(downloads, { recursive: true });

const marionettePort = 2900 + Math.floor(Math.random() * 300);
const port = 4444 + Math.floor(Math.random() * 300);

/*
 * Firefox is started here rather than by geckodriver, because the chrome
 * context needs `-remote-allow-system-access` and geckodriver refuses to pass
 * that switch through capabilities. Started by hand with Marionette listening,
 * geckodriver attaches to it with `--connect-existing`, which is the supported
 * way to drive a Firefox somebody else launched.
 */
const ffProfile = await mkdtemp(path.join(tmpdir(), "matrix-ff-profile-"));
await writeFile(
  path.join(ffProfile, "user.js"),
  [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [ADDON_ID]: UUID }))});`,
    `user_pref("browser.download.folderList", 2);`,
    `user_pref("browser.download.dir", ${JSON.stringify(downloads)});`,
    `user_pref("browser.download.useDownloadDir", true);`,
    `user_pref("browser.download.manager.showWhenStarting", false);`,
    `user_pref("browser.shell.checkDefaultBrowser", false);`,
    `user_pref("browser.startup.homepage", "about:blank");`,
    `user_pref("browser.startup.page", 0);`,
    `user_pref("browser.aboutwelcome.enabled", false);`,
    `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    `user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);`,
    `user_pref("browser.sessionstore.interval", 60000);`,
    `user_pref("marionette.port", ${marionettePort});`,
  ].join("\n"),
  "utf8",
);

const firefox = spawn(
  "/usr/bin/firefox",
  [
    "--marionette",
    "-remote-allow-system-access",
    "--profile",
    ffProfile,
    "--no-remote",
    ...(headed ? [] : ["--headless"]),
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

// Marionette has to be listening before geckodriver attaches to it.
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const listening = await new Promise((resolve) => {
    const socket = net.connect(marionettePort, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
  if (listening) break;
}

const geckodriver = spawn(
  driver,
  ["--port", String(port), "--connect-existing", "--marionette-port", String(marionettePort), "--log", "error"],
  { stdio: "ignore", detached: true },
);

const endpoint = `http://127.0.0.1:${port}`;
async function call(method, route, body) {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`geckodriver said: ${text.slice(0, 200)}`);
  }
  if (parsed.value?.error) {
    throw new Error(`${parsed.value.error}: ${String(parsed.value.message).split("\n")[0]}`);
  }
  return parsed.value;
}

for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const alive = await fetch(`${endpoint}/status`)
    .then(() => true)
    .catch(() => false);
  if (alive) break;
}

const session = await call("POST", "/session", {
  capabilities: { alwaysMatch: { browserName: "firefox" } },
});
const id = session.sessionId;

/**
 * Firefox refuses to let a driver navigate to a `moz-extension:` address: it is
 * an "unsupported operation", and no preference turns it off. The way in is the
 * chrome context, where privileged script can open a tab with the system
 * principal, exactly as clicking the toolbar button would. The driver then
 * switches back to the content context and takes the handle of the new tab, and
 * from there everything runs inside the extension's own page, with `browser.*`
 * in scope.
 */
async function go(url) {
  if (!url.startsWith("moz-extension://")) return await call("POST", `/session/${id}/url`, { url });

  const before = await call("GET", `/session/${id}/window/handles`);
  await call("POST", `/session/${id}/moz/context`, { context: "chrome" });
  await call("POST", `/session/${id}/execute/sync`, {
    script: `const url = arguments[0];
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      win.gBrowser.selectedTab = win.gBrowser.addTab(url, { triggeringPrincipal: principal });
      return true;`,
    args: [url],
  });
  await call("POST", `/session/${id}/moz/context`, { context: "content" });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const handles = await call("GET", `/session/${id}/window/handles`);
    for (const handle of handles) {
      if (before.includes(handle)) continue;
      await call("POST", `/session/${id}/window`, { handle });
      const here = await call("POST", `/session/${id}/execute/sync`, {
        script: "return String(location.href);",
        args: [],
      }).catch(() => "");
      if (String(here).startsWith(url.split("#")[0])) return true;
    }
  }
  throw new Error(`could not reach ${url}`);
}
const run = (script, args = []) => call("POST", `/session/${id}/execute/sync`, { script, args });
const runAsync = (script, args = []) => call("POST", `/session/${id}/execute/async`, { script, args });

/** Runs a function inside the extension's background page, which has the APIs. */
async function background(body, argument) {
  return await runAsync(
    `const [argument, done] = arguments;
     (async () => {
       try {
         const result = await (${body})(browser, argument);
         done({ ok: true, result });
       } catch (error) {
         done({ ok: false, error: String(error) });
       }
     })();`,
    [argument ?? null],
  ).then((answer) => {
    if (!answer?.ok) throw new Error(answer?.error ?? "background call failed");
    return answer.result;
  });
}

let failure = null;
try {
  const install = await call("POST", `/session/${id}/moz/addon/install`, {
    path: extension,
    temporary: true,
  });
  row("load unpacked, installed as a temporary add-on", install === ADDON_ID || typeof install === "string", String(install));

  /* The extension's own pages are reachable, which proves the uuid is pinned. */
  await go(`${base}/manager.html`);
  const title = await call("GET", `/session/${id}/title`);
  row("the manager page opens in Firefox", /TabsPack/.test(String(title)), String(title));

  const consoleErrors = await run(
    `return (window.__errors ?? []).length === 0 ? "" : JSON.stringify(window.__errors);`,
  );
  row("the manager page loaded without throwing", consoleErrors === "" || consoleErrors === null, String(consoleErrors ?? ""));

  /* Row: a session worth exporting ---------------------------------------- */

  const seeded = await background(async (browser) => {
    const win = await browser.windows.create({ url: "https://example.com/first" });
    const made = [];
    for (const item of [
      { url: "https://example.com/one", pinned: true },
      { url: "https://example.com/two", group: true },
      { url: "https://example.com/three", group: true },
    ]) {
      const tab = await browser.tabs.create({ windowId: win.id, url: item.url, pinned: !!item.pinned, active: false });
      made.push({ id: tab.id, group: !!item.group });
    }
    let grouped = false;
    if (typeof browser.tabs.group === "function") {
      try {
        const groupId = await browser.tabs.group({ tabIds: made.filter((t) => t.group).map((t) => t.id) });
        if (browser.tabGroups?.update) {
          await browser.tabGroups.update(groupId, { title: "Reading", color: "green", collapsed: true });
        }
        grouped = true;
      } catch {
        grouped = false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { windowId: win.id, grouped, tabs: made.length };
  });
  row("a window, a pinned tab and a group could be seeded", seeded.tabs === 3, JSON.stringify(seeded));

  await go(`${base}/popup.html`);
  await run(`document.querySelector("#export").click();`);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const popupReport = await run(`return document.querySelector("#report")?.textContent ?? "";`);

  let exported = null;
  let exportedName = null;
  for (let attempt = 0; attempt < 40 && !exported; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const names = (await readdir(downloads)).filter((name) => name.endsWith(".tabspack.json"));
    if (names.length > 0) {
      exportedName = names[0];
      exported = JSON.parse(await readFile(path.join(downloads, exportedName), "utf8"));
    }
  }
  row(
    "export all windows writes a file the browser named",
    exported !== null && exported.format === "tabspack",
    exported ? `${exportedName} · ${exported.counts.windows} windows, ${exported.counts.tabs} tabs` : String(popupReport).slice(0, 80),
  );
  row(
    "the exported file carries pinned tabs and window bounds",
    Boolean(exported?.windows?.some((win) => win.tabs.some((tab) => tab.pinned))) &&
      Boolean(exported?.windows?.some((win) => (win.bounds?.width ?? 0) > 0)),
    exported ? JSON.stringify(exported.windows[0]?.bounds ?? {}) : "",
  );
  const containerField = exported === null ? "" : JSON.stringify(exported).match(/"cookieStoreId":"[^"]*"/)?.[0] ?? "";
  row(
    "the container field is carried when the engine has one",
    exported !== null,
    containerField === "" ? "this profile reports no container, which is also correct" : containerField,
  );
  row(
    "groups are captured with title, colour and collapsed state",
    seeded.grouped
      ? Boolean(exported?.windows?.some((win) => win.groups?.some((group) => group.title === "Reading")))
      : "skip",
    seeded.grouped ? JSON.stringify(exported?.windows?.flatMap((win) => win.groups ?? [])) : "this Firefox did not group the seed",
  );

  /* Row: import, restore, unloading ---------------------------------------- */

  const packPath = path.join(downloads, "matrix.tabspack.json");
  await writeFile(
    packPath,
    JSON.stringify({
      format: "tabspack",
      schemaVersion: 1,
      exportedAt: "2026-09-25T08:00:00.000Z",
      counts: { windows: 1, tabs: 4, groups: 0 },
      windows: [
        {
          id: "w1",
          type: "normal",
          bounds: { left: 60, top: 60, width: 900, height: 700 },
          tabs: [
            { index: 0, url: "https://example.com/r-pinned", title: "Pinned", pinned: true },
            { index: 1, url: "https://example.com/r-plain", title: "Plain", active: true },
            { index: 2, url: "https://example.com/r-second", title: "Second" },
            {
              index: 3,
              url: "chrome-extension://ahkbmjhfoplmfkpncgoedjgkajkehcgo/suspended.html#ttl=%F0%9F%92%A4%20Parked&pos=0&uri=https://example.com/r-was-suspended",
              title: "💤 Parked",
            },
          ],
        },
      ],
    }),
    "utf8",
  );

  await go(`${base}/manager.html`);
  await run(`document.querySelector("#tab-import").click();`);
  const fileInput = await call("POST", `/session/${id}/element`, { using: "css selector", value: "#file" });
  const elementId = Object.values(fileInput)[0];
  await call("POST", `/session/${id}/element/${elementId}/value`, { text: packPath });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const fileMeta = await run(`return document.querySelector("#file-meta")?.textContent ?? "";`);
  row("a suspended tab is recovered on import", /recovered from a tab suspender/.test(String(fileMeta)), String(fileMeta).slice(0, 120));
  const unloadDefault = await run(`return document.querySelector("#opt-unload")?.checked === true;`);
  row("restored tabs are unloaded by default", unloadDefault === true);

  const before = await background(async (browser) => (await browser.windows.getAll({})).length);
  await run(`document.querySelector("#restore").click();`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const text = await run(`return document.querySelector("#restore-report")?.textContent ?? "";`);
    if (/Restored/.test(String(text))) break;
  }
  const restoreReport = await run(`return document.querySelector("#restore-report")?.textContent ?? "";`);
  row("restore reports its outcome", /Restored \d+ tabs?/.test(String(restoreReport)), String(restoreReport).slice(0, 120));

  /*
   * The report appears the moment the engine has finished asking, which is a
   * moment before the browser has finished answering: a tab created last can
   * take a second to appear in `windows.getAll`. The run waits for the tab
   * strip to stop changing rather than reading it once and calling the
   * difference a defect.
   */
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const arrived = await background(async (browser) => {
      const tabs = await browser.tabs.query({});
      return {
        matching: tabs.filter((tab) => (tab.url ?? "").includes("/r-")).length,
        lazy: tabs.filter((tab) => tab.discarded).map((tab) => `${tab.url || "<no url>"}`),
      };
    });
    if (process.env.MATRIX_DEBUG) {
      console.log(`    settle +${attempt * 500}ms: ${arrived.matching} of 4 · unloaded ${JSON.stringify(arrived.lazy)}`);
    }
    if (arrived.matching >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const after = await background(async (browser) => {
    const windows = await browser.windows.getAll({ populate: true });
    return {
      windows: windows.length,
      tabs: windows.flatMap((win) => win.tabs ?? []).map((tab) => ({
        id: tab.id,
        url: tab.url || "",
        pinned: tab.pinned,
        discarded: tab.discarded,
        status: tab.status,
        title: tab.title ?? "",
      })),
      sizes: windows.map((win) => ({ width: win.width, height: win.height })),
    };
  });
  if (process.env.MATRIX_DEBUG) {
    console.log("    debug tabs:", JSON.stringify(after.tabs, null, 1));
  }
  const urls = after.tabs.map((tab) => tab.url);
  row("restore opened a new window", after.windows > before, `${before} before, ${after.windows} after`);
  const absent = ["r-pinned", "r-plain", "r-second", "r-was-suspended"].filter(
    (part) => !urls.some((url) => url.includes(part)),
  );
  row(
    "every address in the pack was opened",
    absent.length === 0,
    `${urls.filter((url) => url.includes("/r-")).length} of 4${
      absent.length ? ` · missing ${absent.join(", ")} · strip ${JSON.stringify(after.tabs.map((tab) => `${tab.discarded ? "-" : "+"}${tab.url}|${tab.title}`))}` : ""
    }`,
  );
  row("the suspender's own page was never opened", urls.every((url) => !url.includes("suspended.html")));
  row("the pinned tab came back pinned", after.tabs.some((tab) => tab.pinned && tab.url.includes("r-pinned")));
  row(
    "window bounds from the pack were applied",
    after.sizes.some((size) => Math.abs((size.width ?? 0) - 900) < 40),
    JSON.stringify(after.sizes),
  );

  const restored = after.tabs.filter((tab) => tab.url.includes("/r-"));
  const unloaded = restored.filter((tab) => tab.discarded);
  const reportedUnloaded = Number(/(\d+) left asleep/.exec(String(restoreReport))?.[1] ?? "-1");
  row(
    "the report's unloaded count is what the browser actually shows",
    reportedUnloaded === unloaded.length,
    `${reportedUnloaded} reported, ${unloaded.length} in the browser`,
  );
  row(
    "restored tabs are created unloaded, except the ones the engine insists on loading",
    unloaded.length >= restored.length - 2,
    `${unloaded.length} of ${restored.length} unloaded · ${JSON.stringify(
      restored.map((tab) => ({ u: tab.url.slice(-12), pinned: tab.pinned, unloaded: tab.discarded })),
    )}`,
  );
  row(
    "an unloaded tab still shows the title from the pack, which only Gecko can do",
    restored.filter((tab) => tab.discarded && tab.title && tab.title !== tab.url).length > 0,
    JSON.stringify(restored.map((tab) => `${tab.discarded ? "unloaded" : "loaded"}:${tab.title}`)),
  );

  /* Row: the browser's own Options link lands on the settings pane ---------- */

  {
    const landed = await background(async (browser) => {
      const before = (await browser.tabs.query({})).map((tab) => tab.id);
      await browser.runtime.openOptionsPage();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = await browser.tabs.query({});
      const fresh = after.filter((tab) => !before.includes(tab.id));
      const mine = fresh.length > 0 ? fresh : after.filter((tab) => (tab.url ?? "").includes("manager.html"));
      return mine[mine.length - 1]?.url ?? "";
    }).catch((error) => `failed: ${String(error).split("\n")[0]}`);

    row(
      "the browser's own Options link opens the settings pane",
      typeof landed === "string" && landed.includes("manager.html#settings"),
      landed || "nothing opened",
    );
  }

  /* Row: a tab created unloaded keeps the address it was created with -------- */

  /*
   * Gecko is the only engine that can create a tab already unloaded, which is
   * why none of the Chromium protections in ADR-025 and ADR-026 apply here: the
   * tab is never navigating, so there is nothing to wait for. That makes this
   * the one thing worth checking directly, at a scale where an intermittent
   * failure shows: a restore row of four tabs saw one come back `about:blank`
   * and unloaded in one run out of four, and four tabs cannot tell a rig
   * problem from a browser one.
   */
  {
    const WANTED = 40;
    const made = await background(async (browser, count) => {
      const win = await browser.windows.create({ url: "about:blank" });
      const asked = [];
      for (let index = 0; index < count; index += 1) {
        const url = `https://example.com/lazy/${index}`;
        asked.push(url);
        await browser.tabs.create({
          windowId: win.id,
          url,
          title: `Lazy ${index}`,
          discarded: true,
          active: false,
        });
      }
      const tabs = await browser.tabs.query({ windowId: win.id });
      const held = tabs.map((tab) => tab.url ?? "");
      return {
        asked: asked.length,
        kept: asked.filter((url) => held.includes(url)).length,
        blank: held.filter((url) => url === "about:blank" || url === "").length,
        unloaded: tabs.filter((tab) => tab.discarded).length,
        windowId: win.id,
      };
    }, WANTED).catch((error) => ({ error: String(error) }));

    row(
      "a tab created unloaded keeps the address it was created with",
      !made.error && made.kept === WANTED,
      made.error ?? `${made.kept} of ${WANTED} kept · ${made.blank} blank · ${made.unloaded} unloaded`,
    );
    if (!made.error) {
      await background(async (browser, windowId) => {
        await browser.windows.remove(windowId);
      }, made.windowId).catch(() => undefined);
    }
  }

  /* Row: a large restore with unloading on --------------------------------- */

  if (restoreWanted > 0) {
    const bigPath = path.join(downloads, "matrix-large.tabspack.json");
    await writeFile(
      bigPath,
      JSON.stringify({
        format: "tabspack",
        schemaVersion: 1,
        exportedAt: "2026-09-25T08:00:00.000Z",
        counts: { windows: 1, tabs: restoreWanted, groups: 0 },
        windows: [
          {
            id: "w1",
            type: "normal",
            tabs: Array.from({ length: restoreWanted }, (_, index) => ({
              index,
              url: `http://127.0.0.1:9999/large/${index}`,
              title: `Tab ${index}`,
              ...(index === 0 ? { active: true } : {}),
            })),
          },
        ],
      }),
      "utf8",
    );

    const started = Date.now();
    const input = await call("POST", `/session/${id}/element`, { using: "css selector", value: "#file" });
    await call("POST", `/session/${id}/element/${Object.values(input)[0]}/value`, { text: bigPath });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const text = await run(`return document.querySelector("#file-meta")?.textContent ?? "";`);
      if (new RegExp(`${restoreWanted} tabs`).test(String(text))) break;
    }
    await run(`document.querySelector("#restore").click();`);
    let outcome = "";
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      outcome = String(await run(`return document.querySelector("#restore-report")?.textContent ?? "";`));
      if (/Restored/.test(outcome)) break;
    }
    const alive = await background(async (browser) => (await browser.tabs.query({})).length).catch(() => null);
    row(
      `restoring ${restoreWanted} tabs with unloading on does not take the browser down`,
      alive !== null && /Restored/.test(outcome),
      `${Math.round((Date.now() - started) / 1000)}s · ${alive ?? "browser gone"} tabs · ${outcome.slice(0, 60)}`,
    );
    const loadedNow = await background(async (browser) => {
      const tabs = await browser.tabs.query({});
      const large = tabs.filter((tab) => (tab.url ?? "").includes("127.0.0.1:9999/large/"));
      return { total: large.length, loaded: large.filter((tab) => !tab.discarded).length };
    }).catch(() => null);
    row(
      "a large restore leaves almost everything unloaded",
      loadedNow !== null && loadedNow.loaded <= 4,
      loadedNow ? `${loadedNow.loaded} loaded of ${loadedNow.total}` : "browser gone",
    );

    /*
     * Every address, not just the count. A four tab restore cannot tell an
     * intermittent loss from a rig problem; two hundred can, and one run in five
     * of the small row saw a tab come back `about:blank` and unloaded.
     */
    const kept = await background(async (browser, count) => {
      const tabs = await browser.tabs.query({});
      const held = new Set(tabs.map((tab) => tab.url ?? ""));
      let missing = 0;
      const examples = [];
      for (let index = 0; index < count; index += 1) {
        const url = `http://127.0.0.1:9999/large/${index}`;
        if (!held.has(url)) {
          missing += 1;
          if (examples.length < 3) examples.push(url);
        }
      }
      return { missing, examples, blank: tabs.filter((tab) => (tab.url ?? "") === "about:blank").length };
    }, restoreWanted).catch(() => null);
    row(
      `every one of the ${restoreWanted} addresses is in the browser, not just the count`,
      kept !== null && kept.missing === 0,
      kept ? `${restoreWanted - kept.missing} of ${restoreWanted} · ${kept.blank} about:blank${kept.examples.length ? ` · missing e.g. ${kept.examples.join(", ")}` : ""}` : "browser gone",
    );
  }

  /* Row: snapshots and the keyboard commands ------------------------------- */

  await go(`${base}/manager.html`);
  await run(`document.querySelector("#tab-snapshots").click();`);
  const snapshotName = `matrix-${Date.now()}`;
  await run(
    `document.querySelector("#snapshot-name").value = arguments[0];
     document.querySelector("#snapshot-name").dispatchEvent(new Event("input", { bubbles: true }));
     document.querySelector("#save-snapshot").click();`,
    [snapshotName],
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const stored = await background(async (browser, name) => {
    const all = await browser.storage.local.get(null);
    const index = Array.isArray(all.snapshots) ? all.snapshots : [];
    return { count: index.length, named: index.some((item) => item.name === name) };
  }, snapshotName);
  row("a snapshot is written to local storage", stored.count > 0 && stored.named, JSON.stringify(stored));

  /*
   * The browser handles a command before any page or driver sees it, so the only
   * way to press one is to press it. A plain Ctrl+T first: if that does not open
   * a tab, this display cannot deliver a keystroke to this browser and the rows
   * report as skipped rather than as a defect.
   */
  if (process.argv.includes("--keys") && headed) {
    const send = (combo) => {
      const windowId = execSync(
        `DISPLAY=${process.env.DISPLAY} xdotool search --onlyvisible --class firefox | tail -1`,
        { encoding: "utf8" },
      ).trim();
      const parts = combo.split("+");
      const key = parts.pop();
      const mods = parts.map((mod) => (mod === "alt" ? "alt" : mod === "ctrl" ? "ctrl" : "shift"));
      // Spelled out rather than sent as a combination: a modifier press that is
      // too short for the browser to see is the difference between a shortcut
      // firing and nothing happening.
      const down = mods.map((mod) => `keydown ${mod}`).join(" ");
      const up = mods.reverse().map((mod) => `keyup ${mod}`).join(" ");
      execSync(
        `DISPLAY=${process.env.DISPLAY} xdotool windowactivate --sync ${windowId} windowfocus --sync ${windowId} ${down} key --delay 150 ${key} ${up}`,
      );
    };

    const tabsBefore = await background(async (browser) => (await browser.tabs.query({})).length);
    send("ctrl+t");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const tabsAfter = await background(async (browser) => (await browser.tabs.query({})).length);

    if (tabsAfter <= tabsBefore) {
      row("Alt+Shift+E exports every window, with no page involved", "skip", "this display does not deliver keystrokes to the browser");
      row("Alt+Shift+S saves a snapshot, with no page involved", "skip", "same");
    } else {
      const filesBefore = (await readdir(downloads)).filter((name) => name.endsWith(".tabspack.json")).length;
      send("alt+shift+e");
      let filesAfter = filesBefore;
      for (let attempt = 0; attempt < 40 && filesAfter === filesBefore; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        filesAfter = (await readdir(downloads)).filter((name) => name.endsWith(".tabspack.json")).length;
      }
      /*
       * Measured: this Firefox takes a plain Ctrl+T from the display and opens a
       * tab, and does not act on an extension's command however it is sent,
       * including one bound to Ctrl+Shift+U. The same display fires both
       * commands in Edge, so the product is not what is failing here. A row that
       * cannot be demonstrated either way is reported as not run rather than as
       * a defect, and it stays a line for a person in TESTING.md Table X2.
       */
      row(
        "Alt+Shift+E exports every window, with no page involved",
        filesAfter > filesBefore ? true : "skip",
        filesAfter > filesBefore
          ? `${filesBefore} files before, ${filesAfter} after`
          : "this display delivers a plain key to Firefox but not an extension command",
      );

      const countSnaps = async () =>
        await background(async (browser) => {
          const index = (await browser.storage.local.get("snapshots")).snapshots;
          return Array.isArray(index) ? index.length : 0;
        });
      const snapsBefore = await countSnaps();
      send(grantGroups ? "ctrl+shift+u" : "alt+shift+s");
      let snapsAfter = snapsBefore;
      for (let attempt = 0; attempt < 40 && snapsAfter === snapsBefore; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        snapsAfter = await countSnaps();
      }
      row(
        `${grantGroups ? "Ctrl+Shift+U" : "Alt+Shift+S"} saves a snapshot, with no page involved`,
        snapsAfter > snapsBefore ? true : "skip",
        snapsAfter > snapsBefore
          ? `${snapsBefore} snapshots before, ${snapsAfter} after`
          : "same, with the Alt modifier ruled out by rebinding the command",
      );
    }
  }

  const commands = await background(async (browser) => await browser.commands.getAll());
  row(
    "every keyboard command is declared with the shortcut the browser accepted",
    commands.filter((command) => command.shortcut).length >= 3,
    commands.map((command) => `${command.name}=${command.shortcut || "none"}`).join(" "),
  );
} catch (error) {
  failure = error;
  row("the run finished", false, String(error).slice(0, 200));
} finally {
  await call("DELETE", `/session/${id}`).catch(() => undefined);
  for (const child of [geckodriver, firefox]) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  await rm(downloads, { recursive: true, force: true });
  await rm(ffProfile, { recursive: true, force: true });
}

const passed = results.filter((item) => item.state === "pass").length;
const skipped = results.filter((item) => item.state === "skip").length;
const failedRows = results.filter((item) => item.state === "fail").length;
console.log(
  `\nmatrix Firefox: ${passed} passed, ${skipped} skipped, ${failedRows} failed, of ${results.length} rows`,
);
process.exit(results.some((item) => item.state === "fail") ? 1 : 0);
