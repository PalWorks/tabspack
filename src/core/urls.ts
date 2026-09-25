/**
 * Which URLs an extension may open, and what to say about the ones it may not.
 *
 * This is the one lossy edge of the format, and docs/SPEC.md section 8 makes it
 * deliberately visible: a restricted URL stays in the file, is listed on the
 * placeholder page and is counted in the import report. It is never dropped.
 */

/**
 * Schemes no extension can navigate a new tab to. `about:` is listed here but
 * `about:blank` is allowed, which is why the check is a function and not a set
 * membership test.
 */
const BLOCKED_SCHEMES = [
  "chrome:",
  "chrome-untrusted:",
  "chrome-search:",
  "chrome-native:",
  "chrome-devtools:",
  "devtools:",
  "edge:",
  "brave:",
  "opera:",
  "vivaldi:",
  "about:",
  "javascript:",
  "data:",
  "blob:",
  "view-source:",
  "resource:",
  "jar:",
  "filesystem:",
  "chrome-extension:",
  "moz-extension:",
  "extension:",
] as const;

export type UrlVerdict =
  | { openable: true }
  | { openable: false; reason: "blocked_scheme" | "file_access" | "empty" | "unparsable"; scheme: string };

export interface OpenabilityOptions {
  /** True when the browser has granted the extension access to `file://` URLs. */
  fileAccess: boolean;
}

/** The scheme in lowercase with its colon, or an empty string when there is none. */
export function schemeOf(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return match ? `${(match[1] as string).toLowerCase()}:` : "";
}

export function judgeUrl(url: string, options: OpenabilityOptions): UrlVerdict {
  const trimmed = url.trim();
  if (trimmed === "") return { openable: false, reason: "empty", scheme: "" };
  const scheme = schemeOf(trimmed);
  if (scheme === "") return { openable: false, reason: "unparsable", scheme: "" };
  if (scheme === "about:") {
    return trimmed.toLowerCase() === "about:blank"
      ? { openable: true }
      : { openable: false, reason: "blocked_scheme", scheme };
  }
  if (scheme === "file:") {
    return options.fileAccess ? { openable: true } : { openable: false, reason: "file_access", scheme };
  }
  if ((BLOCKED_SCHEMES as readonly string[]).includes(scheme)) {
    return { openable: false, reason: "blocked_scheme", scheme };
  }
  return { openable: true };
}

/** One sentence per reason, for the placeholder page and the import report. */
export function explainVerdict(verdict: UrlVerdict): string {
  if (verdict.openable) return "";
  switch (verdict.reason) {
    case "blocked_scheme":
      return `No extension is allowed to open a ${verdict.scheme} address.`;
    case "file_access":
      return "Local files need file access, which is granted in the browser's extension settings.";
    case "empty":
      return "This tab has no address.";
    case "unparsable":
      return "This address has no scheme, so the browser cannot open it.";
    default:
      return "This address cannot be opened.";
  }
}

/**
 * A `javascript:` or `data:` URL must never become a link or be navigated to, so
 * the placeholder page renders these as inert text. The others are inert too,
 * for one rule rather than two, but this predicate records which ones are
 * actively dangerous rather than merely refused.
 */
export function isDangerousScheme(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme === "javascript:" || scheme === "data:" || scheme === "blob:";
}
