/**
 * Validation and the version gate, task T-201.
 *
 * Hand written rather than driven by the published JSON Schema, for two
 * reasons. An ajv build would be a runtime dependency, and AGENTS.md section 2
 * allows exactly one. More importantly the reader is deliberately more
 * permissive than the schema in the ways docs/SPEC.md documents: an unknown
 * group colour falls back to grey, a non integer index is reordered, and a
 * missing `exportedAt` is filled in. The schema describes what a writer must
 * emit; this file describes what a reader must survive.
 *
 * Every failure carries a JSON path and a fix. A bare boolean would tell the
 * user nothing, which is the whole problem this task exists to solve.
 */
import type { TabsPackFile } from "../types/tabspack.js";
import { FORMAT, SCHEMA_VERSION } from "../types/tabspack.js";
import type { Issue } from "./issues.js";
import { error, jsonPath, warning } from "./issues.js";

export interface ParseResult {
  ok: boolean;
  value?: unknown;
  issue?: Issue;
}

export interface ValidationResult {
  ok: boolean;
  /** Present only when `ok`. Still unmigrated: see `migrate.ts`. */
  file?: TabsPackFile;
  issues: Issue[];
}

/**
 * JSON.parse with a usable failure. The byte offset is the only thing that makes
 * a truncated file diagnosable, so it is extracted from the engine's message
 * when the engine reports it.
 */
