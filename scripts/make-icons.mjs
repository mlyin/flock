/**
 * Rasterises the Flock brand SVGs into every icon slot that needs a PNG.
 *
 *   node scripts/make-icons.mjs
 *
 * Sources live in public/brand/ (drawn by hand, pushed 18 Aug 2026):
 *
 *   favicon.svg    sheep face close-up on a lime tile — drawn FOR small sizes,
 *                  so it feeds the 16/32px slots where the full sheep would
 *                  smear into a blob
 *   icon-lime.svg  full sheep on a lime tile — the 48/128px extension icons,
 *                  the store icon, and the touch icon
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

const face = fs.readFileSync(path.join(BRAND, "favicon.svg"));
const sheep = fs.readFileSync(path.join(BRAND, "icon-lime.svg"));

const jobs = [
  { src: face, size: 16, to: path.join(OUT, "icon-16.png") },
  { src: face, size: 32, to: path.join(OUT, "icon-32.png") },
  { src: sheep, size: 48, to: path.join(OUT, "icon-48.png") },
  { src: sheep, size: 128, to: path.join(OUT, "icon-128.png") },
  { src: face, size: 512, to: path.join(ROOT, "app", "icon.png") },
  { src: sheep, size: 180, to: path.join(ROOT, "app", "apple-icon.png") },
];

for (const { src, size, to } of jobs) {
  await sharp(src, { density: 512 }).resize(size, size).png().toFile(to);
  console.log(`${path.relative(ROOT, to)}  ${size}×${size}`);
}

console.log("\nReload the extension at chrome://extensions to see the new toolbar icon.");
