/**
 * Forward migration between schema versions, task T-208.
 *
 * There is nothing to migrate yet: version 1 is the first released version of
 * the format. The machinery exists now because the first format change must
 * arrive with somewhere to put its migration, not with an argument about where
 * migrations should live. It is proven by a fixture pair that drives a
 * demonstration registry, so the code path is exercised rather than hoped for.
 *
 * Rules, from docs/SPEC.md section 9 and docs/PLAYBOOK.md section 4:
 * one step per version, pure, one directional, and never a best effort parse of
 * a version this build does not know.
 */
import { SCHEMA_VERSION } from "../types/tabspack.js";
import type { Issue } from "./issues.js";
import { error, jsonPath, warning } from "./issues.js";
import { isObject } from "./schema.js";

export interface MigrationStep {
  from: number;
  to: number;
  /** One line, shown in the import report so the user knows what happened. */
  summary: string;
  /** Pure. Receives a deep copy and returns the migrated document. */
  apply(document: Record<string, unknown>): Record<string, unknown>;
}

/** Empty by design. The next format change adds the first entry here. */
export const MIGRATIONS: readonly MigrationStep[] = [];

export interface MigrateOptions {
  registry?: readonly MigrationStep[];
  /** The version to migrate up to. Overridden only by the migration tests. */
  target?: number;
}

export interface MigrateResult {
  ok: boolean;
  /** Unchanged when the value is not an object: validation says what it is. */
  document: unknown;
  applied: MigrationStep[];
  issues: Issue[];
}

/**
 * Walks a document up to the target version, one registered step at a time.
 *
 * A version above the target is left untouched: refusing a future file by name
 * is the version gate's job, in `schema.ts`. A version below the target with no
 * registered step is an error rather than a guess.
 */
export function migrateToCurrent(value: unknown, options: MigrateOptions = {}): MigrateResult {
  const registry = options.registry ?? MIGRATIONS;
  const target = options.target ?? SCHEMA_VERSION;
  const issues: Issue[] = [];
  const applied: MigrationStep[] = [];

  if (!isObject(value)) return { ok: true, document: value, applied, issues };

  let document = clone(value);
  const declared = document["schemaVersion"];
  if (typeof declared !== "number" || !Number.isInteger(declared)) {
    return { ok: true, document, applied, issues };
  }

  let version = declared;
  let guard = 0;
  while (version < target) {
    const step = registry.find((candidate) => candidate.from === version);
    if (!step) {
      issues.push(
        error(
          "migrate.no_path",
          jsonPath("schemaVersion"),
          `This file is schemaVersion ${version} and TabsPack has no way to bring it up to ${target}.`,
          "Export it again from the version of TabsPack that wrote it, or report the file.",
        ),
      );
      return { ok: false, document, applied, issues };
    }
    document = clone(step.apply(clone(document)));
    document["schemaVersion"] = step.to;
    applied.push(step);
    version = step.to;
    guard += 1;
    if (guard > 64) {
      issues.push(
        error(
          "migrate.loop",
          jsonPath("schemaVersion"),
          "The migration steps for this file do not lead anywhere.",
          "This is a defect in TabsPack. Please report the file.",
        ),
      );
      return { ok: false, document, applied, issues };
    }
  }

  if (applied.length > 0) {
    issues.push(
      warning(
        "migrate.applied",
        jsonPath("schemaVersion"),
        `This file was written for schemaVersion ${declared} and has been brought up to ${version}: ${applied
          .map((step) => step.summary)
          .join("; ")}.`,
        "The file on disk is unchanged. Export again to save it in the current version.",
      ),
    );
  }

  return { ok: true, document, applied, issues };
}

/**
 * `structuredClone` where it exists, JSON otherwise. A migration receives a copy
 * so a buggy step cannot corrupt the caller's document, which matters because
 * the caller is often holding the only copy of a user's session.
 */
function clone(value: Record<string, unknown>): Record<string, unknown> {
  const structured = (globalThis as { structuredClone?: (input: unknown) => unknown }).structuredClone;
  if (typeof structured === "function") return structured(value) as Record<string, unknown>;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
