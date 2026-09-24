import { test } from "node:test";
import assert from "node:assert/strict";
import { exportFilename, isoWithOffset, textFilename } from "../../src/core/naming.js";

test("the export filename carries the local date and time", () => {
  const when = new Date(2026, 8, 24, 9, 30, 0);
  assert.equal(exportFilename(when), "tabspack-20260924-0930.tabspack.json");
});

test("single digit months, days, hours and minutes are padded", () => {
  const when = new Date(2026, 0, 5, 7, 8, 0);
  assert.equal(exportFilename(when), "tabspack-20260105-0708.tabspack.json");
  assert.equal(textFilename(when, "txt"), "tabspack-20260105-0708.txt");
  assert.equal(textFilename(when, "json"), "tabspack-20260105-0708.json");
});

test("timestamps carry the local offset rather than Z", () => {
  const when = new Date(2026, 8, 24, 8, 29, 40);
  const stamp = isoWithOffset(when);
  assert.match(stamp, /^2026-09-24T08:29:40[+-]\d{2}:\d{2}$/);
  const expectedMinutes = -when.getTimezoneOffset();
  const sign = expectedMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(expectedMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  assert.equal(stamp.slice(-6), offset);
});
