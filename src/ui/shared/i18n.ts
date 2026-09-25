/**
 * Translation, task T-503.
 *
 * Every string the interface shows comes from `_locales/en/messages.json` through
 * this module. Nothing in `src/ui/` spells an English sentence, which is what
 * makes a second locale a file rather than a rewrite, and `scripts/lint.mjs`
 * fails the build on a key that has no entry.
 *
 * Markup carries `data-i18n="key"` for its text and
 * `data-i18n-attr="placeholder:key,aria-label:key"` for its attributes, applied
 * once on load.
 */
import { realAdapter } from "../../core/adapter/index.js";

export function t(key: string, ...subs: string[]): string {
  return realAdapter.getMessage(key, subs.length > 0 ? subs : undefined);
}

/**
 * Chromium's message format has no plural rules, so a count carries two keys and
 * the caller picks. Two forms is enough for English; a language that needs more
 * adds them in its own file and this function grows a rule, which is the point
 * of having one place that decides.
 */
export function plural(count: number, unit: string): string {
  const key = `unit_${unit}_${count === 1 ? "one" : "other"}`;
  return t(key, String(count));
}

/** Replaces the English in the markup with whatever the browser has. */
export function applyI18n(root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = node.dataset.i18n;
    if (key) node.textContent = t(key);
  }
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-attr]")) {
    for (const pair of (node.dataset.i18nAttr ?? "").split(",")) {
      const [attribute, key] = pair.split(":").map((part) => part.trim());
      if (attribute && key) node.setAttribute(attribute, t(key));
    }
  }
  const title = document.querySelector<HTMLElement>("title[data-i18n]");
  if (title?.dataset.i18n) document.title = t(title.dataset.i18n);
}
