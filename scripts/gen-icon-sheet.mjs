/**
 * Every icon candidate at every size a store or a toolbar actually uses, on one
 * sheet, in both themes.
 *
 *   node scripts/gen-icon-sheet.mjs   ->  .tmp/shots/icon-sheet.png
 *
 * A mark is chosen at 16 pixels in a crowded toolbar, not at 128 on a slide,
 * and the first three drafts of these proved it: shapes that looked like tabs
 * at 128 were a folder, a briefcase and a plus sign at 16. Candidates live in
 * `assets/candidates/`; the chosen one is copied to `assets/icon.svg`, which is
 * what `scripts/gen-assets.mjs` rasterises.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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
const rows = [];
for (const [name, file] of files) {
  const svg = await readFile(file, "utf8");
  rows.push(`<tr><th>${name}</th>${[16, 32, 48, 128].map((s) => `<td><div class="i" style="width:${s}px;height:${s}px">${svg}</div><div class="s">${s}</div></td>`).join("")}
    <td class="ctx"><div class="bar"><div class="i" style="width:16px;height:16px">${svg}</div><span>toolbar</span></div></td></tr>`);
}
const html = `<!doctype html><meta charset="utf-8"><style>
 body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#16181c;margin:24px}
 table{border-collapse:collapse} th{text-align:left;padding-right:20px;font-weight:600;width:90px}
 td{padding:14px 18px;vertical-align:bottom;text-align:center}
 .i svg{width:100%;height:100%;display:block} .s{color:#5b616e;font-size:11px;margin-top:6px}
 .ctx{vertical-align:middle}
 .bar{display:flex;align-items:center;gap:8px;background:#f1f3f4;border-radius:8px;padding:6px 10px;color:#5b616e}
 tr{border-bottom:1px solid #e3e5e8}
 .dark{background:#16181c;color:#e8eaed;margin-top:8px;padding:24px;border-radius:12px}
 .dark .bar{background:#2b2f36;color:#9aa1ad} .dark th{color:#e8eaed} .dark tr{border-color:#313640}
</style>
<h2>Light</h2><table>${rows.join("")}</table>
<div class="dark"><h2>Dark</h2><table>${rows.join("")}</table></div>`;
const browser = await chromium.launch({ executablePath: bundled() ?? undefined });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: path.join(root, ".tmp", "shots", "icon-sheet.png"), fullPage: true });
await browser.close();
console.log("sheet written");
