/**
 * Listing files by a small glob, without `fs.promises.glob`.
 *
 * `glob` landed in node 22 and this project promises node 20 in `package.json`,
 * a promise it broke the first time CI actually ran: the lint step died at
 * import time on node 20 with "does not provide an export named 'glob'". Rather
 * than drop the version the project says it supports, the handful of patterns
 * the build scripts use are matched here.
 *
 * Supported, because it is all that is used: `*` for one path segment, `**` for
 * any depth, and `{a,b}` for alternatives in the final extension. Everything
 * else is a literal. `node_modules`, `dist` and dot directories are never
 * walked, which no caller has ever wanted.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

const SKIP = new Set(["node_modules", "dist", ".git", ".tmp", "coverage"]);

/**
 * Every file under `cwd` matching `pattern`, as paths relative to `cwd`, sorted
 * so a run is reproducible and a failure list is stable.
 */
export async function files(pattern, cwd) {
  const test = matcher(pattern);
  const found = [];
  await walk(cwd, "", found);
  return found.filter(test).sort();
}

async function walk(root, prefix, found) {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await walk(root, relative, found);
    else found.push(relative);
  }
}

/** The pattern as a regular expression, built segment by segment. */
function matcher(pattern) {
  const source = pattern
    .split("/")
    .map((segment) => (segment === "**" ? "(?:.+)" : segmentToSource(segment)))
    .join("/")
    // `a/**/b` has to match `a/b` as well, which is what every shell means by it.
    .replace(/\/\(\?:\.\+\)\//g, "/(?:.+/)?");
  const expression = new RegExp(`^${source}$`);
  return (candidate) => expression.test(candidate);
}

function segmentToSource(segment) {
  let source = "";
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character === "{") {
      const close = segment.indexOf("}", index);
      if (close > index) {
        const options = segment.slice(index + 1, close).split(",");
        source += `(?:${options.map(escape).join("|")})`;
        index = close;
        continue;
      }
    }
    source += escape(character);
  }
  return source;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
