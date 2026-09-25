/**
 * The one entry point the interface calls with a file's text.
 *
 * Everything the import path does happens here, in order: work out what the text
 * is, convert it if it came from another tool, migrate it forward, validate it,
 * then read it into a `Session`. The interface never calls the stages
 * separately, so there is one place where the order is defined and one object
 * that describes the outcome.
 *
 * A foreign format is converted into a `TabsPackFile` and then goes through
 * exactly the same validation and the same reader as a file that arrived as one.
 * An adapter cannot smuggle a malformed document past the checks.
 */
import type { Session } from "../types/session.js";
import { detect, inputFor, unrecognised } from "./adapters/detect.js";
import type { AdapterInput, ForeignAdapter } from "./adapters/types.js";
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
  const input = inputFor(text);

  // A TabsPack file says so in its first field. Anything else is offered to the
  // foreign format readers first.
  if (!isTabsPackDocument(input)) {
    const adapter = detect(input);
    if (adapter) return loadForeign(adapter, input, options);
    // A JSON object that nothing recognised is far more often a TabsPack file
    // with something wrong with it than another tool's format, and "add a format
    // field" is a better answer than "unrecognised".
    if (!isObject(input.json)) {
      // Text that was meant to be JSON and is not parseable deserves the parse
      // error naming the byte, not a list of formats it is not.
      const looksLikeJson = /^\s*[{[]/.test(input.text);
      const parseIssue = looksLikeJson ? parseJson(input.text).issue : undefined;
      return { ok: false, source: null, issues: [parseIssue ?? unrecognised()] };
    }
  }

  const parsed = parseJson(input.text);
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

function isTabsPackDocument(input: AdapterInput): boolean {
  if (isObject(input.json)) return input.json["format"] === TABSPACK_SOURCE.id;
  // Text that is not parseable JSON but starts like a JSON object is a damaged
  // pack far more often than it is another tool's format, and the parse error
  // naming the byte is more useful than "unrecognised".
  return input.json === undefined && input.text.trimStart().startsWith("{");
}

/**
 * Everything that did not arrive as a TabsPack file. The adapter converts, and
 * from there the path is identical, which is what keeps one set of rules for
 * what a valid pack is.
 */
function loadForeign(adapter: ForeignAdapter, input: AdapterInput, options: LoadOptions): LoadResult {
  const converted = adapter.parse(input);
  const source: SourceInfo = {
    id: adapter.id,
    label: adapter.label,
    fidelity: adapter.fidelity,
    carries: adapter.carries,
    missing: adapter.missing,
  };

  const validated = validateFile(converted.file);
  const issues = [...converted.issues, ...validated.issues];
  if (!validated.ok || !validated.file) {
    return { ok: false, source, issues };
  }

  const read = fromFile(validated.file, options);
  const all = [...issues, ...read.issues];
  if (errors(all).length > 0) return { ok: false, source, issues: all };
  if (read.session.windows.length === 0) {
    return {
      ok: false,
      source,
      issues: [
        ...all,
        {
          code: "detect.nothing_found",
          severity: "error",
          path: "$",
          message: `This file was read as ${adapter.label.toLowerCase()}, and it holds no addresses.`,
          fix: "Check that the file is not empty, and that its addresses start with a scheme such as https.",
        },
      ],
    };
  }
  return { ok: true, session: read.session, source, issues: all };
}
