/**
 * Schema conformance, task T-102.
 *
 * Every fixture in test/fixtures/valid must validate against the generated
 * schema. Every fixture in invalid and edge must behave exactly as
 * test/fixtures/expectations.json says, so a fixture can never quietly change
 * meaning: an unexpected pass is as much a failure as an unexpected rejection.
 */
import Ajv from "ajv";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const schema = JSON.parse(await readFile(path.join(root, "schema", "tabspack.v1.schema.json"), "utf8"));
const expectations = JSON.parse(
  await readFile(path.join(root, "test", "fixtures", "expectations.json"), "utf8"),
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const failures = [];
let checked = 0;

async function listFixtures(dir) {
  const found = [];
  for await (const entry of glob(`test/fixtures/${dir}/*.json`, { cwd: root })) {
    if (entry.endsWith("expectations.json")) continue;
    found.push(entry);
  }
  return found.sort();
}

function parse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

for (const file of await listFixtures("valid")) {
  checked += 1;
  const parsed = parse(await readFile(path.join(root, file), "utf8"));
  if (!parsed.ok) {
    failures.push(`${file}: expected valid JSON, got ${parsed.error}`);
    continue;
  }
  if (!validate(parsed.value)) {
    failures.push(`${file}: expected to validate, but ${ajv.errorsText(validate.errors)}`);
  }
}

for (const dir of ["invalid", "edge"]) {
  for (const file of await listFixtures(dir)) {
    checked += 1;
    const name = path.basename(file);
    const expectation = expectations[dir]?.[name];
    if (!expectation) {
      failures.push(`${file}: no entry in test/fixtures/expectations.json`);
      continue;
    }
    const parsed = parse(await readFile(path.join(root, file), "utf8"));
    if (parsed.ok !== expectation.parses) {
      failures.push(`${file}: expected parses=${expectation.parses}, got ${parsed.ok}`);
      continue;
    }
    if (!parsed.ok) continue;
    const valid = validate(parsed.value);
    if (valid !== expectation.schemaValid) {
      failures.push(
        `${file}: expected schemaValid=${expectation.schemaValid}, got ${valid}` +
          (valid ? "" : ` (${ajv.errorsText(validate.errors)})`),
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`schema-conformance: ${failure}`);
  console.error(`\nschema-conformance: ${failures.length} of ${checked} fixtures behaved unexpectedly`);
  process.exit(1);
}

console.log(`schema-conformance: ${checked} fixtures behaved as expectations.json says`);
