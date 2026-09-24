import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityNotices, describeCapabilities } from "../../src/core/capabilities.js";
import type { Capabilities } from "../../src/core/adapter/types.js";

const full: Capabilities = {
  tabGroups: true,
  containers: false,
  offscreen: true,
  downloads: true,
  windowBounds: true,
  commands: true,
  discardOnCreate: null,
};

test("the capability table names every probe and reports unknowns honestly", () => {
  const table = describeCapabilities(full);
  assert.match(table, /tab groups\s+yes/);
  assert.match(table, /containers\s+no/);
  assert.match(table, /discard on create\s+unknown/);
});

test("a missing tab groups API produces one notice, not one per tab", () => {
  const notices = capabilityNotices({ ...full, tabGroups: false });
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.id, "no-tab-groups");
});

test("a fully capable browser produces no notices", () => {
  assert.deepEqual(capabilityNotices(full), []);
});
