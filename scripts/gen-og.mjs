/**
 * The social preview card, `website/assets/img/og.png`, at 1200 by 630.
 *
 *   node scripts/gen-og.mjs
 *
 * Drawn rather than screenshotted, because a shrunken screenshot is unreadable
 * at the size these are actually shown: a link preview in a chat window is
 * about 400 pixels wide, so the headline has to survive being a third of its
 * nominal size. One sentence, one mark, nothing else.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] }));

function bundled() {
  const base = path.join(homedir(), ".cache", "ms-playwright");
  for (const b of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const c = path.join(base, b, "chrome-linux64", "chrome");
    if (existsSync(c)) return c;
  }
  return null;
}

const mark = await readFile(path.join(root, "assets", "icon.svg"), "utf8");

const html = `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    justify-content: space-between; padding: 76px 80px;
    font: 400 24px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc; background: #0b1017; position: relative; overflow: hidden;
  }
  .glow-a, .glow-b { position: absolute; border-radius: 50%; filter: blur(10px); }
  .glow-a { width: 760px; height: 760px; left: -230px; top: -330px;
    background: radial-gradient(closest-side, rgba(99,102,241,.55), transparent); }
  .glow-b { width: 680px; height: 680px; right: -200px; bottom: -360px;
    background: radial-gradient(closest-side, rgba(245,158,11,.30), transparent); }
  .row { display: flex; align-items: center; gap: 18px; position: relative; }
  .row svg { width: 54px; height: 54px; display: block; border-radius: 13px; }
  .name { font-size: 30px; font-weight: 700; letter-spacing: -.02em; }
  h1 { position: relative; font-size: 78px; line-height: 1.04; font-weight: 700;
       letter-spacing: -.038em; max-width: 17ch; }
  h1 em { font-style: normal; color: #a5b4fc; }
  p { position: relative; font-size: 27px; color: #94a3b8; max-width: 44ch; margin-top: 22px; }
  .foot { position: relative; display: flex; gap: 30px; font-size: 22px; color: #cbd5e1; font-weight: 520; }
  .foot span { display: flex; align-items: center; gap: 10px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #4ade80; }
</style>
<div class="glow-a"></div><div class="glow-b"></div>
<div class="row">${mark}<span class="name">TabsPack</span></div>
<div>
  <h1>Take your tabs <em>with you.</em></h1>
  <p>Export every open tab to one file and put them back exactly as they were, in Chrome, Edge or Firefox.</p>
</div>
<div class="foot">
  <span><i class="dot"></i>Free and open source</span>
  <span><i class="dot"></i>Your tabs never leave your device</span>
</div>`;

const browser = await chromium.launch({ executablePath: bundled() ?? undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
const out = path.join(root, "website", "assets", "img", "og.png");
await mkdir(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log(out);
