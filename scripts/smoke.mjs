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
import { mkdir, rm, writeFile } from "node:fs/promises";
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

/**
 * A small pack with everything the restore engine has to get right: a pinned tab,
 * a group with a title and a colour, an active tab, a second window, and one
 * address no extension is allowed to open.
 */
const SMOKE_PACK = {
  format: "tabspack",
  schemaVersion: 1,
  exportedAt: "2026-09-24T08:29:40+00:00",
  name: "Smoke pack",
  counts: { windows: 2, tabs: 6, groups: 1 },
  windows: [
    {
      id: "w1",
      type: "normal",
      focused: true,
      groups: [{ id: "g1", title: "Reading", color: "green" }],
      tabs: [
        { index: 0, url: "https://example.com/pinned", title: "Pinned reference", pinned: true },
        { index: 1, url: "https://example.com/grouped-a", title: "Grouped A", groupId: "g1", active: true },
        { index: 2, url: "https://example.com/grouped-b", title: "Grouped B", groupId: "g1" },
        { index: 3, url: "https://example.com/plain", title: "Plain page" },
        { index: 4, url: "chrome://settings/", title: "Settings" },
      ],
    },
    {
      id: "w2",
      type: "normal",
      tabs: [{ index: 0, url: "https://example.net/second-window", title: "Second window", active: true }],
    },
  ],
};

/** The folded list of notes under the restore report, opened so it can be read. */
async function managerIssueText(page) {
  const details = await page.$("#restore-issues details");
  if (!details) return "";
  await details.evaluate((node) => node.setAttribute("open", "open"));
  return (await page.textContent("#restore-issues")) ?? "";
}

