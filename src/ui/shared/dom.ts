/**
 * Minimal DOM helpers.
 *
 * Nothing here uses `innerHTML`. Every string that reaches the document does so
 * as a text node, which is what keeps a crafted tab title in an imported file
 * from becoming markup: see SECURITY.md. The lint script enforces it.
 */

export function must<T extends Element>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

export function all<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { class?: string; text?: string; attrs?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds an inline icon from a path constant. Decorative by default. */
export function icon(path: string, size = 16, label?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  if (label) {
    svg.setAttribute("role", "img");
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = label;
    svg.appendChild(title);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const node = document.createElementNS(SVG_NS, "path");
  node.setAttribute("d", path);
  svg.appendChild(node);
  return svg;
}

export const ICON = {
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  warn: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  error: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  external: "M14 3v2h3.59l-9.3 9.29 1.42 1.42L19 6.41V10h2V3h-7zM19 19H5V5h5V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-2v5z",
  logo: "M4 4h16a1 1 0 0 1 1 1v3H3V5a1 1 0 0 1 1-1zm-1 6h12v3H3v-3zm0 5h9v3H3v-3zm14.5 6L21 17h-2.5v-4h-2v4H14l3.5 4z",
} as const;

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
