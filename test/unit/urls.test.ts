/**
 * T-205. Which addresses an extension may open. Getting this list wrong either
 * loses tabs silently or fills the report with tabs that would have opened fine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainVerdict, isDangerousScheme, judgeUrl, schemeOf } from "../../src/core/urls.js";

const open = { fileAccess: true };
const closed = { fileAccess: false };

test("ordinary pages are openable", () => {
  for (const url of ["https://example.com/", "http://example.com/a?b=1#c", "ftp://example.com/file"]) {
    assert.equal(judgeUrl(url, closed).openable, true, url);
  }
});

test("privileged schemes are refused with the scheme named", () => {
  for (const url of [
    "chrome://settings/",
    "edge://flags",
    "about:config",
    "javascript:alert(1)",
    "data:text/html,hi",
    "view-source:https://example.com/",
    "chrome-extension://abc/page.html",
    "moz-extension://abc/page.html",
  ]) {
    const verdict = judgeUrl(url, open);
    assert.equal(verdict.openable, false, url);
    if (verdict.openable) return;
    assert.equal(verdict.reason, "blocked_scheme");
    assert.match(explainVerdict(verdict), /No extension is allowed to open/);
  }
});

test("about:blank is the one about address that is allowed", () => {
  assert.equal(judgeUrl("about:blank", closed).openable, true);
  assert.equal(judgeUrl("ABOUT:BLANK", closed).openable, true);
  assert.equal(judgeUrl("about:newtab", closed).openable, false);
});

test("a local file depends on the browser level grant, and says so", () => {
  const refused = judgeUrl("file:///home/example/notes.txt", closed);
  assert.equal(refused.openable, false);
  assert.match(explainVerdict(refused), /file access/);
  assert.equal(judgeUrl("file:///home/example/notes.txt", open).openable, true);
});

test("an address with no scheme is refused rather than guessed at", () => {
  const verdict = judgeUrl("example.com/page", closed);
  assert.equal(verdict.openable, false);
  if (!verdict.openable) assert.equal(verdict.reason, "unparsable");
  assert.equal(judgeUrl("   ", closed).openable, false);
});

test("the schemes that must never become a link are named", () => {
  assert.equal(isDangerousScheme("javascript:alert(1)"), true);
  assert.equal(isDangerousScheme("data:text/html,x"), true);
  assert.equal(isDangerousScheme("chrome://settings/"), false);
  assert.equal(schemeOf("HTTPS://example.com"), "https:");
  assert.equal(schemeOf("no-scheme"), "");
});
