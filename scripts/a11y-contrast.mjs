/**
 * Contrast, task T-506.
 *
 * docs/DESIGN.md section 6 commits to 4.5 to 1 for body text and 3 to 1 for large
 * text and glyphs, in both themes. That is checked here against the tokens
 * themselves rather than discovered by eye in a screenshot, and it runs in
 * `npm run verify`, so a new colour cannot quietly fail the promise.
 *
 * Parsed straight out of `src/ui/shared/theme.css`, because the tokens are
 * defined there once and nowhere else.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const css = await readFile(path.join(root, "src", "ui", "shared", "theme.css"), "utf8");

/** Each pair: foreground, background, the ratio it must clear, and what it is. */
const PAIRS = [
  ["--text", "--bg", 4.5, "body text on the page"],
  ["--text", "--surface", 4.5, "body text on a recessed area"],
  ["--text", "--surface-raised", 4.5, "body text on a card"],
  ["--text-muted", "--bg", 4.5, "secondary text on the page"],
  ["--text-muted", "--surface", 4.5, "secondary text on a recessed area"],
  ["--text-muted", "--surface-raised", 4.5, "secondary text on a card"],
  ["--accent-text", "--accent", 4.5, "the label on the primary button"],
  ["--accent", "--bg", 3, "the accent as a large label or a glyph"],
  ["--accent", "--surface-raised", 3, "the selected segment's label"],
  ["--success", "--bg", 4.5, "a successful outcome"],
  ["--success", "--surface-raised", 4.5, "a successful outcome on a card"],
  ["--warn", "--bg", 4.5, "something was skipped"],
  ["--warn", "--surface-raised", 4.5, "something was skipped, on a card"],
  ["--danger", "--bg", 4.5, "a failure"],
  ["--danger", "--surface-raised", 4.5, "a failure on a card"],
  ["--focus", "--bg", 3, "the focus ring"],
  ["--border-strong", "--bg", 3, "a control's own border on the page"],
  ["--border-strong", "--surface", 3, "a control's own border on a recessed area"],
  ["--border-strong", "--surface-raised", 3, "a control's own border on a card"],
];

const THEMES = {
  light: block(/:root\s*\{([\s\S]*?)\}/),
  dark: block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/),
};

function block(pattern) {
  const found = pattern.exec(css);
  if (!found) throw new Error(`theme.css has no block matching ${pattern}`);
  const tokens = {};
  for (const match of found[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const red = parseInt(full.slice(1, 3), 16);
  const green = parseInt(full.slice(3, 5), 16);
  const blue = parseInt(full.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const failures = [];
let checked = 0;

console.log("theme  ratio  need  pair");
for (const [theme, tokens] of Object.entries(THEMES)) {
  for (const [front, back, need, what] of PAIRS) {
    const foreground = tokens[front];
    const background = tokens[back];
    if (!foreground || !background) {
      failures.push(`${theme}: ${front} or ${back} is not defined`);
      continue;
    }
    checked += 1;
    const value = ratio(foreground, background);
    const ok = value >= need;
    console.log(
      `${theme.padEnd(6)} ${value.toFixed(2).padStart(5)}  ${String(need).padStart(4)}  ${what}${ok ? "" : "  FAIL"}`,
    );
    if (!ok) {
      failures.push(
        `${theme}: ${what} is ${value.toFixed(2)} to 1, and ${front} on ${back} must be at least ${need} to 1`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`a11y: ${failure}`);
  process.exit(1);
}
console.log(`\na11y: ${checked} token pairs meet the contrast contract in docs/DESIGN.md section 6`);
