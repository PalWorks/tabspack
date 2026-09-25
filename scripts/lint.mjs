/**
 * Project rules that a general purpose linter would not know about.
 *
 * These are the hard rules from AGENTS.md section 2, enforced rather than
 * trusted. A purpose built script is used instead of an eslint plugin because
 * every rule here is specific to this codebase and this way there is no
 * dependency, no config and no plugin API between the rule and its reason.
 */
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function fail(file, line, rule, detail) {
  failures.push({ file, line, rule, detail });
}

async function files(pattern) {
  const out = [];
  for await (const entry of glob(pattern, { cwd: root })) out.push(entry);
  return out.sort();
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

const NETWORK_ALLOWLIST = ["http://www.w3.org/2000/svg"];

async function ruleNoNetwork() {
  const banned = /\b(fetch|XMLHttpRequest|EventSource|WebSocket|importScripts)\s*\(/g;
  for (const file of await files("src/**/*.{ts,html,css}")) {
    const raw = await readFile(path.join(root, file), "utf8");
    const source = file.endsWith(".ts") ? stripComments(raw) : raw;
    for (const match of source.matchAll(banned)) {
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
    if (manifest.host_permissions) fail(file, 1, "manifest", "host permissions are never allowed");
    if (manifest.content_scripts) fail(file, 1, "manifest", "content scripts are never allowed");
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    if (!csp.includes("script-src 'self'") || !csp.includes("object-src 'none'")) {
      fail(file, 1, "manifest", "extension_pages CSP must pin script-src to self and object-src to none");
    }
  }
}

await ruleAdapterBoundary();
await ruleNoHtmlInjection();
await ruleNoNetwork();
await ruleNoUnexplainedAny();
await ruleManifests();

if (failures.length === 0) {
  console.log("lint: clean");
  process.exit(0);
}

for (const failure of failures) {
  console.error(`${failure.file}:${failure.line}  ${failure.rule}  ${failure.detail}`);
}
console.error(`\nlint: ${failures.length} problem${failures.length === 1 ? "" : "s"}`);
process.exit(1);
