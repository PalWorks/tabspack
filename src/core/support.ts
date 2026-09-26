/**
 * The support message, composed here so that what is sent can be tested and,
 * more to the point, shown to the user before it goes anywhere.
 *
 * TabsPack's promise is that nothing leaves the device. A support form is the
 * one exception a user asks for themselves, so it is held to the rule that
 * makes the exception safe: **the message is exactly what is on screen.** No
 * field is added on the way out, nothing is collected in the background, and
 * the diagnostics are a short list the user can read and switch off. No tab
 * address, no tab title and no count of either ever appears in it: ADR-035.
 */

export type SupportTopic = "broken" | "idea" | "question" | "other";

export interface SupportContext {
  /** From `adapter.platform()`. */
  extensionVersion: string;
  browser: string;
  browserVersion: string;
  os: string;
  /** Whether the optional tab groups permission is granted. */
  tabGroups: boolean;
  /** The handful of settings that change what the product does. */
  recoverSuspended: boolean;
  unloadRestored: boolean;
}

export interface SupportDraft {
  topic: SupportTopic;
  /** What the user typed. The whole point of the form. */
  message: string;
  /** Optional: there is no reply without it, and that is the user's choice. */
  replyTo: string;
  /** Whether the lines in `diagnostics` are attached. */
  includeContext: boolean;
}

export interface ComposedMessage {
  subject: string;
  body: string;
  /** The diagnostic lines on their own, so the interface can show them. */
  diagnostics: string[];
}

const TOPIC_LABELS: Record<SupportTopic, string> = {
  broken: "Something is broken",
  idea: "A suggestion",
  question: "A question",
  other: "Something else",
};

/** A draft with nothing in it is not a message, and the button says so. */
export function isSendable(draft: SupportDraft): boolean {
  return draft.message.trim().length >= 10;
}

/**
 * The email address is only checked for the shape that makes a reply possible.
 * A stricter rule rejects real addresses, and the cost of a wrong one is a
 * reply that bounces, not a failure here.
 */
export function replyToLooksUsable(replyTo: string): boolean {
  const value = replyTo.trim();
  if (value === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function diagnosticLines(context: SupportContext): string[] {
  return [
    `TabsPack ${context.extensionVersion}`,
    `${context.browser} ${context.browserVersion} on ${context.os}`,
    `Tab groups permission: ${context.tabGroups ? "granted" : "not granted"}`,
    `Recover suspended tabs: ${context.recoverSuspended ? "on" : "off"}`,
    `Open tabs asleep: ${context.unloadRestored ? "on" : "off"}`,
  ];
}

export function composeSupportMessage(draft: SupportDraft, context: SupportContext): ComposedMessage {
  const diagnostics = diagnosticLines(context);
  const parts = [draft.message.trim()];

  if (draft.replyTo.trim() !== "") parts.push(`Reply to: ${draft.replyTo.trim()}`);
  if (draft.includeContext) parts.push(diagnostics.join("\n"));

  return {
    subject: `TabsPack ${context.extensionVersion}: ${TOPIC_LABELS[draft.topic]}`,
    // A blank line between blocks, and nothing else added. What the user reads
    // on screen and what leaves are the same string.
    body: `${parts.join("\n\n")}\n`,
    diagnostics,
  };
}

/**
 * A `mailto:` address for the composed message.
 *
 * This is the shipped route, because the alternative is an API key inside a
 * published extension, which is a key anybody can read: ADR-035. The user's own
 * mail client sends the mail, so the extension makes no network request and the
 * user sees the message one more time before it goes.
 *
 * Mail clients and the browsers that hand off to them disagree about how long a
 * `mailto:` may be, and a truncated bug report is worse than none, so a long
 * message is refused here rather than silently cut. The interface offers Copy
 * instead.
 */
export const MAILTO_LIMIT = 1800;

export function mailtoUrl(to: string, message: ComposedMessage): string | null {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
  return url.length > MAILTO_LIMIT ? null : url;
}
