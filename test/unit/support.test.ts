/**
 * T-710. The support message, and the one promise that makes a form acceptable
 * in a product whose headline is that nothing leaves your device: what is sent
 * is exactly what is shown, and none of it is about your tabs. ADR-035.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeSupportMessage,
  diagnosticLines,
  isSendable,
  mailtoUrl,
  replyToLooksUsable,
  MAILTO_LIMIT,
  type SupportContext,
  type SupportDraft,
} from "../../src/core/support.js";

const context: SupportContext = {
  extensionVersion: "0.0.2",
  browser: "Microsoft Edge",
  browserVersion: "153",
  os: "linux",
  tabGroups: false,
  recoverSuspended: true,
  unloadRestored: true,
};

const draft: SupportDraft = {
  topic: "broken",
  message: "The preview did not appear after I chose a file.",
  replyTo: "",
  includeContext: true,
};

test("the message is the user's words, and the subject names the topic", () => {
  const composed = composeSupportMessage(draft, context);
  assert.equal(composed.subject, "TabsPack 0.0.2: Something is broken");
  assert.ok(composed.body.startsWith("The preview did not appear after I chose a file."));
});

test("the diagnostics are the lines the interface shows, and nothing else", () => {
  const composed = composeSupportMessage(draft, context);
  assert.deepEqual(composed.diagnostics, diagnosticLines(context));
  for (const line of composed.diagnostics) {
    assert.ok(composed.body.includes(line), `${line} is in the body it was shown for`);
  }
});

test("switching the diagnostics off leaves them out entirely", () => {
  const composed = composeSupportMessage({ ...draft, includeContext: false }, context);
  for (const line of diagnosticLines(context)) {
    assert.equal(composed.body.includes(line), false, `${line} must not travel when it was switched off`);
  }
  assert.equal(composed.body.trim(), draft.message);
});

/*
 * The rule the whole feature rests on. A support message that quietly carried a
 * tab address would break the one promise on the store listing, so it is a test
 * rather than a habit.
 */
test("nothing about the user's tabs is ever in the message", () => {
  const composed = composeSupportMessage(
    { ...draft, message: "it broke", replyTo: "someone@example.com" },
    context,
  );
  const forbidden = ["http://", "https://", "tabs open", "windows open", "favIconUrl"];
  for (const needle of forbidden) {
    assert.equal(composed.body.includes(needle), false, `"${needle}" must never appear`);
  }
  assert.ok(composed.body.includes("Reply to: someone@example.com"), "the address the user typed does travel");
});

test("a reply address travels only when the user gives one", () => {
  assert.equal(composeSupportMessage(draft, context).body.includes("Reply to:"), false);
});

test("an empty or tiny message is not sendable", () => {
  assert.equal(isSendable({ ...draft, message: "" }), false);
  assert.equal(isSendable({ ...draft, message: "   " }), false);
  assert.equal(isSendable({ ...draft, message: "broken" }), false, "six characters is not a report");
  assert.equal(isSendable(draft), true);
});

test("an address is checked for the shape that makes a reply possible, and no more", () => {
  assert.equal(replyToLooksUsable(""), true, "no address is a choice, not an error");
  assert.equal(replyToLooksUsable("someone@example.com"), true);
  assert.equal(replyToLooksUsable("someone+tag@sub.example.co.uk"), true);
  assert.equal(replyToLooksUsable("someone"), false);
  assert.equal(replyToLooksUsable("someone@"), false);
  assert.equal(replyToLooksUsable("someone@example"), false);
});

test("a mailto carries the whole message, and refuses rather than truncate", () => {
  const url = mailtoUrl("support@example.com", composeSupportMessage(draft, context));
  assert.ok(url && url.startsWith("mailto:support%40example.com?"));
  assert.ok(url.includes(encodeURIComponent("Something is broken")));

  const huge = composeSupportMessage({ ...draft, message: "x".repeat(4000) }, context);
  assert.equal(
    mailtoUrl("support@example.com", huge),
    null,
    "a truncated bug report is worse than none, so the interface offers Copy instead",
  );
  assert.ok(MAILTO_LIMIT > 1000, "the limit is a real one, not a token");
});
