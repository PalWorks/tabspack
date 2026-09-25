/**
 * The ARIA tab pattern, for the two tasks the manager page carries: export and
 * import. A tab set rather than two stacked cards, because a person is doing one
 * of those two things and stacking them would put half the page's controls out
 * of reach of the task in hand.
 *
 * Arrow keys move between tabs, Home and End jump to the ends, and selection
 * follows focus, which is the behaviour a screen reader user expects from a tab
 * list that shows a panel with no loading cost.
 */
import { all } from "./dom.js";

export interface TabSet {
  select(id: string): void;
  current(): string;
}

export function initTabs(
  list: HTMLElement,
  panels: Record<string, HTMLElement>,
  initial: string,
  onChange?: (id: string) => void,
): TabSet {
  const buttons = all<HTMLButtonElement>("button[role='tab']", list);
  let selected = initial;

  const paint = (id: string, focus: boolean): void => {
    selected = id;
    for (const button of buttons) {
      const active = button.dataset.tab === id;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    }
    for (const [key, panel] of Object.entries(panels)) {
      panel.hidden = key !== id;
    }
    onChange?.(id);
  };

  buttons.forEach((button, position) => {
    button.addEventListener("click", () => paint(button.dataset.tab ?? initial, false));
    button.addEventListener("keydown", (event: KeyboardEvent) => {
      const last = buttons.length - 1;
      let next = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (position + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (position + last) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      if (next < 0) return;
      event.preventDefault();
      paint(buttons[next]?.dataset.tab ?? initial, true);
    });
  });

  paint(initial, false);
  return { select: (id: string) => paint(id, false), current: () => selected };
}
