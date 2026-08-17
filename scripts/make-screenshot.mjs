/**
 * Generates the 1280×800 Chrome Web Store screenshot.
 *
 *   node scripts/make-screenshot.mjs
 *
 * Chrome requires exactly 1280×800 or 640×400, so this is composed rather than
 * captured — a real screengrab would need cropping to those dimensions and the
 * seller's actual inventory would be in it.
 *
 * It depicts what the extension genuinely does: the queue in the popup, a
 * marketplace form filled, and the banner reporting what it filled and what it
 * left alone. Nothing here claims a capability the extension doesn't have.
 */

import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve(import.meta.dirname, "..", "store-screenshot-1280x800.png");

const INK = "#1A1F1D";
const SURFACE = "#1B201D";
const RAISED = "#222724";
const RULE = "#2E3531";
const PAPER = "#E6E8E3";
const MUTED = "#9AA19B";
const DENIM = "#8FB4D6";
const SAGE = "#8FB487";

const mono = "ui-monospace, Consolas, monospace";
const sans = "system-ui, -apple-system, Segoe UI, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="${INK}"/>

  <!-- headline -->
  <text x="64" y="86" font-family="${sans}" font-size="38" font-weight="700" fill="${PAPER}"
        letter-spacing="-0.8">One garment. Every marketplace.</text>
  <text x="64" y="122" font-family="${sans}" font-size="17" fill="${MUTED}">
    Threader fills the sell form. You review it and submit it yourself.</text>

  <!-- marketplace form -->
  <rect x="64" y="164" width="700" height="580" rx="8" fill="${SURFACE}" stroke="${RULE}"/>

  <!-- banner -->
  <rect x="64" y="164" width="700" height="52" rx="8" fill="#101312"/>
  <rect x="64" y="200" width="700" height="16" fill="#101312"/>
  <text x="88" y="196" font-family="${sans}" font-size="14" font-weight="650" fill="${PAPER}">
    Threader filled 8</text>
  <text x="215" y="196" font-family="${sans}" font-size="13" fill="${MUTED}">
    photos, title, description, price, size, quantity, condition, brand.</text>

  ${[
    ["Photos", "4 attached", SAGE],
    ["Title", "Carhartt Detroit Jacket, blanket-lined — L", PAPER],
    ["Description", "Brown duck Detroit jacket. Fraying at the left cuff and", PAPER],
    ["", "sun fade across the shoulders — both pictured.", MUTED],
    ["Price", "$145.00", PAPER],
    ["Size", "L", PAPER],
    ["Condition", "Used — Good", PAPER],
    ["Brand", "Carhartt", PAPER],
  ]
    .map(([label, value, colour], i) => {
      const y = 262 + i * 56;
      return label
        ? `<text x="96" y="${y}" font-family="${mono}" font-size="11" fill="${MUTED}"
                 letter-spacing="1.4">${label.toUpperCase()}</text>
           <rect x="96" y="${y + 10}" width="636" height="32" rx="4" fill="${RAISED}" stroke="${RULE}"/>
           <text x="110" y="${y + 31}" font-family="${sans}" font-size="14" fill="${colour}">${value}</text>`
        : `<text x="110" y="${y - 8}" font-family="${sans}" font-size="14" fill="${colour}">${value}</text>`;
    })
    .join("")}

  <!-- popup -->
  <rect x="812" y="164" width="404" height="368" rx="8" fill="${SURFACE}" stroke="${RULE}"/>
  <text x="840" y="204" font-family="${sans}" font-size="18" font-weight="700" fill="${PAPER}">Threader</text>
  <text x="840" y="226" font-family="${sans}" font-size="12.5" fill="${MUTED}">
    Fills your sell forms. You submit.</text>
  <line x1="812" y1="248" x2="1216" y2="248" stroke="${RULE}"/>

  ${[
    ["Carhartt Detroit Jacket", "CL-0001 · depop · $145", "Fill on Depop"],
    ["Levi's 501 Made in USA", "CL-0002 · vinted · $78", "Fill on Vinted"],
    ["Arc'teryx Beta AR shell", "CL-0011 · grailed · $285", "Fill on Grailed"],
  ]
    .map(([name, meta, action], i) => {
      const y = 288 + i * 76;
      return `<text x="840" y="${y}" font-family="${sans}" font-size="14" font-weight="600" fill="${PAPER}">${name}</text>
              <text x="840" y="${y + 19}" font-family="${mono}" font-size="11.5" fill="${MUTED}">${meta}</text>
              <rect x="1052" y="${y - 16}" width="140" height="32" rx="4" fill="${DENIM}"/>
              <text x="1122" y="${y + 5}" font-family="${sans}" font-size="12.5" font-weight="600"
                    fill="#101619" text-anchor="middle">${action}</text>
              ${i < 2 ? `<line x1="840" y1="${y + 38}" x2="1192" y2="${y + 38}" stroke="${RULE}"/>` : ""}`;
    })
    .join("")}

  <!-- the promise -->
  <rect x="812" y="560" width="404" height="184" rx="8" fill="${SURFACE}" stroke="${RULE}"/>
  <text x="840" y="598" font-family="${mono}" font-size="11" fill="${MUTED}" letter-spacing="1.6">
    WHAT IT WON'T DO</text>
  ${[
    "Never asks for a marketplace password",
    "Never submits a listing for you",
    "Runs in your own browser session",
  ]
    .map(
      (line, i) =>
        `<text x="840" y="${632 + i * 30}" font-family="${sans}" font-size="14" fill="${PAPER}">
           <tspan fill="${SAGE}">✓</tspan>  ${line}</text>`
    )
    .join("")}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`wrote ${OUT}`);
