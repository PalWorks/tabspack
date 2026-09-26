/**
 * Checks the rendered site in `website/`.
 *
 *   node scripts/check-site.mjs
 *
 * A static site fails quietly. A link with a typo, an image that was renamed, a
 * page that lost its description: nothing crashes, the page just gets worse and
 * nobody notices for months. These are the things that go wrong, checked.
 *
 *   1. Every internal link resolves to a file that exists.
 *   2. Every image referenced is on disk, and has width, height and alt.
 *   3. Every page has a title, a description, a canonical and an OG image.
 *   4. Every block of structured data parses as JSON.
 *   5. No page except 404 links to its own origin absolutely, because that is
 *      what breaks the day the site moves to a custom domain.
 *   6. The sitemap lists every page and nothing that does not exist.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { files as walkFiles } from "./lib/walk.mjs";

const root = path.resolve(import.meta.dirname, "..");
const site = path.join(root, "website");
const SITE_ORIGIN = "https://palworks.github.io/tabspack/";

const problems = [];
const fail = (file, detail) => problems.push(`${file}  ${detail}`);

const exists = async (p) => Boolean(await stat(p).catch(() => null));

/*
 * Pages, not every HTML file. `website/assets/` holds documents that live
 * inside a page, like the explainer the home page embeds, which have no header,
 * no canonical and no place in the sitemap by design.
 */
const pages = (await walkFiles("website/**/*.html", root))
  .filter((p) => !p.replaceAll("\\", "/").startsWith("website/assets/"))
  // Search Console's verification file is one line of text for Google, not a page.
  .filter((p) => !/^website\/google[0-9a-f]{16}\.html$/.test(p.replaceAll("\\", "/")))
  .sort();
if (pages.length === 0) {
  console.error("check-site: no pages, run `npm run site`");
  process.exit(1);
}

for (const rel of pages) {
  const file = rel.replaceAll("\\", "/");
  const html = await readFile(path.join(root, file), "utf8");
  const dir = path.dirname(path.join(root, file));
  const is404 = file.endsWith("404.html");

  /* 3. The metadata every page needs. ------------------------------------ */
  const meta = (name, pattern) => {
    if (!pattern.test(html)) fail(file, `missing ${name}`);
  };
  meta("<title>", /<title>[^<]{10,}<\/title>/);
  meta("meta description", /<meta name="description" content="[^"]{50,}"/);
  meta("canonical", /<link rel="canonical" href="https:\/\/[^"]+"/);
  meta("og:title", /<meta property="og:title" content="[^"]{5,}"/);
  meta("og:image", /<meta property="og:image" content="[^"]+\.png"/);
  meta("twitter:card", /<meta name="twitter:card"/);
  meta("lang", /<html lang="en">/);
  meta("skip link", /class="skip"/);

  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
  if (h1s !== 1) fail(file, `${h1s} h1 elements, expected exactly 1`);

  /* 4. Structured data has to parse. -------------------------------------- */
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      fail(file, `structured data is not JSON: ${error.message}`);
    }
  }

  /*
   * 1 and 5. Links, but only the ones a reader follows or a browser fetches.
   * `<link rel=canonical>`, `<link rel=sitemap>` and `og:url` are *required* to
   * be absolute, so a rule about relative links must not look at them.
   */
  const followed = [...html.matchAll(/<(?:a|img|script|iframe)\b[^>]*?(?:href|src)="([^"]+)"[^>]*>/g)];
  for (const match of followed) {
    const href = match[1];
    if (/^(https?:|mailto:|#|data:)/.test(href)) {
      if (!is404 && href.startsWith(SITE_ORIGIN)) {
        fail(file, `absolute self link ${href}: use a relative one so the site can move`);
      }
      continue;
    }
    const [target] = href.split(/[?#]/);
    if (target === "") continue;
    const resolved = path.resolve(dir, target);
    const candidate = resolved.endsWith("/") || !path.extname(resolved)
      ? path.join(resolved, "index.html")
      : resolved;
    if (!(await exists(candidate))) fail(file, `broken link ${href}`);
  }

  for (const match of html.matchAll(/<link\b[^>]*?href="([^"]+)"[^>]*>/g)) {
    const href = match[1];
    if (/^(https?:|data:)/.test(href)) continue;
    const resolved = path.resolve(dir, href.split("#")[0]);
    if (!(await exists(resolved))) fail(file, `broken <link> to ${href}`);
  }

  for (const frame of html.matchAll(/<iframe\b[^>]*>/g)) {
    if (!/\btitle="[^"]{10,}"/.test(frame[0])) fail(file, `iframe without a title: ${frame[0].slice(0, 70)}`);
  }

  /* 2. Images. ------------------------------------------------------------ */
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = img[0];
    if (!/\balt="/.test(tag)) fail(file, `img without alt: ${tag.slice(0, 70)}`);
    if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag)) {
      fail(file, `img without width and height, which makes the page jump: ${tag.slice(0, 70)}`);
    }
  }

  /* In-page anchors have to have somewhere to land. ----------------------- */
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) fail(file, `anchor #${match[1]} has no target on this page`);
  }
}

/* 6. The sitemap. --------------------------------------------------------- */
const sitemap = await readFile(path.join(site, "sitemap.xml"), "utf8").catch(() => "");
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const shouldList = pages
  .filter((p) => !p.endsWith("404.html"))
  .map((p) => {
    const rel = p.replaceAll("\\", "/").replace(/^website\//, "").replace(/index\.html$/, "");
    return `${SITE_ORIGIN}${rel}`;
  })
  .sort();
for (const url of shouldList) {
  if (!listed.includes(url)) fail("website/sitemap.xml", `does not list ${url}`);
}
for (const url of listed) {
  if (!shouldList.includes(url)) fail("website/sitemap.xml", `lists ${url}, which is not a page`);
}
if (!/Sitemap: /.test(await readFile(path.join(site, "robots.txt"), "utf8").catch(() => ""))) {
  fail("website/robots.txt", "does not point at the sitemap");
}
for (const required of ["llms.txt", "llms-full.txt", ".nojekyll", "assets/img/og.png"]) {
  if (!(await exists(path.join(site, required)))) fail(`website/${required}`, "is missing");
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\ncheck-site: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log(`check-site: ${pages.length} pages clean`);