const failures = [];
function check(name, condition, detail) {
  if (condition) console.log(`  ok    ${name}`);
  else {
    console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ""}`);
    failures.push(name);
  }
}

/**
 * Waits for every running transition to finish. Colour changes take --dur-fast,
 * and a screenshot or a computed style read inside that window reports the
 * colour being left behind: a dark shot taken this way shows light button text
 * and reads as a theme bug that is not there.
 */
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
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
  await settle(popup);
  await popup.screenshot({ path: path.join(shots, "popup-dark.png") });
  // A page can go dark while a control does not: the tokens are on :root, but a
  // button's own colour and border are separate declarations that read them.
  const darkInk = await popup.evaluate(() => {
    const style = getComputedStyle(document.querySelector("#import"));
    return `${style.color} on ${style.borderColor}`;
  });
  check("dark reaches a button's own ink and border, not only the page", darkInk === "rgb(232, 234, 237) on rgb(118, 125, 138)", darkInk);
  await popup.emulateMedia({ colorScheme: "light" });
  await settle(popup);

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

  /**
   * The popup's two ways out. Import cannot happen in a popup at all, so the
   * button has to land on the import task with the picker ready; the gear has to
   * reach the settings page. Both are one click from the launcher, so both are
   * checked here rather than assumed.
   */
  const arriving = context.waitForEvent("page", { timeout: 15_000 });
  await popup.click("#import");
  const handoff = await arriving;
  await handoff.waitForLoadState("domcontentloaded");
  await handoff
    .waitForFunction(() => document.querySelector("#tab-import")?.getAttribute("aria-selected") === "true", {
      timeout: 10_000,
    })
    .catch(() => undefined);
  const onImport = await handoff.getAttribute("#tab-import", "aria-selected");
  check("import in the popup opens the manager on the import task", onImport === "true", `aria-selected=${onImport}`);
  check("the manager clears the hash, so a reload is a plain visit", !handoff.url().includes("#"), handoff.url());
  const landedOn = await handoff.evaluate(() => document.activeElement?.id ?? "");
  check("the import task arrives with the file button focused", landedOn === "choose-file", landedOn);
  await handoff.close();

  const settingsArriving = context.waitForEvent("page", { timeout: 15_000 });
  await popup.click("#open-settings");
  const settingsPage = await settingsArriving;
  await settingsPage.waitForLoadState("domcontentloaded");
  check("the gear opens the settings page", settingsPage.url().endsWith("/options.html"), settingsPage.url());
  await settingsPage.close();

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
  await settle(manager);
  await manager.screenshot({ path: path.join(shots, "manager-dark.png"), fullPage: true });
  await manager.emulateMedia({ colorScheme: "light" });

  /* Import and restore, M2 ------------------------------------------------ */

  const packPath = path.join(root, ".tmp", "smoke", "smoke.tabspack.json");
  await mkdir(path.dirname(packPath), { recursive: true });
  await writeFile(packPath, `${JSON.stringify(SMOKE_PACK, null, 2)}\n`, "utf8");

  await manager.click("#tab-import");
  check(
    "the import task opens",
    (await manager.isVisible("#dropzone")) && !(await manager.isVisible("#panel-export")),
  );

  await manager.setInputFiles("#file", packPath);
  await manager.waitForSelector("#preview:not([hidden])", { timeout: 10_000 });
  const fileMeta = await manager.textContent("#file-meta");
  check(
    "the preview states what is in the file",
    /2 windows · 6 tabs · 1 group/.test(fileMeta ?? ""),
    fileMeta ?? "",
  );

  const rows = await manager.$$eval(".tree-row", (nodes) =>
    nodes.map((node) => ({
      kind: node.className,
      checked: node.getAttribute("aria-checked"),
      text: node.textContent ?? "",
    })),
  );
  check("the preview tree renders the pack", rows.length >= 6, `${rows.length} rows`);
  check(
    "an address no extension can open is flagged rather than hidden",
    rows.some((row) => row.text.includes("cannot be opened")),
    rows.map((row) => row.text).join(" | "),
  );
  const beforeSelection = await manager.textContent("#selection-count");
  check(
    "the selection count names what will be skipped and why",
    /6 of 6 selected · 1 will be skipped · 1 cannot be opened/.test(beforeSelection ?? ""),
    beforeSelection ?? "",
  );

  // Keyboard: one tab stop into the tree, then arrows and space.
  await manager.focus("#tree");
  await manager.keyboard.press("ArrowDown");
  await manager.keyboard.press("ArrowDown");
  await manager.keyboard.press(" ");
  const afterKeyboard = await manager.textContent("#selection-count");
  const groupRowState = await manager.getAttribute(".tree-row.kind-group", "aria-checked");
  check(
    "space on a group row deselects the whole group",
    /4 of 6 selected/.test(afterKeyboard ?? "") && groupRowState === "false",
    `${afterKeyboard ?? ""} aria-checked=${groupRowState}`,
  );
  await manager.keyboard.press(" ");
  check(
    "pressing it again selects the group back",
    /6 of 6 selected/.test((await manager.textContent("#selection-count")) ?? ""),
    (await manager.textContent("#selection-count")) ?? "",
  );

  let groupsAllowed = false;
  if (await manager.isVisible("#groups-permission")) {
    manager.on("dialog", (dialog) => dialog.accept().catch(() => undefined));
    await manager.click("#allow-groups");
    await manager.waitForTimeout(800);
    groupsAllowed = !(await manager.isVisible("#groups-permission"));
  } else {
    groupsAllowed = true;
  }
  const permissionState = await worker.evaluate(
    async () => await chrome.permissions.contains({ permissions: ["tabGroups"] }),
  );
  console.log(
    `smoke: tab groups permission ${groupsAllowed ? "granted" : "not granted"} (browser reports ${permissionState})`,
  );

  const restoreLabel = await manager.textContent("#restore");
  check("the restore button names what it will do", /^Restore 5 tabs$/.test(restoreLabel ?? ""), restoreLabel ?? "");

  const windowsBefore = await worker.evaluate(async () => (await chrome.windows.getAll({})).length);
  await manager.click("#restore");
  // The same live region carries progress first, so wait for the outcome itself.
  await manager.waitForFunction(
    () => /Restored/.test(document.querySelector("#restore-report")?.textContent ?? ""),
    { timeout: 30_000 },
  );
  const restoreReport = await manager.textContent("#restore-report");
  check("the restore report states the outcome", /Restored 5 tabs/.test(restoreReport ?? ""), restoreReport ?? "");

  const state = await worker.evaluate(async () => {
    const windows = await chrome.windows.getAll({ populate: true });
    const groups = chrome.tabGroups ? await chrome.tabGroups.query({}) : [];
    return {
      windows: windows.length,
      tabs: windows.flatMap((win) =>
        (win.tabs ?? []).map((tab) => ({
          url: tab.url || tab.pendingUrl || "",
          pinned: tab.pinned,
          index: tab.index,
          groupId: tab.groupId,
          windowId: tab.windowId,
        })),
      ),
      groups: groups.map((group) => ({ title: group.title, color: group.color, collapsed: group.collapsed })),
    };
  });

  check(
    "two new windows were opened",
    state.windows === windowsBefore + 2,
    `${windowsBefore} before, ${state.windows} after`,
  );
  const restoredUrls = state.tabs.map((tab) => tab.url);
  for (const url of [
    "https://example.com/pinned",
    "https://example.com/grouped-a",
    "https://example.com/grouped-b",
    "https://example.com/plain",
    "https://example.net/second-window",
  ]) {
    check(`restored ${url}`, restoredUrls.some((candidate) => candidate.startsWith(url)), restoredUrls.join(" "));
  }
  check(
    "a chrome:// address was not restored",
    restoredUrls.every((url) => !url.startsWith("chrome://settings")),
    restoredUrls.join(" "),
  );
  const pinned = state.tabs.filter((tab) => tab.pinned);
  check(
    "the pinned tab is pinned and holds index 0",
    pinned.length === 1 && pinned[0].index === 0,
    JSON.stringify(pinned),
  );

  const grouped = state.tabs.filter((tab) => typeof tab.groupId === "number" && tab.groupId > -1);
  if (permissionState) {
    check(
      "the group is restored with its title and colour",
      state.groups.some((group) => group.title === "Reading" && group.color === "green"),
      JSON.stringify(state.groups),
    );
    check("both tabs of the group are in it", grouped.length === 2, JSON.stringify(grouped));
  } else {
    // Real behaviour found here: tabs.group needs no permission, so the tabs are
    // grouped, and only the title and colour are refused.
    check(
      "without the tab groups permission the tabs are still grouped and the report says what was lost",
      grouped.length === 2 && /titles and colours were not applied/.test(await managerIssueText(manager)),
      `${grouped.length} grouped, notes: ${(await managerIssueText(manager)).slice(0, 200)}`,
    );
  }

  // A tab opened by the extension in another window takes a moment to appear as
  // a page here, and reports no URL until it does.
  let placeholder = null;
  for (let attempt = 0; attempt < 40 && !placeholder; attempt += 1) {
    placeholder = context.pages().find((page) => page.url().includes("placeholder.html")) ?? null;
    if (!placeholder) await manager.waitForTimeout(250);
  }
  check("the placeholder page opened", placeholder !== null, context.pages().map((page) => page.url()).join(" "));
  if (placeholder) {
    await placeholder.waitForSelector(".url-address", { timeout: 10_000 });
    const listed = await placeholder.$$eval(".url-address", (nodes) => nodes.map((node) => node.textContent));
    check(
      "the placeholder page lists the address it could not open",
      listed.includes("chrome://settings/"),
      listed.join(" "),
    );
    const links = await placeholder.$$eval("a", (nodes) => nodes.length);
    check("the placeholder page has no links, so nothing dangerous is one click away", links === 0);
    await placeholder.screenshot({ path: path.join(shots, "placeholder.png"), fullPage: true });
  }

  /* Search and the foreign formats, M3 ----------------------------------- */

  await manager.fill("#tree-search", "grouped");
  const searching = await manager.textContent("#selection-count");
  const shownRows = await manager.$$eval(".tree-row", (nodes) =>
    nodes.map((node) => node.textContent ?? ""),
  );
  check(
    "search narrows the tree to the matches and their windows",
    /2 shown/.test(searching ?? "") && shownRows.every((row) => !row.includes("Plain page")),
    `${searching ?? ""} | ${shownRows.join(" / ")}`,
  );
  await manager.click("#select-none");
  const afterNone = await manager.textContent("#selection-count");
  check(
    "select none acts on what the search shows, not on the whole pack",
    /4 of 6 selected/.test(afterNone ?? ""),
    afterNone ?? "",
  );
  await manager.fill("#tree-search", "");
  await manager.click("#select-all");

  const foreign = path.join(root, "test", "fixtures", "foreign", "onetab.txt");
  await manager.setInputFiles("#file", foreign);
  await manager.waitForFunction(
    () => /onetab\.txt · \d+ windows/.test(document.querySelector("#file-meta")?.textContent ?? ""),
    { timeout: 10_000 },
  );
  const foreignMeta = await manager.textContent("#file-meta");
  const foreignFidelity = await manager.textContent("#fidelity");
  check(
    "a OneTab export is recognised by its shape, under any name",
    /2 windows · 5 tabs/.test(foreignMeta ?? ""),
    foreignMeta ?? "",
  );
  check(
    "the preview states what the source format could not carry",
    /OneTab export/.test(foreignFidelity ?? "") && /Not carried by this format/.test(foreignFidelity ?? ""),
    foreignFidelity ?? "",
  );
  await manager.screenshot({ path: path.join(shots, "manager-foreign.png"), fullPage: true });

  await manager.setInputFiles("#file", packPath);
  await manager.waitForFunction(
    () => /6 tabs/.test(document.querySelector("#file-meta")?.textContent ?? ""),
    { timeout: 10_000 },
  );

  /**
   * NFR-005: the manager page opens a 5000 tab file. Measured here rather than
   * asserted, and it also proves the preview is virtualised: a tree holding five
   * thousand tabs must keep only a screenful of rows in the document.
   */
  const bigPack = path.join(root, "test", "fixtures", "synthetic", "synthetic-5000.tabspack.json");
  if (existsSync(bigPack)) {
    const started = Date.now();
    await manager.setInputFiles("#file", bigPack);
    await manager.waitForFunction(
      () => /5000 tabs/.test(document.querySelector("#file-meta")?.textContent ?? ""),
      { timeout: 60_000 },
    );
    const elapsed = Date.now() - started;
    const domRows = await manager.$$eval(".tree-row", (nodes) => nodes.length);
    check(
      `a 5000 tab pack previews in ${elapsed} ms without freezing`,
      elapsed < 5_000,
      `${elapsed} ms`,
    );
    check(
      "the preview is virtualised, so only a screenful of rows is in the document",
      domRows > 0 && domRows < 80,
      `${domRows} rows in the document`,
    );
    const bigSelection = await manager.textContent("#selection-count");
    check("the selection count matches the file", /5000 of 5000 selected/.test(bigSelection ?? ""), bigSelection ?? "");
    await manager.setInputFiles("#file", packPath);
    await manager.waitForFunction(
      () => /6 tabs/.test(document.querySelector("#file-meta")?.textContent ?? ""),
      { timeout: 10_000 },
    );
  } else {
    console.log("smoke: no 5000 tab fixture, run npm run fixtures for the NFR-005 check");
  }

  /* Snapshots and keyboard commands, M4 ---------------------------------- */

  await manager.click("#tab-snapshots");
  check("the snapshots task opens", await manager.isVisible("#save-snapshot"));

  await manager.fill("#snapshot-name", "Smoke snapshot");
  await manager.click("#save-snapshot");
  await manager.waitForSelector(".snapshot", { timeout: 10_000 });
  const snapshotMeta = await manager.textContent(".snapshot-meta");
  const usageLine = await manager.textContent("#snapshot-usage");
  check(
    "a snapshot records the windows and tabs it saved",
    /\d+ windows? · \d+ tabs/.test(snapshotMeta ?? ""),
    snapshotMeta ?? "",
  );
  check("storage use is reported against the cap", /of about 10\.0 MB used/.test(usageLine ?? ""), usageLine ?? "");

  const stored = await worker.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    const index = all.snapshots ?? [];
    const bodies = Object.keys(all).filter((key) => key.startsWith("snapshot:"));
    return { entries: index.length, bodies: bodies.length, name: index[0]?.name ?? "" };
  });
  check(
    "the snapshot is in storage as an index entry and a body",
    stored.entries === 1 && stored.bodies === 1 && stored.name === "Smoke snapshot",
    JSON.stringify(stored),
  );

  /**
   * A keyboard command is fired by the browser itself, and no test driver can
   * press a browser level shortcut, so what is checked here is everything up to
   * that line: the commands are declared with their suggested keys, the browser
   * lists them where a user can rebind them, and the worker has a listener
   * waiting. Pressing the keys is a manual matrix case in docs/TESTING.md.
   */
  const listening = await worker.evaluate(() => chrome.commands.onCommand.hasListeners?.() ?? true);
  check("the worker is listening for keyboard commands", listening === true, String(listening));

  const declared = await worker.evaluate(async () =>
    (await chrome.commands.getAll())
      .filter((command) => !command.name.startsWith("_"))
      .map((command) => `${command.name}:${command.shortcut}`)
      .sort(),
  );
  check(
    "all three commands are declared with a shortcut the browser accepted",
    JSON.stringify(declared) ===
      JSON.stringify([
        "export-all-windows:Alt+Shift+E",
        "export-current-window:Alt+Shift+D",
        "save-snapshot:Alt+Shift+S",
      ]),
    JSON.stringify(declared),
  );

  await manager.click(".snapshot-actions button");
  await manager.waitForFunction(
    () => /Smoke snapshot/.test(document.querySelector("#file-meta")?.textContent ?? ""),
    { timeout: 10_000 },
  );
  check(
    "previewing a snapshot opens it in the import task, where the restore lives",
    await manager.isVisible("#tree"),
  );

  await manager.click("#tab-snapshots");
  await manager.screenshot({ path: path.join(shots, "manager-snapshots.png"), fullPage: true });
  await manager.click(".snapshot-actions button:last-child");
  const armed = await manager.textContent(".snapshot-actions button:last-child");
  check("deleting asks once before it deletes", /Delete for good/.test(armed ?? ""), armed ?? "");
  await manager.click(".snapshot-actions button:last-child");
  await manager.waitForFunction(() => document.querySelectorAll(".snapshot").length === 0, {
    timeout: 5_000,
  });
  const afterDelete = await worker.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return {
      entries: (all.snapshots ?? []).length,
      bodies: Object.keys(all).filter((key) => key.startsWith("snapshot:")).length,
    };
  });
  check(
    "deleting removes the body as well as the list entry",
    afterDelete.entries === 0 && afterDelete.bodies === 0,
    JSON.stringify(afterDelete),
  );

  await manager.click("#tab-import");
  await manager.setInputFiles("#file", packPath);
  await manager.waitForFunction(
    () => /6 tabs/.test(document.querySelector("#file-meta")?.textContent ?? ""),
    { timeout: 10_000 },
  );

  await manager.screenshot({ path: path.join(shots, "manager-import.png"), fullPage: true });
  await manager.emulateMedia({ colorScheme: "dark" });
  await settle(manager);
  await manager.screenshot({ path: path.join(shots, "manager-import-dark.png"), fullPage: true });

  /* Options and the theme, M5 -------------------------------------------- */

  const options = await context.newPage();
  const optionErrors = [];
  options.on("pageerror", (error) => optionErrors.push(String(error)));
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForSelector("#opt-scope");
  await options.setViewportSize({ width: 900, height: 1000 });
  check("the options page loads without a console error", optionErrors.length === 0, optionErrors[0]);

  const untranslated = await options.$$eval("[data-i18n]", (nodes) =>
    nodes.filter((node) => (node.textContent ?? "").trim() === (node.getAttribute("data-i18n") ?? "")).length,
  );
  check("every string on the page came from _locales", untranslated === 0, `${untranslated} keys showed as themselves`);

  const shortcuts = await options.textContent("#shortcuts");
  check(
    "the options page lists the keyboard shortcuts the browser reports",
    /Alt\+Shift\+E/.test(shortcuts ?? ""),
    shortcuts ?? "",
  );

  await options.click("#theme button[data-value='dark']");
  // The controls transition for 120 ms, and a screenshot taken inside that reads
  // as a bug in every later review of it.
  await options.waitForTimeout(400);
  const themed = await options.getAttribute("html", "data-theme");
  const background = await options.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const selected = await options.$$eval("#theme button", (nodes) =>
    nodes.filter((node) => node.getAttribute("aria-checked") === "true").map((node) => node.dataset.value),
  );
  check(
    "choosing dark applies it at once, and the control says so",
    themed === "dark" && background === "rgb(22, 24, 28)" && selected.join() === "dark",
    `${themed} ${background} ${selected.join()}`,
  );
  await options.screenshot({ path: path.join(shots, "options-dark.png"), fullPage: true });

  await options.click("#theme button[data-value='light']");
  const storedTheme = await worker.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings?.theme,
  );
  check("the choice is stored", storedTheme === "light", String(storedTheme));

  // A setting the manager reads: change it here, reopen there.
  await options.fill("#opt-threshold", "7");
  await options.dispatchEvent("#opt-threshold", "change");
  await options.waitForTimeout(300);
  const threshold = await worker.evaluate(
    async () => (await chrome.storage.local.get("settings")).settings?.discardThreshold,
  );
  check("a number setting is stored as a number", threshold === 7, String(threshold));

  await options.fill("#opt-threshold", "99999");
  await options.dispatchEvent("#opt-threshold", "change");
  await options.waitForTimeout(300);
  const clamped = await options.inputValue("#opt-threshold");
  check(
    "a number outside its range falls back to the default and the field says so",
    clamped === "20",
    clamped,
  );

  await options.click("#reset");
  await options.waitForTimeout(300);
  const afterReset = await worker.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  check(
    "reset puts every setting back",
    afterReset?.theme === "system" && afterReset?.discardThreshold === 20,
    JSON.stringify(afterReset),
  );
  await options.screenshot({ path: path.join(shots, "options-light.png"), fullPage: true });

  // T-501: a setting takes effect on a surface that is already open.
  await options.click("#theme button[data-value='dark']");
  await manager.waitForFunction(() => document.documentElement.dataset.theme === "dark", {
    timeout: 5_000,
  });
  check("a setting changed here reaches a manager page that is already open", true);
  await options.click("#theme button[data-value='system']");

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
