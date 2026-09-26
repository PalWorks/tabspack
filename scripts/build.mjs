/**
 * Build. One source tree, two targets, no framework.
 *
 *   node scripts/build.mjs [--target=chrome|firefox|both] [--watch]
 *
 * Bundles are classic scripts (iife) rather than modules, which is the most
 * compatible choice across a Chromium service worker and a Gecko event page.
 */
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const watch = args.includes("--watch");
const targetArg = (args.find((a) => a.startsWith("--target=")) ?? "--target=both").split("=")[1];
const targets = targetArg === "both" ? ["chrome", "firefox"] : [targetArg];

const ENTRIES = [
  { in: "src/background/sw.ts", out: "sw" },
  { in: "src/ui/popup/popup.ts", out: "popup/popup" },
  { in: "src/ui/manager/manager.ts", out: "manager/manager" },
  { in: "src/ui/placeholder/placeholder.ts", out: "placeholder/placeholder" },
];

const COPIES = [
  { from: "src/ui/popup/popup.html", to: "popup.html" },
  { from: "src/ui/manager/manager.html", to: "manager.html" },
  { from: "src/ui/placeholder/placeholder.html", to: "placeholder.html" },
  { from: "src/ui/placeholder/placeholder.css", to: "placeholder/placeholder.css" },
  { from: "src/ui/popup/popup.css", to: "popup/popup.css" },
  { from: "src/ui/manager/manager.css", to: "manager/manager.css" },
  { from: "src/ui/shared/theme.css", to: "shared/theme.css" },
  { from: "src/ui/shared/base.css", to: "shared/base.css" },
];

const ESBUILD_TARGET = { chrome: ["chrome110"], firefox: ["firefox115"] };

for (const target of targets) {
  const outdir = path.join(root, "dist", target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const options = {
    entryPoints: ENTRIES.map((entry) => ({ in: path.join(root, entry.in), out: entry.out })),
    outdir,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ESBUILD_TARGET[target] ?? ["chrome110"],
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`[build] watching ${target}`);
  } else {
    await build(options);
  }

  for (const copy of COPIES) {
    const to = path.join(outdir, copy.to);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(path.join(root, copy.from), to);
  }

  // Translations are copied whole: the browser reads `_locales` itself.
  await cp(path.join(root, "_locales"), path.join(outdir, "_locales"), { recursive: true });

  const icons = path.join(root, "assets", "icons");
  if (existsSync(icons)) {
    await cp(icons, path.join(outdir, "icons"), { recursive: true });
  } else {
    console.warn("[build] assets/icons is missing: run npm run icons");
  }

  const manifest = JSON.parse(
    await readFile(path.join(root, `manifest.${target}.json`), "utf8"),
  );
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (manifest.version !== pkg.version) {
    throw new Error(
      `manifest.${target}.json is version ${manifest.version} but package.json is ${pkg.version}. They must match.`,
    );
  }
  await writeFile(
    path.join(outdir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`[build] ${target} -> dist/${target}`);
}
