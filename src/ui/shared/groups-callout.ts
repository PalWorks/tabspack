/**
 * The tab groups permission, asked for from wherever it is about to matter.
 *
 * `tabGroups` is optional, so TabsPack does not ask at install time. Without it
 * the `browser.tabGroups` namespace does not exist at all, which has a
 * consequence that was invisible until a user hit it: an **export** silently
 * loses every group name and colour. Membership survives, because that is read
 * from the tab rather than from the group, so a restore produces the right
 * clusters with no names, and nothing anywhere said why: ADR-030.
 *
 * The permission was only ever offered on the import side, and only once a pack
 * with groups had been loaded. This module is that offer, in one place, used by
 * both panes, and it can be asked for before an export rather than after.
 *
 * A browser only grants an optional permission inside a user gesture, and no
 * extension can put the browser's own dialog on screen without a click of its
 * own, so the button is the mechanism. Making it prominent is not decoration.
 */
import type { BrowserAdapter } from "../../core/adapter/types.js";
import { el, icon, ICON } from "./dom.js";
import { t } from "./i18n.js";

export interface GroupsCallout {
  /**
   * Shows or hides the callout. `groups` is how many the pane is about to act
   * on: zero hides it, because a permission for something the file does not
   * contain is noise.
   */
  update(groups: number): Promise<void>;
  /** True once the browser has granted it, without asking again. */
  granted(): boolean;
}

export interface GroupsCalloutOptions {
  /** What the pane is about to do, which decides the wording. */
  intent: "export" | "restore";
  /** Called after a grant, so the pane can recollect or repaint. */
  onGranted: () => void;
}

export function initGroupsCallout(
  host: HTMLElement,
  adapter: BrowserAdapter,
  options: GroupsCalloutOptions,
): GroupsCallout {
  let has = false;
  let refused = false;

  const glyph = icon(ICON.warn, 18);
  glyph.classList.add("callout-icon");
  const title = el("p", { class: "callout-title" });
  const text = el("p", { class: "callout-text" });
  const body = el("div", { class: "callout-body" });
  body.appendChild(title);
  body.appendChild(text);

  const allow = el("button", { class: "btn btn-primary", text: t("allowGroups") });
  allow.type = "button";
  const actions = el("div", { class: "callout-actions" });
  actions.appendChild(allow);

  host.classList.add("callout");
  host.setAttribute("role", "status");
  host.appendChild(glyph);
  host.appendChild(body);
  host.appendChild(actions);
  host.hidden = true;

  allow.addEventListener("click", () => {
    void (async () => {
      allow.disabled = true;
      try {
        const granted = await adapter.requestPermissions(["tabGroups"]);
        has = granted;
        if (granted) {
          refused = false;
          host.hidden = true;
          options.onGranted();
          return;
        }
        // A refusal is an answer, not a failure. The pane keeps working and the
        // callout says what the user will get instead, then stops asking.
        refused = true;
        paint(0);
      } catch {
        host.hidden = true;
      } finally {
        allow.disabled = false;
      }
    })();
  });

  function paint(groups: number): void {
    if (refused) {
      title.textContent = t("groupsRefusedTitle");
      text.textContent = t(options.intent === "export" ? "groupsRefusedExport" : "groupsRefusedRestore");
      allow.hidden = true;
      host.hidden = false;
      return;
    }
    allow.hidden = false;
    title.textContent = t(options.intent === "export" ? "groupsNeededExport" : "groupsNeededRestore", String(groups));
    text.textContent = t(options.intent === "export" ? "groupsNeededExportWhy" : "groupsNeededRestoreWhy");
    host.hidden = false;
  }

  return {
    async update(groups: number): Promise<void> {
      if (!has) has = await adapter.hasPermissions(["tabGroups"]).catch(() => false);
      if (has || groups <= 0) {
        host.hidden = true;
        return;
      }
      paint(groups);
    },
    granted: () => has,
  };
}
