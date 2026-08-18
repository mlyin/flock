/**
 * Rasterises the Flock brand SVGs into every icon slot that needs a PNG.
 *
 *   node scripts/make-icons.mjs
 *
 * The mark is composed here rather than shrunk, because neither hand-drawn
 * tile survives being scaled down to a browser tab:
 *
 *   favicon.svg    the face close-up. Bold in isolation, but mostly BLACK — at
 *                  16px it reads as a dark blob with a few lime corner pixels,
 *                  which is exactly what it looked like in the tab.
 *   icon-lime.svg  the full sheep, but inset in its tile. Shrunk to 16px the
 *                  sheep itself is only ~8px across and the legs disappear.
 *
 * So: draw the rounded lime tile at the target size, and composite the sheep
 * over it at 80% — no inherited padding, and the silhouette stays as large as
 * the tile allows. The corner radius is a ratio, so it looks right at 16px and
 * at 512px instead of being tuned for one of them.
 *
 * Outputs:
 *   extension/icons/icon-{16,32,48,128}.png   Chrome toolbar + store
 *   app/icon.png                              site favicon (Next serves it)
 *   app/apple-icon.png                        iOS home-screen tile
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BRAND = path.join(ROOT, "public", "brand");
const OUT = path.join(ROOT, "extension", "icons");

const LIME = "#C0E42A";

// The sheep alone, white body with ink legs, on transparent — 200×200 viewBox.
const sheepFile = fs.readFileSync(path.join(BRAND, "sheep-wool.svg"), "utf8");

// Composition happens in SVG, not in raster. Rasterising the sheep separately
// and compositing it produced a speck in the corner: sharp renders a
// viewBox-only SVG at its own idea of a size, so `resize(inner, inner)` was
// scaling something already tiny. Inlining the artwork into one SVG and
// rendering that once has no intermediate size to get wrong.
const sheepInner = sheepFile.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/**
 * The sheep's own drawing spans roughly x 34–166, y 23–176 of its 200 box, so
 * it already fills most of it. 0.88 pulls it in just enough to clear the
 * rounded corners without shrinking back into a dot.
 */
const composed = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">` +
      `<rect width="200" height="200" rx="45" fill="${LIME}"/>` +
      `<g transform="translate(100 100) scale(0.88) translate(-100 -100)">${sheepInner}</g>` +
      `</svg>`
  );

async function icon(size, to) {
  await sharp(composed(size), { density: 900 }).resize(size, size).png().toFile(to);
  console.log(`${path.relative(ROOT, to)}  ${size}×${size}`);
}

for (const [size, to] of [
  [16, path.join(OUT, "icon-16.png")],
  [32, path.join(OUT, "icon-32.png")],
  [48, path.join(OUT, "icon-48.png")],
  [128, path.join(OUT, "icon-128.png")],
  [512, path.join(ROOT, "app", "icon.png")],
  [180, path.join(ROOT, "app", "apple-icon.png")],
]) {
  await icon(size, to);
}

console.log("\nReload the extension at chrome://extensions to see the new toolbar icon.");
