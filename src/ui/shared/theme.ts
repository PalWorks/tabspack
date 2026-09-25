/**
 * The theme switch, FR-405.
 *
 * The tokens already define light, dark under the system preference, and dark
 * under `[data-theme="dark"]`, so choosing a theme is one attribute on the root
 * element and no new colour anywhere: docs/DESIGN.md section 2. Every surface
 * calls this on load, which is why it lives in `shared`.
 */
import type { Theme } from "../../core/settings.js";

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    return;
  }
  root.dataset.theme = theme;
}
