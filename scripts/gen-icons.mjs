/**
 * Placeholder icon set, generated rather than committed as opaque binaries so
 * the mark can be reasoned about and reproduced. T-504 replaces it with real
 * artwork for the stores.
 *
 * The mark: an accent rounded square carrying three white bars of decreasing
 * width, which reads as a list of tabs at 16 px as well as at 128 px.
 */
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "assets", "icons");
const SIZES = [16, 32, 48, 128];
const ACCENT = [37, 99, 235];
const INK = [255, 255, 255];
const SAMPLES = 3;

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const size of SIZES) {
    const png = encodePng(size, size, draw(size));
    await writeFile(path.join(outDir, `icon-${size}.png`), png);
    console.log(`icons: icon-${size}.png`);
  }
}

/** Returns an RGBA buffer for one icon at the given size. */
function draw(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const radius = size * 0.22;
  // Three bars: y offset, height, width, as fractions of the canvas.
  const bars = [
    { y: 0.24, h: 0.11, w: 0.56 },
    { y: 0.44, h: 0.11, w: 0.44 },
    { y: 0.64, h: 0.11, w: 0.3 },
  ].map((bar) => ({
    x0: size * 0.22,
    x1: size * (0.22 + bar.w),
    y0: size * bar.y,
    y1: size * (bar.y + bar.h),
  }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bg = 0;
      let ink = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          if (!insideRoundedRect(px, py, size, radius)) continue;
          bg += 1;
          if (bars.some((bar) => px >= bar.x0 && px <= bar.x1 && py >= bar.y0 && py <= bar.y1)) {
            ink += 1;
          }
        }
      }
      const total = SAMPLES * SAMPLES;
      if (bg === 0) continue;
      const alpha = bg / total;
      const inkShare = ink / bg;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          ACCENT[channel] * (1 - inkShare) + INK[channel] * inkShare,
        );
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

function insideRoundedRect(x, y, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  if (x >= 0 && x <= size && y >= 0 && y <= size) {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius + 1e-9;
  }
  return false;
}

/** Minimal PNG writer: IHDR, IDAT, IEND with 8 bit RGBA scanlines. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

await main();
