/**
 * Format detection, task T-302.
 *
 * By document shape, never by file name or extension. File extensions lie, users
 * rename files, and every competitor writes `.json`, so a reader that trusts the
 * name is a reader that fails on the first renamed file.
 *
 * Order matters, and it runs from the most specific shape to the most general: a
 * Tab Session Manager export is also a JSON array, and a OneTab export is also a
 * list of lines. Each adapter's `detect` is a shape test, and the first one that
 * says yes wins.
 */
import type { Issue } from "../issues.js";
import { error } from "../issues.js";
import { csvList } from "./csv.js";
import { flatJson } from "./flat-json.js";
import { netscapeBookmarks } from "./netscape.js";
import { oneTab } from "./onetab.js";
import { sessionBuddyJson } from "./session-buddy.js";
import { tabSessionManager } from "./tsm.js";
import { markdownLinks, urlList } from "./text.js";
import type { AdapterInput, ForeignAdapter } from "./types.js";

/** Most specific first. The registry order is the detection order. */
export const ADAPTERS: readonly ForeignAdapter[] = [
  tabSessionManager,
  sessionBuddyJson,
  flatJson,
  netscapeBookmarks,
  oneTab,
  markdownLinks,
  csvList,
  urlList,
];

export function inputFor(text: string): AdapterInput {
  // A byte order mark at the front of a file would defeat every shape test.
  const clean = text.replace(/^﻿/, "");
  let json: unknown;
  const trimmed = clean.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      json = JSON.parse(clean) as unknown;
    } catch {
      json = undefined;
    }
  }
  return { text: clean, json };
}

export function detect(input: AdapterInput): ForeignAdapter | null {
  for (const adapter of ADAPTERS) {
    try {
      if (adapter.detect(input)) return adapter;
    } catch {
      /* a detector that throws is a detector that said no */
    }
  }
  return null;
}

/** The failure a person sees when nothing recognised their file. */
export function unrecognised(): Issue {
  return error(
    "detect.unrecognised",
    "$",
    "TabsPack does not recognise what is in this file.",
    `It was read as ${ADAPTERS.map((adapter) => adapter.label).join(", ")}, and as a TabsPack file. If it came from another tool, please report it: every format TabsPack can read started as someone's file.`,
  );
}
