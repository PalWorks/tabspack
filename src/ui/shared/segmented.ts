/**
 * Segmented control behaviour. A radio group, so a screen reader announces
 * "All windows, selected, 1 of 3", and arrow keys move the selection the way
 * they do in a native radio group.
 */
import { all } from "./dom.js";

export function initSegmented(
  container: HTMLElement,
  initial: string,
  onChange: (value: string) => void,
): (value: string) => void {
  const buttons = all<HTMLButtonElement>("button[data-value]", container);

  const select = (value: string, focus = false): void => {
    for (const button of buttons) {
      const checked = button.dataset.value === value;
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.tabIndex = checked ? 0 : -1;
      if (checked && focus) button.focus();
    }
  };

  buttons.forEach((button, position) => {
    button.addEventListener("click", () => {
      const value = button.dataset.value ?? "";
      select(value);
      onChange(value);
    });
    button.addEventListener("keydown", (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = buttons[(position + step + buttons.length) % buttons.length];
      const value = next?.dataset.value ?? "";
      select(value, true);
      onChange(value);
    });
  });

  select(initial);
  return select;
}
