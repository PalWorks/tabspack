/**
 * The site, in a real browser.
 *
 *   node scripts/check-site-browser.mjs
 *
 * `check-site.mjs` reads the HTML and can prove that a link resolves. It cannot
 * prove that the page fits on a phone, because that is a question about layout
 * and only a layout engine can answer it. These are the three things that only
 * a browser knows, all of which were wrong the first time and none of which any
 * amount of reading the CSS would have caught:
 *
 *   1. **Horizontal overflow.** Every `minmax(300px, 1fr)` grid track was a
 *      300px floor inside a 280px container, so every page had a sideways
 *      scrollbar at 320px wide.
 *   2. **Script errors**, on a site whose whole claim is that it is simple.
 *   3. **Tap targets** smaller than the 24px minimum, which is a WCAG 2.2
 *      requirement and not a matter of taste.
 *
 * Skips cleanly when Playwright is not installed, the same way `smoke` does, so
 * this is a developer and release check rather than a CI gate.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { files as walkFiles } from "./lib/walk.mjs";
import { quietDesktop } from "./lib/no-mail-client.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

let chromium;
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  ({ chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] })));
} catch {
  console.log("check-site-browser: playwright is not installed, skipping");
  process.exit(0);
}

function bundled() {
  const base = path.join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const b of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const c = path.join(base, b, "chrome-linux64", "chrome");
    if (existsSync(c)) return c;
  }
  return null;
}

/** The narrowest phone still in use, a common phone, a tablet, and two desktops. */
const WIDTHS = [320, 390, 768, 1024, 1440];

/*
 * 404.html is left out, and it is worth saying why rather than quietly
 * filtering it. GitHub Pages serves that one file for a bad address at any
 * depth, so its stylesheet and its links have to be absolute to the deployed
 * origin. Opened from the filesystem it therefore has no stylesheet at all,
 * and every measurement taken here would be of an unstyled document. Its
 * markup and metadata are checked by `check-site.mjs` like every other page.
 */
const pages = (await walkFiles("website/**/*.html", root)).filter((p) => !p.endsWith("404.html")).sort();
const problems = [];

// The site has mailto links. Nothing here clicks them, and nothing here may
// ever be able to open a mail client if something does: no-mail-client.mjs.
const desktop = await quietDesktop();
const browser = await chromium.launch({ executablePath: bundled() ?? undefined, env: desktop.env });
try {
  for (const width of WIDTHS) {
    for (const rel of pages) {
      const file = rel.replaceAll("\\", "/");
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`${file} @${width}  console error: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`${file} @${width}  script error: ${e.message}`));
      await page.goto(`file://${path.join(root, file)}`);
      await page.waitForTimeout(120);

      const result = await page.evaluate(() => {
        const doc = document.documentElement;
        /*
         * Only standalone controls. WCAG 2.5.8 exempts a link inline in a
         * sentence, and measuring one is meaningless anyway: an inline box is
         * the height of the glyphs, not of the line you can actually tap.
         */
        const targets = [".btn", "button", "summary", ".nav-links a", ".foot a"];
        const small = [...document.querySelectorAll(targets.join(", "))]
          .filter((node) => {
            const box = node.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;
            // The skip link lives off canvas until it is focused.
            if (box.right < 0 || box.bottom < 0) return false;
            return box.height < 24 || box.width < 24;
          })
          .map((node) => `${node.tagName} "${(node.textContent ?? "").trim().slice(0, 24)}" ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`);
        return {
          scroll: doc.scrollWidth,
          client: doc.clientWidth,
          small: [...new Set(small)].slice(0, 5),
        };
      });

      if (result.scroll > result.client + 1) {
        problems.push(`${file} @${width}  scrolls sideways: ${result.scroll} > ${result.client}`);
      }
      // Only judged at a touch width: a mouse does not need 24 pixels.
      if (width <= 768 && result.small.length > 0) {
        problems.push(`${file} @${width}  tap target under 24px: ${result.small.join(", ")}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\ncheck-site-browser: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(`check-site-browser: ${pages.length} pages clean at ${WIDTHS.join(", ")} px`);
