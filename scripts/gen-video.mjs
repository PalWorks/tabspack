/**
 * Renders the TabsPack promo video from the explainer and the store screens.
 *
 *   node scripts/gen-video.mjs            1920x1080, 60 fps, about 30 seconds
 *   node scripts/gen-video.mjs --fps 30   a lighter render, same timeline
 *
 * Writes assets/promo/tabspack-promo-1080p.mp4 (H.264, no audio, ready for
 * YouTube, whose link is the store's promo video field) and
 * assets/promo/youtube-thumbnail.png (1280x720, the end card).
 *
 * Nothing is screen recorded. Both pages expose seek(ms), so every frame is
 * rendered at an exact instant and piped to ffmpeg: a slow machine makes a
 * slow render, never a stuttering video. The cut is three parts on one
 * background, and each part starts and ends on the bare background so no seam
 * shows:
 *
 *   1. explainer.html, the story, up to where the restored window leaves,
 *      with its end card held back
 *   2. reel.html, the five real store screens
 *   3. explainer.html again, only the end card, then a hold on it
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { quietDesktop } from "./lib/no-mail-client.mjs";

const root = path.resolve(import.meta.dirname, "..");
const promo = path.join(root, "assets", "promo");
const out = path.join(promo, "tabspack-promo-1080p.mp4");
const thumb = path.join(promo, "youtube-thumbnail.png");
const fpsArg = process.argv.indexOf("--fps");
const FPS = fpsArg > -1 ? Number(process.argv[fpsArg + 1]) : 60;

const require = createRequire(import.meta.url);
let chromium;
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  ({ chromium } = require(require.resolve("playwright", { paths: [globalRoot, root] })));
} catch {
  console.log("video: playwright is not installed, skipping");
  process.exit(0);
}
try {
  execSync("ffmpeg -version", { stdio: "ignore" });
} catch {
  console.error("video: ffmpeg is not on PATH");
  process.exit(1);
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

/* The timeline, in each page's own milliseconds. ------------------------- */

/** Part 1 ends when the restored window and its tabs have gone (13300). */
const STORY_END = 13300;
/** Part 3 starts where the end card is still fully transparent (13100). */
const CARD_FROM = 13100;
/** and ends before the explainer fades its end card out for the loop. */
const CARD_TO = 15600;
const HOLD_MS = 1500;

const executablePath = bundledChromium() ?? undefined;
const desktop = await quietDesktop();
const browser = await chromium.launch({ executablePath, env: desktop.env });

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation",
    "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart",
    out,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const finished = new Promise((resolve, reject) => {
  ffmpeg.on("error", reject);
  ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
});
let frames = 0;
async function emit(png) {
  frames += 1;
  if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
}

async function open(file, query, scale = 1.5) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale, reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${pathToFileURL(path.join(promo, file)).href}${query}`);
  await page.waitForSelector("body[data-ready]", { timeout: 15_000 });
  if (errors.length) throw new Error(`${file}: ${errors.join("; ")}`);
  return page;
}
const shoot = (page) => page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 }, type: "png" });
const steps = (from, to) => {
  const list = [];
  for (let ms = from; ms < to; ms += 1000 / FPS) list.push(ms);
  return list;
};

try {
  // ?embed is the explainer with nothing but the stage; ?t pauses it for seeking.
  const story = await open("explainer.html", "?embed&t=0");
  await story.addStyleTag({ content: ".toggle { display: none !important; }" });

  /* 1. The story, with the end card held back for part 3. */
  /* The explainer's exit eases in, so its last frames still show the window;
     a linear fade over the final 400 ms takes it to the bare background. */
  await story.addStyleTag({ content: "#end { visibility: hidden; } .stage > * { filter: opacity(var(--out, 1)); }" });
  for (const ms of [...steps(0, STORY_END), STORY_END]) {
    const out = Math.max(0, Math.min(1, (STORY_END - ms) / 400));
    await story.evaluate(([t, o]) => {
      document.getElementById("stage").style.setProperty("--out", String(o));
      window.tabspackExplainer.seek(t);
    }, [ms, out]);
    await emit(await shoot(story));
  }
  console.log(`video: part 1, ${frames} frames`);

  /* 2. The real screens, the five store slides rendered again at 1.5x from
     the same captures and the same art.html, so they are sharp at 1080p. */
  const meta = JSON.parse(await readFile(path.join(promo, "captures", "meta.json"), "utf8"));
  const work = await mkdtemp(path.join(tmpdir(), "tabspack-video-"));
  const shots = [];
  for (let n = 1; n <= 5; n += 1) {
    const slide = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
    await slide.addInitScript((m) => { window.__META__ = m; }, meta);
    await slide.goto(`${pathToFileURL(path.join(promo, "art.html")).href}?slide=${n}`);
    await slide.waitForSelector("body[data-ready='1']", { timeout: 15_000 });
    const file = path.join(work, `slide-${n}.png`);
    await slide.screenshot({ path: file });
    shots.push(pathToFileURL(file).href);
    await slide.close();
  }
  const reel = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await reel.addInitScript((list) => { window.__SHOTS__ = list; }, shots);
  await reel.goto(pathToFileURL(path.join(promo, "reel.html")).href);
  await reel.waitForSelector("body[data-ready]", { timeout: 15_000 });
  const reelMs = await reel.evaluate(() => window.reel.duration);
  for (const ms of steps(0, reelMs)) {
    await reel.evaluate((t) => window.reel.seek(t), ms);
    await emit(await shoot(reel));
  }
  await reel.close();
  await rm(work, { recursive: true, force: true });
  console.log(`video: part 2, ${frames} frames`);

  /* 3. The end card alone, then held. */
  await story.addStyleTag({ content: "#end { visibility: visible; } .stage > :not(#end) { visibility: hidden !important; }" });
  let last;
  for (const ms of [...steps(CARD_FROM, CARD_TO), CARD_TO]) {
    await story.evaluate((t) => window.tabspackExplainer.seek(t), ms);
    last = await shoot(story);
    await emit(last);
  }
  for (let i = 0; i < Math.round((HOLD_MS / 1000) * FPS); i += 1) await emit(last);
  console.log(`video: part 3, ${frames} frames`);
  await story.close();

  /* The thumbnail: the end card at YouTube's recommended 1280x720. */
  const card = await open("explainer.html", "?embed&t=0", 1);
  await card.addStyleTag({ content: ".toggle { display: none !important; }" });
  await card.evaluate((t) => window.tabspackExplainer.seek(t), CARD_TO);
  await card.screenshot({ path: thumb, clip: { x: 0, y: 0, width: 1280, height: 720 } });
} finally {
  ffmpeg.stdin.end();
  await browser.close();
}
await finished;
console.log(`video: ${frames} frames at ${FPS} fps, ${(frames / FPS).toFixed(1)} s, ${path.relative(root, out)}`);
