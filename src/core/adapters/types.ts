/**
 * The contract every foreign format reader implements, task T-302.
 *
 * An adapter is a pure function from text to a `TabsPackFile`. It never touches
 * the browser, never does anything async beyond parsing, and never invents
 * structure the source did not carry: a file that says it has one window has one
 * window, per docs/DOMAIN.md business rule 3.
 *
 * The output goes through the same validation and the same reader as a TabsPack
 * file, so an adapter cannot smuggle a malformed document past the checks.
 */
import type { TabsPackFile } from "../../types/tabspack.js";
import type { Issue } from "../issues.js";
import type { SourceInfo } from "../import.js";

export interface AdapterInput {
  /** The file's text, trimmed of a byte order mark. */
  text: string;
  /** Parsed JSON when the text was JSON, undefined otherwise. */
  json: unknown;
}

export interface AdapterResult {
  file: TabsPackFile;
  issues: Issue[];
}

export interface ForeignAdapter extends SourceInfo {
  /** Shape only. Never the file name, never the extension: FR-106. */
  detect(input: AdapterInput): boolean;
  parse(input: AdapterInput): AdapterResult;
}

export const EXPORTED_AT_UNKNOWN = "1970-01-01T00:00:00+00:00";

/** Builds the envelope so no adapter has to remember the required fields. */
export function pack(
  windows: TabsPackFile["windows"],
  options: { name?: string; exportedAt?: string } = {},
): TabsPackFile {
  const tabs = windows.reduce((sum, win) => sum + win.tabs.length, 0);
  const groups = windows.reduce((sum, win) => sum + (win.groups?.length ?? 0), 0);
  return {
    format: "tabspack",
    schemaVersion: 1,
    exportedAt: options.exportedAt ?? EXPORTED_AT_UNKNOWN,
    ...(options.name ? { name: options.name } : {}),
    counts: { windows: windows.length, tabs, groups },
    windows,
  };
}

/** Epoch milliseconds to the format's timestamp, in UTC, or undefined. */
export function isoFrom(value: unknown): string | undefined {
  const millis = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(millis)) return undefined;
  const iso = new Date(millis).toISOString();
  return `${iso.slice(0, 19)}+00:00`;
}

/** A URL a person could have meant, or an empty string. */
export function cleanUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  // A bare host is the commonest thing in a hand made list, and a reader that
  // drops it is a reader that loses a tab over a missing prefix.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(trimmed)) return `https://${trimmed}`;
  return "";
}

export function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
