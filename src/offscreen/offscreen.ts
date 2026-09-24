/**
 * Clipboard write on behalf of the service worker, which has no DOM. The
 * document closes itself once the write completes, so it never lingers.
 */
import { events } from "../core/adapter/index.js";
import { UNHANDLED } from "../core/adapter/types.js";

interface CopyMessage {
  type?: string;
  text?: string;
}

events.onMessage(async (raw) => {
  const message = (raw ?? {}) as CopyMessage;
  if (message.type !== "OFFSCREEN_COPY") return UNHANDLED;
  const text = typeof message.text === "string" ? message.text : "";
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return legacyCopy(text)
      ? { ok: true, fallback: "execCommand" }
      : { ok: false, error: "The clipboard write was refused." };
  } finally {
    setTimeout(() => window.close(), 0);
  }
});

/** Older engines refuse the async clipboard outside a user gesture. */
function legacyCopy(text: string): boolean {
  try {
    const sink = document.getElementById("sink") as HTMLTextAreaElement | null;
    if (!sink) return false;
    sink.value = text;
    sink.select();
    sink.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  }
}
