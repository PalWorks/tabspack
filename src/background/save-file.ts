/**
 * Writing an export to disk from the background, for the keyboard commands in
 * task T-404.
 *
 * The background has no DOM on Chromium and a full one on Gecko, so this is a
 * chain of probes rather than a branch on a browser name. Each step is tried and
 * the first that works wins:
 *
 *   1. A blob URL, which a Gecko event page can make and a Chromium service
 *      worker cannot: `URL.createObjectURL` is simply absent there.
 *   2. A data URL, which Chromium's downloads API does accept from a service
 *      worker. Measured, not assumed: see docs/DECISIONS.md ADR-021.
 *   3. The manager page, which has a DOM and no size limit, opened with the
 *      export it should perform.
 *
 * Step 3 is not a failure path, it is the honest one for a pack too large to
 * spell out in a URL.
 */
import type { BrowserAdapter } from "../core/adapter/types.js";

/**
 * Beyond this the data URL gets unwieldy and browsers start refusing it, so the
 * page path takes over. About 1.5 MB of JSON, which is a session of some 5000
 * tabs.
 */
export const DATA_URL_LIMIT = 1_500_000;

export type SaveRoute = "blob" | "data-url" | "page";

export interface BackgroundSave {
  saved: boolean;
  route: SaveRoute;
}

export async function saveFromBackground(
  adapter: BrowserAdapter,
  payload: { text: string; filename: string; mime: string },
  fallbackPage: string,
): Promise<BackgroundSave> {
  const maker = (globalThis as { URL?: { createObjectURL?: (blob: Blob) => string } }).URL;
  if (typeof maker?.createObjectURL === "function" && typeof Blob !== "undefined") {
    try {
      const url = maker.createObjectURL(new Blob([payload.text], { type: payload.mime }));
      const id = await adapter.download({ url: url, filename: payload.filename });
      if (id !== null) return { saved: true, route: "blob" };
    } catch {
      /* fall through */
    }
  }

  if (payload.text.length <= DATA_URL_LIMIT) {
    try {
      const url = `data:${payload.mime};base64,${base64(payload.text)}`;
      const id = await adapter.download({ url, filename: payload.filename });
      if (id !== null) return { saved: true, route: "data-url" };
    } catch {
      /* fall through */
    }
  }

  await adapter.openExtensionPage(fallbackPage);
  return { saved: false, route: "page" };
}

/** UTF-8 to base64, in chunks, because a whole pack will not fit in one call. */
export function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  const encoder = (globalThis as { btoa?: (input: string) => string }).btoa;
  if (typeof encoder !== "function") throw new Error("This browser cannot encode a file here.");
  return encoder(binary);
}