export function parseJson(text: string): ParseResult {
  if (text.trim() === "") {
    return {
      ok: false,
      issue: error("parse.empty", "$", "This file is empty.", "Choose a file that contains an export."),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const at = /position (\d+)/.exec(message)?.[1];
    const line = /line (\d+)/.exec(message)?.[1];
    const where = at ? ` at byte ${at}` : line ? ` at line ${line}` : "";
    return {
      ok: false,
      issue: error(
        "parse.invalid_json",
        "$",
        `This file is not valid JSON${where}.`,
        "The file is probably truncated. Export it again, or open it in a text editor and check the end of the file.",
      ),
    };
  }
}

/**
 * The version gate. A file from a future version is refused by name and never
 * parsed on a best effort basis: docs/SPEC.md section 9. A lower version is
 * accepted here and migrated by `migrate.ts`.
 */
export function gateVersion(value: unknown): Issue | null {
  const path = jsonPath("schemaVersion");
  if (value === undefined || value === null) {
    return error(
      "version.missing",
      path,
      "This file does not say which version of the format it uses.",
      `Add "schemaVersion": ${SCHEMA_VERSION} if the file was written by hand.`,
    );
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return error(
      "version.not_integer",
      path,
      `schemaVersion must be a whole number, and this file has ${describe(value)}.`,
      `Set it to ${SCHEMA_VERSION}.`,
    );
  }
  if (value < 1) {
    return error(
      "version.below_one",
      path,
      `schemaVersion ${value} is not a version of this format.`,
      `The first version is 1. Set schemaVersion to ${SCHEMA_VERSION}.`,
    );
  }
  if (value > SCHEMA_VERSION) {
    return error(
      "version.too_new",
      path,
      `This file is schemaVersion ${value} and this version of TabsPack understands ${SCHEMA_VERSION}.`,
      "Update TabsPack. The file is not damaged, and nothing has been changed.",
    );
  }
  return null;
}

/**
 * Structure only: the fields a reader cannot work without. Semantic problems
 * that a reader can recover from, such as a dangling group reference or two
 * active tabs, are reported by `deserialize.ts` while it reads them.
 */
export function validateFile(value: unknown): ValidationResult {
  const issues: Issue[] = [];

  if (!isObject(value)) {
    issues.push(
      error(
        "root.not_object",
        "$",
        `A TabsPack file is a JSON object, and this file is ${describe(value)}.`,
        "If this is a list of URLs or an export from another tool, TabsPack can still read it: drop the file in and it will be detected.",
      ),
    );
    return { ok: false, issues };
  }

  const format = value["format"];
  if (format === undefined) {
    issues.push(
      error(
        "format.missing",
        jsonPath("format"),
        "This file does not declare a format, so TabsPack will not guess at it.",
        `Add "format": "${FORMAT}" as the first field.`,
      ),
    );
  } else if (format !== FORMAT) {
    issues.push(
      error(
        "format.wrong",
        jsonPath("format"),
        `This file declares the format ${describe(format)} rather than "${FORMAT}".`,
        "Check that this is a TabsPack export. Files from other tools are read by dropping them in, not by editing this field.",
      ),
    );
  }

  const versionIssue = gateVersion(value["schemaVersion"]);
  if (versionIssue) issues.push(versionIssue);

  const windows = value["windows"];
  if (windows === undefined) {
    issues.push(
      error(
        "windows.missing",
        jsonPath("windows"),
        "This file has no windows array, so there is nothing to restore.",
        'Add "windows": [] for a deliberately empty pack, or export the file again.',
      ),
    );
  } else if (!Array.isArray(windows)) {
    issues.push(
      error(
        "windows.not_array",
        jsonPath("windows"),
        `windows must be an array, and this file has ${describe(windows)}.`,
        "TabsPack never keys windows by id, because browser ids mean nothing on another machine. Rewrite it as an array.",
      ),
    );
  } else {
    windows.forEach((win, index) => validateWindow(win, index, issues));
  }

  if (value["exportedAt"] === undefined) {
    issues.push(
      warning(
        "exported_at.missing",
        jsonPath("exportedAt"),
        "This file does not say when it was exported.",
        "The time of import is used instead. Nothing is lost.",
      ),
    );
  } else if (typeof value["exportedAt"] !== "string") {
    issues.push(
      warning(
        "exported_at.not_string",
        jsonPath("exportedAt"),
        `exportedAt should be an ISO 8601 timestamp, and this file has ${describe(value["exportedAt"])}.`,
        "The time of import is used instead.",
      ),
    );
  }

  const fatal = issues.some((issue) => issue.severity === "error");
  if (fatal) return { ok: false, issues };
  return { ok: true, file: value as unknown as TabsPackFile, issues };
}

function validateWindow(win: unknown, index: number, issues: Issue[]): void {
  const path = jsonPath("windows", index);
  if (!isObject(win)) {
    issues.push(
      error("window.not_object", path, `Window ${index + 1} is ${describe(win)} rather than an object.`, "Each entry in windows is an object with a tabs array."),
    );
    return;
  }
  const tabs = win["tabs"];
  if (tabs === undefined) {
    issues.push(
      error(
        "window.tabs_missing",
        jsonPath("windows", index, "tabs"),
        `Window ${index + 1} has no tabs array.`,
        'Add "tabs": [] if the window is deliberately empty.',
      ),
    );
    return;
  }
  if (!Array.isArray(tabs)) {
    issues.push(
      error(
        "window.tabs_not_array",
        jsonPath("windows", index, "tabs"),
        `The tabs of window ${index + 1} are ${describe(tabs)} rather than an array.`,
        "Tab order is the array order, so tabs is always an array.",
      ),
    );
    return;
  }
  tabs.forEach((tab, tabIndex) => validateTab(tab, index, tabIndex, issues));

  const groups = win["groups"];
  if (groups !== undefined && !Array.isArray(groups)) {
    issues.push(
      error(
        "window.groups_not_array",
        jsonPath("windows", index, "groups"),
        `The groups of window ${index + 1} are ${describe(groups)} rather than an array.`,
        "Groups are declared as an array inside the window that owns them.",
      ),
    );
  } else if (Array.isArray(groups)) {
    groups.forEach((group, groupIndex) => {
      const groupPath = jsonPath("windows", index, "groups", groupIndex);
      if (!isObject(group)) {
        issues.push(error("group.not_object", groupPath, `A group in window ${index + 1} is ${describe(group)} rather than an object.`, "Each group is an object with an id."));
        return;
      }
      if (typeof group["id"] !== "string" || group["id"] === "") {
        issues.push(
          error(
            "group.id_missing",
            jsonPath("windows", index, "groups", groupIndex, "id"),
            `A group in window ${index + 1} has no id, so no tab can refer to it.`,
            'Give it a file local id such as "g1", and point tabs at it with groupId.',
          ),
        );
      }
    });
  }
}

function validateTab(tab: unknown, windowIndex: number, tabIndex: number, issues: Issue[]): void {
  const path = jsonPath("windows", windowIndex, "tabs", tabIndex);
  if (!isObject(tab)) {
    issues.push(
      error("tab.not_object", path, `Tab ${tabIndex + 1} of window ${windowIndex + 1} is ${describe(tab)} rather than an object.`, "Each tab is an object with a url."),
    );
    return;
  }
  const url = tab["url"];
  if (url === undefined) {
    issues.push(
      error(
        "tab.url_missing",
        jsonPath("windows", windowIndex, "tabs", tabIndex, "url"),
        `Tab ${tabIndex + 1} of window ${windowIndex + 1} has no url.`,
        "url is the only mandatory field on a tab. Add it, or remove the tab.",
      ),
    );
    return;
  }
  if (typeof url !== "string" || url.trim() === "") {
    issues.push(
      error(
        "tab.url_empty",
        jsonPath("windows", windowIndex, "tabs", tabIndex, "url"),
        `Tab ${tabIndex + 1} of window ${windowIndex + 1} has ${describe(url)} where its url should be.`,
        "Put the address in url as a string, starting with its scheme.",
      ),
    );
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Names a value the way a person would, for a message they have to act on. */
export function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  switch (typeof value) {
    case "string":
      return value.length > 40 ? `the text "${value.slice(0, 37)}..."` : `the text "${value}"`;
    case "number":
      return `the number ${value}`;
    case "boolean":
      return String(value);
    case "object":
      return "an object";
    default:
      return typeof value;
  }
}
