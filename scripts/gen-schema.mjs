/**
 * Generates schema/tabspack.v1.schema.json from src/types/tabspack.ts.
 *
 *   node scripts/gen-schema.mjs           write the schema
 *   node scripts/gen-schema.mjs --check   fail if the file on disk differs
 *
 * The types are the single source of truth, so the generated file is never
 * edited by hand: --check runs in CI and turns a hand edit into a failed build.
 */
import { createGenerator } from "ts-json-schema-generator";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "schema", "tabspack.v1.schema.json");
const check = process.argv.includes("--check");

const generator = createGenerator({
  path: path.join(root, "src", "types", "tabspack.ts"),
  tsconfig: path.join(root, "tsconfig.json"),
  type: "TabsPackFile",
  additionalProperties: true,
  topRef: false,
  expose: "export",
  jsDoc: "extended",
  skipTypeCheck: true,
});

const schema = generator.createSchema("TabsPackFile");
tighten(schema);

const document = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://tabspack.dev/schema/tabspack.v1.schema.json",
  title: "TabsPack file, schema version 1",
  ...schema,
  description:
    "Generated from src/types/tabspack.ts by scripts/gen-schema.mjs. Normative prose: docs/SPEC.md. Never edit by hand.",
};
const serialised = `${JSON.stringify(document, null, 2)}\n`;

/**
 * Two transforms the type system cannot express, applied here rather than by
 * hand so the output stays reproducible:
 *
 *   1. TypeScript has one number type, so counts, indices and pixel bounds are
 *      narrowed to JSON Schema integers by name.
 *   2. `additionalProperties` is stated explicitly on every object, because
 *      SPEC section 7 makes accepting unknown fields a MUST rather than a
 *      default a reader has to infer.
 */
function tighten(node) {
  const INTEGER_FIELDS = new Set([
    "schemaVersion",
    "index",
    "openerIndex",
    "windows",
    "tabs",
    "groups",
    "left",
    "top",
    "width",
    "height",
  ]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.type === "object" || value.properties) {
      if (value.additionalProperties === undefined) value.additionalProperties = true;
      for (const [name, child] of Object.entries(value.properties ?? {})) {
        if (INTEGER_FIELDS.has(name)) toInteger(child);
        visit(child);
      }
    }
    for (const key of ["items", "definitions", "anyOf", "oneOf", "allOf"]) {
      if (value[key]) visit(value[key]);
    }
    if (value.definitions) {
      for (const child of Object.values(value.definitions)) visit(child);
    }
  };
  visit(node);
}

function toInteger(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "number") node.type = "integer";
  if (Array.isArray(node.type)) node.type = node.type.map((t) => (t === "number" ? "integer" : t));
  for (const key of ["anyOf", "oneOf"]) {
    for (const child of node[key] ?? []) toInteger(child);
  }
}

if (check) {
  let existing = null;
  try {
    existing = await readFile(output, "utf8");
  } catch {
    console.error("schema: schema/tabspack.v1.schema.json is missing. Run npm run schema.");
    process.exit(1);
  }
  if (existing !== serialised) {
    console.error(
      "schema: the generated schema does not match src/types/tabspack.ts.\n" +
        "Either the types changed without regenerating, or the file was edited by hand.\n" +
        "Run npm run schema, and follow docs/PLAYBOOK.md section 4 if the format really is changing.",
    );
    process.exit(1);
  }
  console.log("schema: up to date");
  process.exit(0);
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, serialised, "utf8");
console.log(`schema: wrote ${path.relative(root, output)}`);
