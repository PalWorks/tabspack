/**
 * The public face of the `tabspack` npm package, B-502.
 *
 * The package is the extension's own reader and writer, compiled from these
 * same source files by `scripts/build-package.mjs`, so a file the extension
 * accepts is a file the package accepts and there is no second parser to
 * drift. Nothing reachable from here may import `core/adapter/`, which is the
 * browser: `scripts/lint.mjs` rule `packageBoundary` holds that line.
 *
 * The names below are the contract. The modules behind them can change.
 */
import { loadPack, type LoadOptions, type LoadResult } from "../core/import.js";
import { migrateToCurrent } from "../core/migrate.js";
import { parseJson, validateFile } from "../core/schema.js";
import { stringify, toFile, type SerializeOptions } from "../core/serialize.js";
import { errors, type Issue } from "../core/issues.js";
import type { Session } from "../types/session.js";
import type { TabsPackFile } from "../types/tabspack.js";

export { FORMAT, SCHEMA_VERSION, GROUP_COLORS } from "../types/tabspack.js";
export type * from "../types/tabspack.js";
export type { Session, SessionWindow, SessionTab, SessionGroup } from "../types/session.js";
export type { Issue, Severity } from "../core/issues.js";
export type { LoadOptions, LoadResult, SourceInfo, Fidelity } from "../core/import.js";
export { FILE_SUFFIX } from "../core/naming.js";
export { fromFile } from "../core/deserialize.js";

/**
 * Reads text into a session: a TabsPack file of any supported version, or an
 * export from another tab manager, a bookmarks file, a CSV or a list of links.
 * Addresses parked by a tab suspender are recovered unless
 * `recoverSuspended: false`. Never throws: every problem is an `Issue`.
 */
export function read(text: string, options: LoadOptions = {}): LoadResult {
  return loadPack(text, options);
}

export interface WriteOptions extends Partial<SerializeOptions> {}

/**
 * Writes a session as a TabsPack file, exactly as the extension writes one:
 * two space indentation, a trailing newline, the current `schemaVersion`.
 */
export function write(session: Session, options: WriteOptions = {}): string {
  return stringify(toFile(session, { keepFavicons: true, ...options }));
}

export interface ValidateResult {
  ok: boolean;
  /** The document upgraded to the current version, when it could be. */
  file?: TabsPackFile;
  issues: Issue[];
}

/**
 * Checks a TabsPack document, given as text or as a parsed value, against the
 * specification, upgrading an older `schemaVersion` first. Foreign formats are
 * not TabsPack documents: use `read` for those.
 */
export function validate(input: string | unknown): ValidateResult {
  let value: unknown = input;
  if (typeof input === "string") {
    const parsed = parseJson(input);
    if (!parsed.ok) return { ok: false, issues: [parsed.issue as Issue] };
    value = parsed.value;
  }
  const migrated = migrateToCurrent(value);
  if (!migrated.ok) return { ok: false, issues: migrated.issues };
  const checked = validateFile(migrated.document);
  const issues = [...migrated.issues, ...checked.issues];
  const ok = checked.ok && errors(issues).length === 0;
  return ok && checked.file ? { ok, file: checked.file, issues } : { ok: false, issues };
}
