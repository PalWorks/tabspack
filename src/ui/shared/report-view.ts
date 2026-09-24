/**
 * Renders a report into a live region. Tone is carried by a data attribute so
 * colour is never the only signal: the glyph and the wording change too.
 */
import { clear, el, icon, ICON } from "./dom.js";
import { describeRemoved, formatBytes, totalRemoved, type ExportReport } from "../../core/report.js";

type Tone = "success" | "warn" | "error";

export function renderExportReport(node: HTMLElement, report: ExportReport): void {
  const dropped = totalRemoved(report.removed);
  const tone: Tone = dropped > 0 ? "warn" : "success";
  const summary = `${plural(report.tabs, "tab")} from ${plural(report.windows, "window")}`;
  const headline = report.saved ? `Saved ${summary}` : `Copied ${summary}`;
  paint(node, tone, headline, [
    ...(dropped > 0 ? [describeRemoved(report.removed)] : []),
    ...(report.groups > 0 ? [`${plural(report.groups, "group")} kept`] : []),
    `${formatBytes(report.bytes)}`,
  ].filter(Boolean).join(" · "), report.saved ? report.filename : undefined);
}

export function renderError(node: HTMLElement, message: string): void {
  paint(node, "error", message, undefined, undefined);
}

export function renderNote(node: HTMLElement, message: string): void {
  paint(node, "warn", message, undefined, undefined);
}

export function clearReport(node: HTMLElement): void {
  clear(node);
  node.removeAttribute("data-tone");
}

function paint(
  node: HTMLElement,
  tone: Tone,
  headline: string,
  detail: string | undefined,
  filename: string | undefined,
): void {
  clear(node);
  node.setAttribute("data-tone", tone);

  const line = el("div", { class: "headline" });
  line.appendChild(icon(tone === "success" ? ICON.check : tone === "warn" ? ICON.warn : ICON.error, 16));
  line.appendChild(el("span", { text: headline }));
  node.appendChild(line);

  if (detail) node.appendChild(el("div", { class: "detail", text: detail }));
  if (filename) node.appendChild(el("div", { class: "filename", text: filename }));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
