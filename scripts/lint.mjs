/**
 * Project rules that a general purpose linter would not know about.
 *
 * These are the hard rules from AGENTS.md section 2, enforced rather than
 * trusted. A purpose built script is used instead of an eslint plugin because
 * every rule here is specific to this codebase and this way there is no
 * dependency, no config and no plugin API between the rule and its reason.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { files as walkFiles } from "./lib/walk.mjs";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

/**
 * The support relay's address, read from the one file that declares it rather
 * than written here a second time. It also appears in both manifests and in
 * the worker's own route, and `ruleRelayOrigin` below fails the build if any
 * of them disagree: a Send button pointing at a host nobody deployed is a
 * silent failure, and the only cheap defence is to refuse to build. ADR-039.
 */
const RELAY_ORIGIN = (
  /RELAY_ORIGIN = "([^"]+)"/.exec(await readFile(path.join(root, "src/core/relay.ts"), "utf8")) ?? []
)[1];

function fail(file, line, rule, detail) {
  failures.push({ file, line, rule, detail });
}

async function files(pattern) {
  return await walkFiles(pattern, root);
}

/** Comments are stripped before scanning so prose never trips a rule. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length));
}

function lines(source) {
  return source.split("\n");
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

const ADAPTER_DIR = "src/core/adapter/";

async function ruleAdapterBoundary() {
  for (const file of await files("src/**/*.ts")) {
    if (file.replaceAll("\\", "/").startsWith(ADAPTER_DIR)) continue;
    const source = stripComments(await readFile(path.join(root, file), "utf8"));
    for (const match of source.matchAll(/(?<![\w.$])(browser|chrome)\s*\./g)) {
      fail(file, lineOf(source, match.index), "adapter-boundary", `${match[1]}.* is only allowed inside ${ADAPTER_DIR}`);
    }
  }
}

