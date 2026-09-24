/**
 * Writing an export to disk and to the clipboard.
 *
 * Blob and anchor are page APIs rather than extension APIs, so this belongs in
 * the UI layer. The downloads API is tried first because it names the file
 * without a save dialog; the anchor is the fallback when that API is missing or
 * refuses.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import type { ExportPayload } from "../../core/export.js";

export interface SaveOutcome {
  saved: boolean;
  /** Set when the file could not be written at all. */
  error?: string;
}

export async function savePayload(
  adapter: BrowserAdapter,
  payload: ExportPayload,
): Promise<SaveOutcome> {
  const blob = new Blob([payload.text], { type: payload.mime });
  const url = URL.createObjectURL(blob);
  try {
    const id = await adapter.download({ url, filename: payload.filename });
    if (id !== null) return { saved: true };
    return anchorFallback(url, payload.filename);
  } catch (error) {
    const fallback = anchorFallback(url, payload.filename);
    if (fallback.saved) return fallback;
    return { saved: false, error: message(error) };
  } finally {
    // The browser has read the blob by the time the promise settles. Revoking
    // later would leak, revoking sooner can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function anchorFallback(url: string, filename: string): SaveOutcome {
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { saved: true };
  } catch (error) {
    return { saved: false, error: message(error) };
  }
}

export async function copyPayload(
  adapter: BrowserAdapter,
  payload: ExportPayload,
): Promise<SaveOutcome> {
  try {
    await adapter.copyText(payload.text);
    return { saved: false };
  } catch (error) {
    return { saved: false, error: message(error) };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
