/**
 * Generates the extension icons from a single vector description, with no image
 * dependencies: shapes are point-sampled at 4x4 per pixel for antialiasing and encoded
 * as PNG with the built-in zlib.
 *
 * The same description is emitted as public/icon.svg so the artwork can be edited in a
 * vector tool later without reverse-engineering the raster output.
 *
 * Design: a rounded indigo tile holding a white browser-tab silhouette with a crescent
 * moon knocked out of it (tab + sleep). Kept deliberately blocky so it survives 16px,
 * and deliberately unlike Chrome's own logo and colour palette.
 */
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

const INDIGO = [79, 70, 229];
const WHITE = [255, 255, 255];

/** Rounded rectangle in unit coordinates. */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** The tab silhouette: a body with a smaller "tongue" sitting on top of it. */
function inTab(x, y) {
  return (
    inRoundRect(x, y, 0.16, 0.34, 0.84, 0.82, 0.09) ||
    inRoundRect(x, y, 0.16, 0.19, 0.54, 0.42, 0.07)
  );
}

/** Crescent: a disc with an offset disc removed. */
function inMoon(x, y) {
  return inCircle(x, y, 0.47, 0.58, 0.165) && !inCircle(x, y, 0.56, 0.51, 0.155);
}

/** Returns [r, g, b, a] for a unit-square point, or null for transparent. */
function sample(x, y) {
  if (!inRoundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  if (inTab(x, y) && !inMoon(x, y)) return WHITE;
  return INDIGO;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (col * SAMPLES + sx + 0.5) * step;
          const y = (row * SAMPLES + sy + 0.5) * step;
          const c = sample(x, y);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            hits++;
          }
        }
      }
      const total = SAMPLES * SAMPLES;
      const i = (row * size + col) * 4;
      if (hits > 0) {
        px[i] = Math.round(r / hits);
        px[i + 1] = Math.round(g / hits);
        px[i + 2] = Math.round(b / hits);
        px[i + 3] = Math.round((hits / total) * 255);
      }
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function toPng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace all 0

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row++) {
    raw[row * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <mask id="moon">
      <rect width="100" height="100" fill="#fff"/>
      <circle cx="47" cy="58" r="16.5" fill="#000"/>
      <circle cx="56" cy="51" r="15.5" fill="#fff"/>
    </mask>
  </defs>
  <rect x="2" y="2" width="96" height="96" rx="22" fill="#4f46e5"/>
  <g fill="#fff" mask="url(#moon)">
    <rect x="16" y="19" width="38" height="23" rx="7"/>
    <rect x="16" y="34" width="68" height="48" rx="9"/>
  </g>
</svg>
`;

await mkdir(resolve(root, "public/icons"), { recursive: true });
for (const size of SIZES) {
  const file = resolve(root, `public/icons/icon-${size}.png`);
  await writeFile(file, toPng(size, render(size)));
  console.log(`wrote public/icons/icon-${size}.png`);
}
// The SVG master lives in design/ (not public/) so it is not copied into dist/.
await mkdir(resolve(root, "design"), { recursive: true });
await writeFile(resolve(root, "design/icon.svg"), SVG);
console.log("wrote design/icon.svg");
