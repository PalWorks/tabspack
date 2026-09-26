/**
 * Renders `website/` from `scripts/site/`.
 *
 *   node scripts/gen-site.mjs            write the site
 *   node scripts/gen-site.mjs --check    fail if what is committed is stale
 *
 * The site is ten pages that share one header and one footer. Written by hand
 * that is ten copies of the same navigation, and the copies drift: a link added
 * to one page and not the other nine is the most ordinary bug a static site
 * has. So the shared parts live in `layout.html`, each page is its body plus a
 * little front matter, and the rendered HTML is committed, because GitHub Pages
 * should serve exactly what is in the repository and not the output of a build
 * nobody can inspect.
 *
 * `--check` is what CI runs: it renders into memory and compares, so a change
 * to the layout that was never regenerated fails the build rather than shipping
 * a footer that disagrees with itself.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "scripts", "site");
const out = path.join(root, "website");
const check = process.argv.includes("--check");

/** Where the site lives, which absolute metadata needs and relative links do not. */
const SITE = "https://palworks.github.io/tabspack/";
const REPO = "https://github.com/PalWorks/tabspack/";
const YEAR = "2026";

const layout = await readFile(path.join(src, "layout.html"), "utf8");

/**
 * A page is front matter and a body, split by the first `---` on its own line.
 * The front matter is JSON rather than YAML: it is read by one script, and a
 * JSON parse error names the line, which a hand rolled YAML reader would not.
 */
function parse(raw, name) {
  const marker = raw.indexOf("\n---\n");
  if (marker === -1) throw new Error(`${name}: no front matter, expected a line of exactly ---`);
  let meta;
  try {
    meta = JSON.parse(raw.slice(0, marker));
  } catch (error) {
    throw new Error(`${name}: front matter is not JSON: ${error.message}`);
  }
  return { meta, body: raw.slice(marker + 5).trimEnd() };
}

/** Structured data, indented to sit inside its script tag legibly. */
function indent(value) {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

const files = (await readdir(path.join(src, "pages"))).filter((n) => n.endsWith(".html")).sort();
const rendered = new Map();

for (const file of files) {
  const raw = await readFile(path.join(src, "pages", file), "utf8");
  const { meta, body } = parse(raw, file);
  const slug = file.replace(".html", "");
  const isHome = slug === "index";
  /*
   * GitHub Pages serves `/404.html` for anything it cannot find, at whatever
   * depth the bad address was, so its links have to resolve from the site root
   * rather than from a directory. That makes it the one page whose relative
   * prefix is the site itself.
   */
  const is404 = slug === "404";
  const rootPath = isHome ? "" : is404 ? SITE : "../";
  const dest = isHome ? "index.html" : is404 ? "404.html" : path.join(slug, "index.html");
  const canonical = isHome ? SITE : `${SITE}${slug}/`;

  const nav = {
    navFeatures: "",
    navPrivacy: "",
    navPricing: "",
    navFaq: "",
    navAbout: "",
    navContact: "",
  };
  const key = `nav${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
  if (key in nav) nav[key] = ' aria-current="page"';

  /*
   * The sitewide graph: who publishes this, what the site is, and where this
   * page sits in it. Emitted on every page rather than only the home page,
   * because an answer engine that cites a legal page still has to be able to
   * say whose policy it is, and a crawler that only ever sees one page of a
   * site should still come away with the organisation behind it.
   */
  const crumbs = [{ "@type": "ListItem", position: 1, name: "TabsPack", item: SITE }];
  if (!isHome) crumbs.push({ "@type": "ListItem", position: 2, name: meta.crumb ?? meta.title, item: canonical });

  const sitewide = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}#org`,
        name: "palworks.ai",
        url: "https://palworks.ai",
        logo: `${SITE}assets/img/icon-128.png`,
        sameAs: ["https://github.com/PalWorks", "https://palworks.ai"],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@palworks.ai",
          url: `${SITE}contact/`,
          availableLanguage: ["en"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}#site`,
        name: "TabsPack",
        url: SITE,
        inLanguage: "en",
        publisher: { "@id": `${SITE}#org` },
        description:
          "TabsPack exports every open browser tab to one file and restores them exactly as they were, in Chrome, Edge or Firefox.",
      },
      {
        "@type": meta.pageType ?? "WebPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: meta.title,
        description: meta.description,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE}#site` },
        about: { "@id": `${SITE}#org` },
        primaryImageOfPage: `${SITE}assets/img/og.png`,
        ...(meta.modified ? { dateModified: meta.modified } : {}),
        ...(meta.published ? { datePublished: meta.published } : {}),
      },
      { "@type": "BreadcrumbList", "@id": `${canonical}#crumbs`, itemListElement: crumbs },
    ],
  };

  const values = {
    ...nav,
    robots: is404
      ? "noindex, follow"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    keywords: (meta.keywords ?? []).join(", "),
    modified: meta.modified
      ? `<meta property="article:modified_time" content="${meta.modified}" />`
      : "<!-- no modification date: this page is not dated content -->",
    sitewide: indent(sitewide),
    title: meta.title,
    ogTitle: meta.ogTitle ?? meta.title,
    description: meta.description,
    canonical,
    site: SITE,
    root: rootPath,
    repo: REPO,
    year: YEAR,
    body,
    jsonld: indent(
      meta.jsonld ?? { "@context": "https://schema.org", "@type": "WebPage", name: meta.title, url: canonical },
    ),
  };

  let html = layout;
  for (const [token, value] of Object.entries(values)) {
    html = html.replaceAll(`{{${token}}}`, value);
  }
  const left = html.match(/\{\{(\w+)\}\}/);
  if (left) throw new Error(`${file}: the layout still wants ${left[1]}`);
  rendered.set(dest, `${html.trimEnd()}\n`);
}

