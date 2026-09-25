/**
 * The one entry point the interface calls with a file's text.
 *
 * Everything the import path does happens here in order: detect what the text
 * is, migrate it forward, validate it, then read it into a `Session`. The
 * interface never calls the stages separately, so there is one place where the
 * order is defined and one object that describes the outcome.
 *
 * Foreign formats are recognised at M3, which adds a detector in front of the
 * TabsPack path. Until then anything that is not a TabsPack document fails with
 * a message naming what was tried.
 */
import type { Session } from "../types/session.js";
import { fromFile } from "./deserialize.js";
import type { Issue } from "./issues.js";
import { errors } from "./issues.js";
import { migrateToCurrent } from "./migrate.js";
import { isObject, parseJson, validateFile } from "./schema.js";

export type Fidelity = "high" | "medium" | "low";

/** What a source format could carry, so the interface can say what was lost. */
export interface SourceInfo {
  id: string;
  label: string;
  fidelity: Fidelity;
  carries: string[];
  missing: string[];
}

export const TABSPACK_SOURCE: SourceInfo = {
  id: "tabspack",
  label: "TabsPack file",
  fidelity: "high",
  carries: ["Windows", "Tab order", "Pinned tabs", "Active tab", "Tab groups", "Window size and state"],
  missing: [],
};

export interface LoadResult {
  ok: boolean;
  session?: Session;
  /** Null when nothing recognised the text. */
  source: SourceInfo | null;
  issues: Issue[];
}

export interface LoadOptions {
  /** Used when a file carries no export time. Tests pass a fixed value. */
  now?: number;
}

export function loadPack(text: string, options: LoadOptions = {}): LoadResult {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return { ok: false, source: null, issues: [parsed.issue as Issue] };
  }

  const migrated = migrateToCurrent(parsed.value);
  if (!migrated.ok) {
    return { ok: false, source: TABSPACK_SOURCE, issues: migrated.issues };
  }

  const validated = validateFile(migrated.document);
  const issues = [...migrated.issues, ...validated.issues];
  if (!validated.ok || !validated.file) {
    return { ok: false, source: sourceFor(migrated.document), issues };
  }

  const read = fromFile(validated.file, options);
  const all = [...issues, ...read.issues];
  if (errors(all).length > 0) {
    return { ok: false, source: TABSPACK_SOURCE, issues: all };
  }
  return { ok: true, session: read.session, source: TABSPACK_SOURCE, issues: all };
}

/**
 * A document that failed validation may still have said what it is, which makes
 * the difference between "this TabsPack file is damaged" and "this is not a
 * TabsPack file at all".
 */
function sourceFor(document: unknown): SourceInfo | null {
  const format = isObject(document) ? document["format"] : undefined;
  return format === TABSPACK_SOURCE.id ? TABSPACK_SOURCE : null;
}
