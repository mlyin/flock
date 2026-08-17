/**
 * Generates the extension icon set and the Chrome Web Store icon.
 *
 *   node scripts/make-icons.mjs
 *
 * Chrome's store guidelines want the artwork inset inside the 128px square
 * rather than bleeding to the edge, so the tile is 96px centred with 16px of
 * transparent padding. The mark has to survive being shrunk to 16px in a
 * toolbar, which rules out anything fine — hence a single heavy letterform.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "extension", "icons");

// The app's own palette, so the extension doesn't look like a stranger.
const DENIM = "#3A5570";
const PAPER = "#EFF0EC";

/**
 * A "T" with the crossbar drawn as a thread that dips — legible as a letter at
 * 16px, and a stitch at 128px.
 */
const mark = (size, pad) => {
  const inner = size - pad * 2;
  const r = Math.round(inner * 0.22);
  const stroke = Math.max(2, Math.round(inner * 0.11));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="${DENIM}"/>
  <g stroke="${PAPER}" stroke-width="${stroke}" stroke-linecap="round" fill="none">
    <path d="M ${pad + inner * 0.24} ${pad + inner * 0.34}
             Q ${pad + inner * 0.5} ${pad + inner * 0.46}
               ${pad + inner * 0.76} ${pad + inner * 0.34}"/>
    <line x1="${pad + inner * 0.5}" y1="${pad + inner * 0.38}"
          x2="${pad + inner * 0.5}" y2="${pad + inner * 0.74}"/>
  </g>
</svg>`;
};

await fs.promises.mkdir(OUT, { recursive: true });

// Toolbar icons bleed to the edge — at 16px, padding costs legibility.
for (const size of [16, 32, 48]) {
  await sharp(Buffer.from(mark(size, 0))).png().toFile(path.join(OUT, `icon-${size}.png`));
}

// 128 is the store icon: inset, per Chrome's image guidelines.
await sharp(Buffer.from(mark(128, 16))).png().toFile(path.join(OUT, "icon-128.png"));
await sharp(Buffer.from(mark(128, 16)))
  .png()
  .toFile(path.join(ROOT, "store-icon-128.png"));

console.log("wrote extension/icons/{16,32,48,128} and store-icon-128.png");
