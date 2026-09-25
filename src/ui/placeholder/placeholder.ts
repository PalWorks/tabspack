/**
 * The page that makes the one lossy edge of the format visible, task T-205.
 *
 * A browser refuses to let any extension open `chrome://`, `about:` other than
 * blank, `javascript:`, `data:`, `view-source:` and, without a browser level
 * grant, `file://`. docs/SPEC.md section 8 requires those tabs to stay in the
 * file and to be surfaced rather than dropped, and this is the surfacing.
 *
 * Every address is inert, selectable text. Not a link: a `javascript:` or `data:`
 * address must never be one click away from running, and the others would not
 * open anyway.
 *
 * The list arrives through `storage.local` rather than the URL, because a pack can
 * hold hundreds of these and a URL cannot.
 */
import { realAdapter } from "../../core/adapter/index.js";
import { clear, el, must } from "../shared/dom.js";

interface Handoff {
  createdAt?: string;
  tabs?: { url?: string; title?: string; explanation?: string }[];
}

/** Older handoffs are pruned on every visit, so nothing accumulates. */
const KEEP = 5;

const ui = {
  lead: must<HTMLParagraphElement>("#lead"),
  list: must<HTMLUListElement>("#list"),
  copy: must<HTMLButtonElement>("#copy"),
  copyNote: must<HTMLSpanElement>("#copy-note"),
};

let addresses: string[] = [];

void start();

async function start(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const stored = await realAdapter.storageGetAll();
  await prune(stored, id);

  const handoff = (id === "" ? undefined : (stored[`placeholder:${id}`] as Handoff | undefined)) ?? {};
  const tabs = handoff.tabs ?? [];

  if (tabs.length === 0) {
    ui.lead.textContent =
      "There is nothing to show here. This page lists the addresses a restore could not reopen, and that list has expired.";
    ui.copy.disabled = true;
    return;
  }

  ui.lead.textContent = `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} in the pack you restored ${
    tabs.length === 1 ? "uses an address" : "use addresses"
  } no extension is allowed to open. ${tabs.length === 1 ? "It is" : "They are"} still in your file.`;

  addresses = tabs.map((tab) => tab.url ?? "").filter((url) => url !== "");
  clear(ui.list);
  for (const tab of tabs) {
    const item = el("li", { class: "url-item" });
    item.appendChild(el("p", { class: "url-title", text: tab.title || "Untitled tab" }));
    item.appendChild(el("p", { class: "url-address", text: tab.url ?? "" }));
    if (tab.explanation) item.appendChild(el("p", { class: "url-reason", text: tab.explanation }));
    ui.list.appendChild(item);
  }

  ui.copy.addEventListener("click", () => void copyAll());
}

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${addresses.join("\n")}\n`);
    ui.copyNote.textContent = `Copied ${addresses.length} ${addresses.length === 1 ? "address" : "addresses"}.`;
  } catch {
    ui.copyNote.textContent = "The clipboard was refused. Select the addresses and copy them.";
  }
}

async function prune(stored: Record<string, unknown>, keep: string): Promise<void> {
  const entries = Object.keys(stored)
    .filter((key) => key.startsWith("placeholder:") && key !== `placeholder:${keep}`)
    .map((key) => ({ key, at: (stored[key] as Handoff)?.createdAt ?? "" }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const stale = entries.slice(KEEP - 1).map((entry) => entry.key);
  if (stale.length > 0) await realAdapter.storageRemove(stale);
}
