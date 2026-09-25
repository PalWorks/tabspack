/**
 * T-201. Every malformed fixture must fail with a message a person could act on,
 * and no two failures may be the same message: a distinct code per cause is what
 * stops "import failed" from being the whole of the user's information.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gateVersion, parseJson, validateFile } from "../../src/core/schema.js";
import { loadPack } from "../../src/core/import.js";
import { errors, warnings } from "../../src/core/issues.js";

const fixtures = path.join(process.cwd(), "test", "fixtures");
const expectations = JSON.parse(
  readFileSync(path.join(fixtures, "expectations.json"), "utf8"),
) as Record<string, Record<string, { readerAccepts: boolean; why: string }>>;

function read(dir: string, name: string): string {
  return readFileSync(path.join(fixtures, dir, name), "utf8");
}

test("every valid fixture loads", () => {
  for (const name of readdirSync(path.join(fixtures, "valid"))) {
    const result = loadPack(read("valid", name));
    assert.equal(result.ok, true, `${name}: ${errors(result.issues)[0]?.message ?? "unknown"}`);
    assert.ok(result.session);
  }
});

test("each invalid and edge fixture behaves as expectations.json says, with a distinct cause", () => {
  const codes = new Set<string>();
  for (const dir of ["invalid", "edge"]) {
    for (const [name, expectation] of Object.entries(expectations[dir] ?? {})) {
      const result = loadPack(read(dir, name));
      assert.equal(
        result.ok,
        expectation.readerAccepts,
        `${dir}/${name} should ${expectation.readerAccepts ? "load" : "fail"}: ${expectation.why}`,
      );
      if (expectation.readerAccepts) continue;
      const first = errors(result.issues)[0];
      assert.ok(first, `${dir}/${name} failed without saying why`);
      assert.ok(first.fix && first.fix.length > 10, `${dir}/${name} failed without a fix`);
      assert.ok(first.path.startsWith("$"), `${dir}/${name} failed without a path`);
      assert.equal(codes.has(first.code), false, `${dir}/${name} reuses the code ${first.code}`);
      codes.add(first.code);
    }
  }
  assert.ok(codes.size >= 6);
});

test("a future version is refused by name and never parsed on a best effort basis", () => {
  const result = loadPack(read("edge", "future-version.tabspack.json"));
  assert.equal(result.ok, false);
  assert.equal(result.session, undefined);
  const issue = errors(result.issues)[0];
  assert.equal(issue?.code, "version.too_new");
  assert.match(issue?.message ?? "", /schemaVersion 2/);
  assert.match(issue?.message ?? "", /understands 1/);
});

test("the version gate names what it found", () => {
  assert.equal(gateVersion(1), null);
  assert.equal(gateVersion(undefined)?.code, "version.missing");
  assert.equal(gateVersion("1")?.code, "version.not_integer");
  assert.equal(gateVersion(1.5)?.code, "version.not_integer");
  assert.equal(gateVersion(0)?.code, "version.below_one");
  assert.equal(gateVersion(99)?.code, "version.too_new");
});

test("a truncated file says where it stopped making sense", () => {
  const result = parseJson(read("invalid", "truncated.json"));
  assert.equal(result.ok, false);
  assert.match(result.issue?.message ?? "", /not valid JSON at (byte|line) \d+/);
});

test("an empty file is not reported as a JSON problem", () => {
  assert.equal(parseJson("   ").issue?.code, "parse.empty");
});

test("errors carry the path of the object that caused them", () => {
  const result = validateFile({
    format: "tabspack",
    schemaVersion: 1,
    exportedAt: "2026-09-24T08:29:40+00:00",
    windows: [{ tabs: [{ url: "https://example.com/" }, { title: "no url" }] }],
  });
  assert.equal(result.ok, false);
  assert.equal(errors(result.issues)[0]?.path, "$.windows[0].tabs[1].url");
});

test("a missing export time is a warning, not a refusal", () => {
  const result = validateFile({
    format: "tabspack",
    schemaVersion: 1,
    windows: [{ tabs: [{ url: "https://example.com/" }] }],
  });
  assert.equal(result.ok, true);
  assert.equal(warnings(result.issues)[0]?.code, "exported_at.missing");
});

test("a list of URLs is not mistaken for a damaged TabsPack file", () => {
  const result = loadPack('["https://example.com/a","https://example.com/b"]');
  assert.equal(result.ok, false);
  assert.equal(result.source, null);
  assert.equal(errors(result.issues)[0]?.code, "root.not_object");
});
