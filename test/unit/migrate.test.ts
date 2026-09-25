/**
 * T-208. There is nothing to migrate yet, so this suite drives the machinery with
 * the demonstration step described in test/fixtures/migration/README.md. What is
 * being proven is the behaviour the first real migration will depend on: forward
 * only, pure, one step at a time, and a refusal rather than a guess when a step
 * is missing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS, migrateToCurrent, type MigrationStep } from "../../src/core/migrate.js";
import { SCHEMA_VERSION } from "../../src/types/tabspack.js";

const dir = path.join(process.cwd(), "test", "fixtures", "migration");
const before = JSON.parse(readFileSync(path.join(dir, "v1-to-v2.before.json"), "utf8")) as Record<string, unknown>;
const after = JSON.parse(readFileSync(path.join(dir, "v1-to-v2.after.json"), "utf8")) as Record<string, unknown>;

/** The hypothetical change: version 2 marks a pinned tab as sticky. */
const DEMONSTRATION: MigrationStep = {
  from: 1,
  to: 2,
  summary: "pinned tabs gained a sticky flag",
  apply(document) {
    const windows = (document["windows"] as Record<string, unknown>[]) ?? [];
    for (const win of windows) {
      for (const tab of (win["tabs"] as Record<string, unknown>[]) ?? []) {
        tab["sticky"] = tab["pinned"] === true;
      }
    }
    return document;
  },
};

test("the shipped registry is empty, because version 1 is the first version", () => {
  assert.equal(MIGRATIONS.length, 0);
  assert.equal(SCHEMA_VERSION, 1);
  const result = migrateToCurrent(before);
  assert.equal(result.ok, true);
  assert.equal(result.applied.length, 0);
  assert.deepEqual(result.document, before);
});

test("a registered step brings a file up to the target version", () => {
  const result = migrateToCurrent(before, { registry: [DEMONSTRATION], target: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.document, after);
  assert.deepEqual(
    result.applied.map((step) => `${step.from}-${step.to}`),
    ["1-2"],
  );
});

test("migration does not touch the caller's document", () => {
  const original = JSON.parse(JSON.stringify(before)) as Record<string, unknown>;
  migrateToCurrent(before, { registry: [DEMONSTRATION], target: 2 });
  assert.deepEqual(before, original, "a migration receives a copy, never the original");
});

test("the user is told that the file was migrated and that the file on disk is untouched", () => {
  const result = migrateToCurrent(before, { registry: [DEMONSTRATION], target: 2 });
  const note = result.issues.find((issue) => issue.code === "migrate.applied");
  assert.match(note?.message ?? "", /schemaVersion 1 and has been brought up to 2/);
  assert.match(note?.fix ?? "", /file on disk is unchanged/);
});

test("steps are applied in order until the target is reached", () => {
  const second: MigrationStep = {
    from: 2,
    to: 3,
    summary: "sticky became a string",
    apply(document) {
      for (const win of (document["windows"] as Record<string, unknown>[]) ?? []) {
        for (const tab of (win["tabs"] as Record<string, unknown>[]) ?? []) {
          tab["sticky"] = String(tab["sticky"]);
        }
      }
      return document;
    },
  };
  const result = migrateToCurrent(before, { registry: [second, DEMONSTRATION], target: 3 });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.applied.map((step) => step.to),
    [2, 3],
  );
  const tab = ((result.document as Record<string, unknown>)["windows"] as Record<string, unknown>[])[0];
  assert.equal(((tab?.["tabs"] as Record<string, unknown>[])[0] as Record<string, unknown>)["sticky"], "true");
});

test("a missing step is refused by name rather than guessed at", () => {
  const result = migrateToCurrent(before, { registry: [], target: 2 });
  assert.equal(result.ok, false);
  const issue = result.issues[0];
  assert.equal(issue?.code, "migrate.no_path");
  assert.match(issue?.message ?? "", /schemaVersion 1 and TabsPack has no way to bring it up to 2/);
});

test("a file already at the target is left alone", () => {
  const result = migrateToCurrent(after, { registry: [DEMONSTRATION], target: 2 });
  assert.deepEqual(result.document, after);
  assert.equal(result.applied.length, 0);
  assert.equal(result.issues.length, 0);
});