async function ruleNoHtmlInjection() {
  const banned = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(/g;
  for (const file of await files("src/**/*.ts")) {
    const source = stripComments(await readFile(path.join(root, file), "utf8"));
    for (const match of source.matchAll(banned)) {
      fail(file, lineOf(source, match.index), "no-html-injection", "build DOM nodes and set textContent instead");
    }
  }
}

/*
 * The rule forbids remote *resources*: anything the extension would load, which
 * is what makes "no network request of any kind" true. A page the user clicks
 * through to is a navigation, not a resource, and these are the only ones.
 *
 * The store review pages are not here yet, because `src/core/rating.ts` has no
 * listing to link to until something is published: ADR-036. Adding one means
 * adding it here too, which is the reminder that it is a real address.
 */
const NETWORK_ALLOWLIST = [
  "http://www.w3.org/2000/svg",
  // Who made it, linked once at the foot of About: ADR-037.
  "https://palworks.ai",
  // The support relay, which is the one request the extension can make, and
  // only after the user presses Send and grants the host: ADR-039.
  RELAY_ORIGIN,
];

/**
 * The only file allowed to make a request, so "TabsPack talks to exactly one
 * address, from exactly one place" is a fact a reviewer can check in a minute
 * rather than a claim they have to take on trust: ADR-039.
 */
const NETWORK_FILE = "src/core/relay.ts";

async function ruleNoNetwork() {
  const banned = /\b(fetch|XMLHttpRequest|EventSource|WebSocket|importScripts)\s*\(/g;
  for (const file of await files("src/**/*.{ts,html,css}")) {
    const raw = await readFile(path.join(root, file), "utf8");
    const source = file.endsWith(".ts") ? stripComments(raw) : raw;
    const isRelay = file.replaceAll("\\", "/") === NETWORK_FILE;
    for (const match of source.matchAll(banned)) {
      // `fetch` in the relay is the point of the relay. Everything else, and
      // every other transport even there, is still forbidden.
      if (isRelay && match[1] === "fetch") continue;
      fail(file, lineOf(source, match.index), "no-network", `${match[1]} is forbidden: NFR-006`);
    }
    for (const match of source.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
      if (NETWORK_ALLOWLIST.includes(match[0])) continue;
      // `https://${host}` is a scheme being put in front of a value, not a
      // hardcoded remote resource. Anything with a host spelled out still fails.
      if (/^https?:\/\/\$\{/.test(match[0])) continue;
      fail(file, lineOf(source, match.index), "no-remote-resource", `remote URL ${match[0]}`);
    }
  }
}

async function ruleNoUnexplainedAny() {
  for (const file of await files("src/**/*.ts")) {
    const raw = await readFile(path.join(root, file), "utf8");
    const stripped = lines(stripComments(raw));
    const original = lines(raw);
    stripped.forEach((line, index) => {
      if (!/(:|<|as)\s*any\b/.test(line)) return;
      const hasReason = /\/\//.test(original[index] ?? "") || /\/[/*]/.test(original[index - 1] ?? "");
      if (!hasReason) fail(file, index + 1, "explain-any", "any needs a comment naming the reason");
    });
  }
}

/**
 * T-503: every string the interface shows comes from `_locales/en/messages.json`.
 * Two halves to that promise, both checked here: no key without an entry, and no
 * English sentence written straight into the markup or into a DOM call.
 */
async function ruleI18n() {
  const locale = JSON.parse(await readFile(path.join(root, "_locales", "en", "messages.json"), "utf8"));
  const known = new Set(Object.keys(locale));
  const used = new Set();

  const note = (file, line, key) => {
    used.add(key);
    if (!known.has(key)) fail(file, line, "i18n-missing-key", `${key} has no entry in _locales/en/messages.json`);
  };

  for (const file of await files("src/ui/**/*.ts")) {
    const source = stripComments(await readFile(path.join(root, file), "utf8"));
    for (const match of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      note(file, lineOf(source, match.index), match[1]);
    }
    // plural(count, "tabs") reads two entries, one per form.
    for (const match of source.matchAll(/\bplural(?:Unit)?\(\s*[^,]+,\s*"([^"]+)"/g)) {
      note(file, lineOf(source, match.index), `unit_${match[1]}_one`);
      note(file, lineOf(source, match.index), `unit_${match[1]}_other`);
    }
    for (const match of source.matchAll(/\bplural(?:Unit)?\(\s*[^,]+,\s*`([^`$]+)`/g)) {
      note(file, lineOf(source, match.index), `unit_${match[1]}_one`);
    }
  }

  for (const file of await files("src/ui/**/*.html")) {
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(/data-i18n="([^"]+)"/g)) {
      note(file, lineOf(source, match.index), match[1]);
    }
    for (const match of source.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of match[1].split(",")) {
        const key = pair.split(":")[1]?.trim();
        if (key) note(file, lineOf(source, match.index), key);
      }
    }
    for (const [line, text] of visibleText(source)) {
      fail(file, line, "i18n-hardcoded-html", `"${text.slice(0, 40)}" is not marked with data-i18n`);
    }
  }

  for (const file of await files("src/ui/**/*.ts")) {
    const source = stripComments(await readFile(path.join(root, file), "utf8"));
    for (const match of source.matchAll(/\.textContent\s*=\s*"([^"]{2,})"/g)) {
      fail(file, lineOf(source, match.index), "i18n-hardcoded", `"${match[1]}" should come from _locales`);
    }
    for (const match of source.matchAll(/text:\s*"([^"]{2,})"/g)) {
      fail(file, lineOf(source, match.index), "i18n-hardcoded", `"${match[1]}" should come from _locales`);
    }
  }

  /**
   * Keys the interface looks up by a name it builds at runtime, from a report's
   * own vocabulary. The families are listed rather than guessed at, so adding one
   * is a deliberate line here.
   */
  const DYNAMIC = [/^unit_removed_/, /^unit_restore_/, /^cmd/, /^extName$/, /^extDescription$/];

  // A key named anywhere in the interface counts as used, which covers the ones
  // chosen by a ternary or held in a table.
  for (const file of await files("src/ui/**/*.ts")) {
    const source = stripComments(await readFile(path.join(root, file), "utf8"));
    for (const match of source.matchAll(/"([A-Za-z][\w]*)"/g)) {
      if (known.has(match[1])) used.add(match[1]);
    }
  }

  const unused = [...known].filter(
    (key) => !used.has(key) && !DYNAMIC.some((pattern) => pattern.test(key)),
  );
  for (const key of unused) {
    fail("_locales/en/messages.json", 1, "i18n-unused-key", `${key} is not used anywhere`);
  }
}

/**
 * Text a person would read, with the element that holds it. Written as a small
 * scanner rather than a parser: these files are hand written, simple, and the
 * rule only has to catch a sentence somebody forgot to mark.
 */
function visibleText(html) {
  const found = [];
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, " "));
  const body = withoutComments.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, (match) =>
    match.replace(/[^\n]/g, " "),
  );
  const pattern = /<([a-zA-Z][\w-]*)([^>]*)>([^<]*)/g;
  for (const match of body.matchAll(pattern)) {
    const attributes = match[2] ?? "";
    const text = (match[3] ?? "").trim();
    if (text === "" || !/[a-zA-Z]{2}/.test(text)) continue;
    if (attributes.includes("data-i18n")) continue;
    found.push([body.slice(0, match.index).split("\n").length, text]);
  }
  return found;
}

async function ruleManifests() {
  const required = ["tabs", "storage", "downloads"];
  const allowedOptional = ["tabGroups", "offscreen", "sessions"];
  for (const target of ["chrome", "firefox"]) {
    const file = `manifest.${target}.json`;
    const manifest = JSON.parse(await readFile(path.join(root, file), "utf8"));
    if (manifest.manifest_version !== 3) fail(file, 1, "manifest", "manifest_version must be 3");
    const permissions = manifest.permissions ?? [];
    if (permissions.length !== required.length || required.some((p) => !permissions.includes(p))) {
      fail(file, 1, "manifest", `permissions must be exactly ${required.join(", ")}, found ${permissions.join(", ") || "none"}`);
    }
    for (const optional of manifest.optional_permissions ?? []) {
      if (!allowedOptional.includes(optional)) {
        fail(file, 1, "manifest", `optional permission ${optional} is not in the agreed set`);
      }
    }
    if (manifest.host_permissions) fail(file, 1, "manifest", "a required host permission is never allowed");
    const optionalHosts = manifest.optional_host_permissions ?? [];
    if (optionalHosts.length !== 1 || optionalHosts[0] !== `${RELAY_ORIGIN}/*`) {
      fail(
        file,
        1,
        "manifest",
        `optional_host_permissions must be exactly ["${RELAY_ORIGIN}/*"], found ${optionalHosts.join(", ") || "none"}`,
      );
    }
    if (manifest.content_scripts) fail(file, 1, "manifest", "content scripts are never allowed");
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    if (!csp.includes("script-src 'self'") || !csp.includes("object-src 'none'")) {
      fail(file, 1, "manifest", "extension_pages CSP must pin script-src to self and object-src to none");
    }
  }
}

/**
 * The fourth copy of the address: the worker's own route. A deploy that lands
 * somewhere the extension is not allowed to reach is a support form that
 * silently never works, and nothing else in the build would notice.
 */
async function ruleRelayOrigin() {
  const file = "server/support-worker/wrangler.toml";
  if (!RELAY_ORIGIN) {
    fail("src/core/relay.ts", 1, "relay-origin", "RELAY_ORIGIN could not be read");
    return;
  }
  const host = new URL(RELAY_ORIGIN).host;
  const toml = await readFile(path.join(root, file), "utf8");
  const route = /pattern\s*=\s*"([^"]+)"/.exec(toml)?.[1];
  if (route !== host) {
    fail(file, 1, "relay-origin", `route is ${route ?? "missing"} but src/core/relay.ts says ${host}`);
  }
}

await ruleAdapterBoundary();
await ruleNoHtmlInjection();
await ruleNoNetwork();
await ruleNoUnexplainedAny();
await ruleI18n();
await ruleManifests();
await ruleRelayOrigin();

if (failures.length === 0) {
  console.log("lint: clean");
  process.exit(0);
}

for (const failure of failures) {
  console.error(`${failure.file}:${failure.line}  ${failure.rule}  ${failure.detail}`);
}
console.error(`\nlint: ${failures.length} problem${failures.length === 1 ? "" : "s"}`);
process.exit(1);
