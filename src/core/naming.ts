/** File naming and timestamp formatting. Pure, and the only place either is defined. */

export const FILE_SUFFIX = ".tabspack.json";

/** `tabspack-YYYYMMDD-HHmm.tabspack.json`, in local time, per FR-008. */
export function exportFilename(when: Date): string {
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}`;
  return `tabspack-${stamp}${FILE_SUFFIX}`;
}

export function textFilename(when: Date, extension: "txt" | "json"): string {
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}`;
  return `tabspack-${stamp}.${extension}`;
}

/**
 * ISO 8601 with the local offset rather than Z. The offset says something about
 * the session that was captured, so it is kept.
 */
export function isoWithOffset(when: Date): string {
  const offsetMinutes = -when.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}${offset}`
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
