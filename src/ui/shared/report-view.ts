/**
 * Renders a report into a live region. Tone is carried by a data attribute so
 * colour is never the only signal: the glyph and the wording change too.
 */
import { clear, el, icon, ICON } from "./dom.js";
import {
  describeRemoved,
  formatBytes,
  totalRemoved,
  type ExportReport,
  type RestoreSummary,
} from "../../core/report.js";
import type { Issue } from "../../core/issues.js";

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

/** A restore outcome. The wording is built in core/report.ts so it can be tested. */
export function renderRestoreReport(node: HTMLElement, summary: RestoreSummary): void {
  paint(node, summary.tone, summary.headline, summary.details.join(" · "), undefined);
}

export interface IssueListOptions {
  headline: string;
  /** Warnings start folded away, errors never do. */
  collapsed?: boolean;
}

/**
 * The list of everything the import path adjusted or refused. Each entry is the
 * sentence, then what to do, then the path into the document, in that order,
 * because that is the order a person reads them in.
 */
export function renderIssues(node: HTMLElement, issues: Issue[], options: IssueListOptions): void {
  clear(node);
  if (issues.length === 0) return;
  const worst = issues.some((issue) => issue.severity === "error") ? "error" : "warn";
  node.setAttribute("data-tone", worst);

  const details = el("details", { class: "issues" });
  if (options.collapsed !== true || worst === "error") details.open = true;
  const summary = el("summary", { class: "issues-summary" });
  summary.appendChild(icon(worst === "error" ? ICON.error : ICON.warn, 16));
  summary.appendChild(el("span", { text: options.headline }));
  details.appendChild(summary);

  const list = el("ul", { class: "issue-list" });
  for (const issue of issues) {
    const item = el("li", { class: "issue" });
    item.dataset.severity = issue.severity;
    item.appendChild(el("p", { class: "issue-message", text: issue.message }));
    if (issue.fix) item.appendChild(el("p", { class: "issue-fix", text: issue.fix }));
    if (issue.path !== "$") item.appendChild(el("p", { class: "issue-path", text: issue.path }));
    list.appendChild(item);
  }
  details.appendChild(list);
  node.appendChild(details);
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
