/**
 * Every icon candidate at the sizes a toolbar and a store actually use, in
 * both treatments and on both backgrounds.
 *
 *   node scripts/gen-icon-sheet.mjs   ->  .tmp/icons/icon-sheet.png
 *
 * A mark is chosen at 16 pixels in a crowded toolbar, not at 128 on a slide.
 * The first five drafts proved it twice over: shapes that looked like tabs at
 * 128 were a folder, a briefcase and a plus sign at 16, and a second set that
 * differed only in colour was four versions of one idea.
 *
 * So this sheet shows two things the first one did not:
 *
 *   **The glyph on its own.** A candidate's `.bg` tile is hidden and its `.fg`
 *   is filled with its own brand colour, which is how a mark looks when it has
 *   to survive without a coloured square behind it.
 *
 *   **A real toolbar.** Sixteen pixels, between real neighbours, on the two
 *   backgrounds a browser actually paints.
 *
 * Candidates live in `assets/candidates/`. The chosen one is copied to
 * `assets/icon.svg`, which is what `scripts/gen-assets.mjs` rasterises.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdir, readdir } from "node:fs/promises";
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

const files = [["current", path.join(root, "assets", "icon.svg")]];
for (const name of (await readdir(path.join(root, "assets", "candidates"))).sort()) {
  files.push([name.replace(".svg", ""), path.join(root, "assets", "candidates", name)]);
}

/** Neighbours, so 16 px is judged in the company it will keep. */
const NEIGHBOURS = [
  `<svg viewBox="0 0 24 24" fill="#4285f4"><circle cx="12" cy="12" r="9"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="#34a853"><path d="M12 3l9 16H3z"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="#ea4335"><rect x="4" y="4" width="16" height="16" rx="4"/></svg>`,
];

const rows = [];
for (const [name, file] of files) {
  const svg = await readFile(file, "utf8");
  const at = (size, mode) => `<td><div class="i ${mode}" style="width:${size}px;height:${size}px">${svg}</div><div class="s">${size}</div></td>`;
  rows.push(`<tr>
    <th>${name}</th>
    ${[16, 20, 32, 48, 128].map((s) => at(s, "tile")).join("")}
    <td class="gap"></td>
    ${[16, 20, 32, 48].map((s) => at(s, "glyph")).join("")}
    <td class="ctx"><div class="bar">
      ${NEIGHBOURS[0]}<div class="i tile" style="width:16px;height:16px">${svg}</div>${NEIGHBOURS[1]}${NEIGHBOURS[2]}
    </div>
    <div class="bar">
      ${NEIGHBOURS[0]}<div class="i glyph" style="width:16px;height:16px">${svg}</div>${NEIGHBOURS[1]}${NEIGHBOURS[2]}
    </div></td>
  </tr>`);
}

const table = `<table>
  <tr class="head"><th></th><td colspan="5">tile</td><td class="gap"></td><td colspan="4">glyph only</td><td>toolbar, 16px</td></tr>
  ${rows.join("")}
</table>`;

const html = `<!doctype html><meta charset="utf-8"><style>
 body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#16181c;margin:24px}
 table{border-collapse:collapse} th{text-align:left;padding-right:18px;font-weight:600;width:104px}
 td{padding:14px 12px;vertical-align:bottom;text-align:center}
 .head td{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b919c;vertical-align:middle;padding-bottom:4px}
 .gap{width:26px;padding:0}
 .i svg{width:100%;height:100%;display:block}
 .glyph .bg{display:none}
 .glyph .fg{fill:var(--brand)}
 .glyph .fg[stroke]{stroke:var(--brand)}
 .glyph .accent{fill:var(--brand)}
 .s{color:#9aa1ad;font-size:10px;margin-top:6px}
 .ctx{vertical-align:middle}
 .bar{display:flex;align-items:center;gap:10px;background:#f1f3f4;border-radius:9px;padding:7px 11px;margin:4px 0}
 .bar>svg{width:16px;height:16px;flex:none;opacity:.85}
 tr{border-bottom:1px solid #e8eaed}
 .dark{background:#16181c;color:#e8eaed;margin-top:14px;padding:24px;border-radius:14px}
 .dark .bar{background:#2b2f36} .dark th{color:#e8eaed} .dark tr{border-color:#2d323b}
 .dark .glyph .fg{fill:#fff} .dark .glyph .fg[stroke]{stroke:#fff} .dark .glyph .accent{fill:#fff}
 h2{font-size:15px;margin:0 0 10px}
</style>
<h2>Light</h2>${table}
<div class="dark"><h2>Dark</h2>${table}</div>`;

const browser = await chromium.launch({ executablePath: bundled() ?? undefined });
const page = await browser.newPage({ viewport: { width: 1180, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(html);
/*
 * Not `.tmp/shots`: `npm run smoke` deletes that directory whole before it
 * takes its screenshots, which quietly ate this sheet once already.
 */
const out = path.join(root, ".tmp", "icons", "icon-sheet.png");
await mkdir(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