/* The files that are copied through rather than rendered. ------------------ */

/*
 * Every crawler is allowed, including the ones that train and the ones that
 * answer. A product whose pitch is that it does not hide anything would look
 * ridiculous blocking GPTBot, and being quotable by an answer engine is worth
 * more to something nobody has heard of than the alternative.
 */
rendered.set(
  "robots.txt",
  [
    "User-agent: *",
    "Allow: /",
    "",
    "# Answer engines and model crawlers are welcome. See /llms.txt for a",
    "# plain text summary written for them rather than extracted from markup.",
    ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bingbot"].flatMap(
      (agent) => [`User-agent: ${agent}`, "Allow: /", ""],
    ),
    `Sitemap: ${SITE}sitemap.xml`,
    "",
  ].join("\n"),
);

const urls = [...rendered.keys()]
  .filter((dest) => dest.endsWith("index.html"))
  // A 404 is a real page and must never be in a sitemap.
  .filter((dest) => !dest.startsWith("404"))
  .map((dest) => (dest === "index.html" ? SITE : `${SITE}${path.dirname(dest)}/`));
rendered.set(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${url}</loc><changefreq>monthly</changefreq><priority>${url === SITE ? "1.0" : "0.7"}</priority></url>`)
    .join("\n")}\n</urlset>\n`,
);

/*
 * `llms.txt`, for the answer engines. A model summarising TabsPack from a
 * rendered page gets the marketing; this gives it the facts in the order it
 * would need them, which is the whole point of the convention.
 */
rendered.set("llms.txt", await readFile(path.join(src, "llms.txt"), "utf8"));
rendered.set("llms-full.txt", await readFile(path.join(src, "llms-full.txt"), "utf8"));

/**
 * The JSON Schema, published at the address it declares as its own `$id`.
 *
 * It is copied from `schema/` rather than written here, so there is one schema
 * and the site serves it rather than a second copy of it. `--check` therefore
 * fails if the schema is regenerated without regenerating the site, and
 * `scripts/lint.mjs` fails if the `$id` and this path ever disagree. T-717,
 * ADR-043.
 */
rendered.set(
  "schema/tabspack.v1.schema.json",
  await readFile(path.join(root, "schema", "tabspack.v1.schema.json"), "utf8"),
);

if (check) {
  const problems = [];
  for (const [dest, expected] of rendered) {
    const actual = await readFile(path.join(out, dest), "utf8").catch(() => null);
    if (actual !== expected) problems.push(dest);
  }
  if (problems.length > 0) {
    console.error(`site: stale, run \`npm run site\`:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`site: ${rendered.size} files up to date`);
  process.exit(0);
}

for (const [dest, contents] of rendered) {
  const full = path.join(out, dest);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents, "utf8");
}
await writeFile(path.join(out, ".nojekyll"), "", "utf8");
console.log(`site: ${rendered.size} files written to website/`);
