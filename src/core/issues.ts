/**
 * One shape for everything the import path has to tell the user.
 *
 * A validation failure, a migration note and a deserialize note are the same
 * kind of thing from the interface's point of view: a place in the document, a
 * sentence about it, and what to do. Rule 7 of AGENTS.md section 2 is that
 * nothing is dropped silently, and this is the object that carries the telling.
 *
 * `code` is the stable identifier. `message` and `fix` are the English defaults;
 * the i18n layer at T-503 translates by `code` and falls back to these.
 */

export type Severity = "error" | "warning";

export interface Issue {
  /** Stable identifier, also the i18n key. Never shown to the user. */
  code: string;
  severity: Severity;
  /** JSON path into the document, `$` for the document itself. */
  path: string;
  /** What is wrong, in one sentence. */
  message: string;
  /** What to do about it. Omitted only when there is nothing the user can do. */
  fix?: string;
}

export function error(code: string, path: string, message: string, fix?: string): Issue {
  return { code, severity: "error", path, message, ...(fix ? { fix } : {}) };
}

export function warning(code: string, path: string, message: string, fix?: string): Issue {
  return { code, severity: "warning", path, message, ...(fix ? { fix } : {}) };
}

export function errors(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function warnings(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity === "warning");
}

/** `$.windows[2].tabs[7].url`, the path form used in every message. */
export function jsonPath(...segments: (string | number)[]): string {
  let out = "$";
  for (const segment of segments) {
    out += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return out;
}
