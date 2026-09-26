/**
 * Deploys the support relay.
 *
 *   node scripts/deploy-relay.mjs [--dry-run]
 *
 * `server/support-worker/wrangler.toml` is committed with two placeholders
 * where the Cloudflare account id and the KV namespace id would be. Neither is
 * a credential, and Cloudflare treats both as safe to commit, but this is a
 * public repository and there is no reason to publish which account anything
 * runs on. They live in `.env` next to the worker, which is not committed.
 *
 * This renders one into the other, deploys, and deletes the rendered file
 * whether or not the deploy worked. `scripts/lint.mjs` fails the build if a
 * real id ever finds its way back into the committed config.
 *
 * The one actual secret, the Resend key, is in none of this. It lives in
 * Cloudflare, set once with `wrangler secret put RESEND_API_KEY`, and survives
 * every deploy.
 */
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "server", "support-worker");
const template = path.join(dir, "wrangler.toml");
const generated = path.join(dir, "wrangler.generated.toml");

/** `.env` first, then the real environment, so CI can supply them as secrets. */
async function values() {
  const env = { ...process.env };
  const file = await readFile(path.join(dir, ".env"), "utf8").catch(() => "");
  for (const line of file.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trimStart().startsWith("#")) env[match[1]] ??= match[2];
  }
  return env;
}

const env = await values();
const missing = ["CLOUDFLARE_ACCOUNT_ID", "COUNTERS_KV_ID"].filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(
    `deploy-relay: ${missing.join(" and ")} not set.\n` +
      `Copy server/support-worker/.env.example to .env and fill it in, or set them in the environment.`,
  );
  process.exit(1);
}

let config = await readFile(template, "utf8");
for (const key of ["CLOUDFLARE_ACCOUNT_ID", "COUNTERS_KV_ID"]) {
  config = config.replaceAll(`__${key}__`, env[key]);
}
const left = config.match(/__([A-Z0-9_]+)__/);
if (left) {
  console.error(`deploy-relay: the config still wants ${left[1]}`);
  process.exit(1);
}

await writeFile(generated, config, "utf8");
try {
  const args = ["--yes", "wrangler@latest", "deploy", "--config", generated];
  if (process.argv.includes("--dry-run")) args.push("--dry-run");
  const run = spawnSync("npx", args, { cwd: dir, stdio: "inherit" });
  process.exitCode = run.status ?? 1;
} finally {
  // Deleted whether or not the deploy worked: a file holding these ids should
  // not outlive the command that needed it.
  await rm(generated, { force: true });
}
