/**
 * Stage 00 fixtures. Everything here is invented — replace it with your real
 * inventory and the app stops being a demo without a single code change.
 *
 *   node scripts/seed.mjs           add fixtures to an empty database
 *   node scripts/seed.mjs --reset   wipe and reseed
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { computeFees } from "../lib/fees.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH = path.join(ROOT, "data", "closet.db");
const RESET = process.argv.includes("--reset");

// item, list, sold — the three shapes a garment moves through.
const FIXTURES = [
  { sku: "CL-0001", title: "Carhartt Detroit Jacket, blanket-lined", brand: "Carhartt", category: "Outerwear", size: "L", color: "Brown duck", swatch: "#7A5C37", material: "Cotton duck", condition: "good", flaws: ["Fraying at left cuff", "Sun fade on shoulders"], cost: 12, acquired: "2026-02-08", source: "Goodwill Outlet",
    list: { price: 145, ship: 12, channels: ["ebay", "depop"], posted: "2026-02-14" },
    sold: { channel: "ebay", price: 138, shipCollected: 12, shipCost: 11.4, at: "2026-03-02" } },

  { sku: "CL-0002", title: "Levi's 501 Made in USA, 34x32", brand: "Levi's", category: "Denim", size: "34x32", color: "Dark indigo", swatch: "#2F3E55", material: "100% cotton", condition: "excellent", flaws: [], cost: 8, acquired: "2026-02-08", source: "Goodwill Outlet",
    list: { price: 78, ship: 9, channels: ["ebay", "depop", "poshmark"], posted: "2026-02-14" },
    sold: { channel: "depop", price: 72, shipCollected: 9, shipCost: 8.1, at: "2026-03-19" } },

  { sku: "CL-0003", title: "Patagonia Synchilla Snap-T fleece", brand: "Patagonia", category: "Fleece", size: "M", color: "Oatmeal", swatch: "#C9BFA8", material: "Polyester fleece", condition: "excellent", flaws: [], cost: 15, acquired: "2026-01-22", source: "Estate sale",
    list: { price: 96, ship: 10, channels: ["ebay", "poshmark", "mercari"], posted: "2026-01-28" },
    sold: { channel: "poshmark", price: 92, shipCollected: 0, shipCost: 0, at: "2026-02-11" } },

  { sku: "CL-0004", title: "The North Face Nuptse 700 puffer", brand: "The North Face", category: "Outerwear", size: "L", color: "Black", swatch: "#22242A", material: "Nylon / goose down", condition: "good", flaws: ["Small repaired puncture, right sleeve"], cost: 30, acquired: "2026-01-15", source: "Marketplace lot",
    list: { price: 210, ship: 14, channels: ["ebay", "depop", "mercari"], posted: "2026-01-20" },
    sold: { channel: "ebay", price: 195, shipCollected: 14, shipCost: 13.2, at: "2026-02-04" } },

  { sku: "CL-0005", title: "Polo Ralph Lauren rugby shirt, striped", brand: "Ralph Lauren", category: "Tops", size: "XL", color: "Navy / cream", swatch: "#334A6B", material: "Cotton jersey", condition: "good", flaws: ["Faint mark at hem"], cost: 6, acquired: "2026-03-14", source: "Savers",
    list: { price: 54, ship: 8, channels: ["ebay", "poshmark"], posted: "2026-03-21" } },

  { sku: "CL-0006", title: "Nike ACG packable windbreaker", brand: "Nike", category: "Outerwear", size: "M", color: "Volt", swatch: "#C4D62E", material: "Ripstop nylon", condition: "excellent", flaws: [], cost: 18, acquired: "2026-03-14", source: "Savers",
    list: { price: 125, ship: 9, channels: ["depop", "ebay"], posted: "2026-03-21" },
    sold: { channel: "depop", price: 118, shipCollected: 9, shipCost: 8.4, at: "2026-04-08" } },

  { sku: "CL-0007", title: "Champion Reverse Weave hoodie, blank", brand: "Champion", category: "Sweats", size: "L", color: "Heather grey", swatch: "#9A9C9E", material: "Cotton fleece", condition: "good", flaws: ["Pilling on forearms"], cost: 5, acquired: "2026-03-28", source: "Goodwill bins",
    list: { price: 62, ship: 9, channels: ["depop", "mercari", "vinted"], posted: "2026-04-02" },
    sold: { channel: "vinted", price: 55, shipCollected: 0, shipCost: 0, at: "2026-05-21" } },

  { sku: "CL-0008", title: "Harley-Davidson single stitch tee, 1994", brand: "Harley-Davidson", category: "Tops", size: "XL", color: "Faded black", swatch: "#3B3A3C", material: "Cotton", condition: "fair", flaws: ["Two pinholes at collar", "Cracking on front graphic"], cost: 4, acquired: "2026-03-28", source: "Goodwill bins",
    list: { price: 165, ship: 6, channels: ["ebay", "depop"], posted: "2026-04-02" } },

  { sku: "CL-0009", title: "Dickies 874 work pants, 32x30", brand: "Dickies", category: "Trousers", size: "32x30", color: "Charcoal", swatch: "#4A4E52", material: "Poly-cotton twill", condition: "excellent", flaws: [], cost: 5, acquired: "2026-04-11", source: "Savers",
    list: { price: 34, ship: 8, channels: ["mercari", "vinted", "poshmark"], posted: "2026-04-16" },
    sold: { channel: "mercari", price: 32, shipCollected: 8, shipCost: 7.6, at: "2026-05-30" } },

  { sku: "CL-0010", title: "Stüssy world tour tee", brand: "Stüssy", category: "Tops", size: "M", color: "White", swatch: "#E8E6E0", material: "Cotton", condition: "good", flaws: ["Light collar wear"], cost: 10, acquired: "2026-04-11", source: "Savers",
    list: { price: 88, ship: 6, channels: ["depop", "ebay", "vinted"], posted: "2026-04-16" } },

  { sku: "CL-0011", title: "Arc'teryx Beta AR Gore-Tex shell", brand: "Arc'teryx", category: "Outerwear", size: "M", color: "Slate", swatch: "#5A6570", material: "Gore-Tex Pro", condition: "good", flaws: ["DWR worn at shoulders"], cost: 45, acquired: "2026-02-27", source: "Marketplace",
    list: { price: 285, ship: 13, channels: ["ebay", "mercari"], posted: "2026-03-05" },
    sold: { channel: "ebay", price: 268, shipCollected: 13, shipCost: 12.1, at: "2026-04-22" } },

  { sku: "CL-0012", title: "Barbour Bedale waxed jacket", brand: "Barbour", category: "Outerwear", size: "40", color: "Sage", swatch: "#5E6B4F", material: "Waxed cotton", condition: "good", flaws: ["Needs rewaxing", "Corduroy collar worn"], cost: 35, acquired: "2026-02-27", source: "Marketplace",
    list: { price: 175, ship: 14, channels: ["ebay", "depop"], posted: "2026-03-05" } },

  { sku: "CL-0013", title: "J.Crew merino crewneck", brand: "J.Crew", category: "Knitwear", size: "M", color: "Rust", swatch: "#A4573A", material: "100% merino", condition: "excellent", flaws: [], cost: 4, acquired: "2026-05-09", source: "Goodwill",
    list: { price: 42, ship: 8, channels: ["poshmark", "mercari"], posted: "2026-05-15" },
    sold: { channel: "poshmark", price: 38, shipCollected: 0, shipCost: 0, at: "2026-06-27" } },

  { sku: "CL-0014", title: "Uniqlo U wide-fit chore coat", brand: "Uniqlo", category: "Outerwear", size: "L", color: "Ecru", swatch: "#D8D2C4", material: "Cotton twill", condition: "excellent", flaws: [], cost: 12, acquired: "2026-05-09", source: "Goodwill",
    list: { price: 58, ship: 10, channels: ["depop", "vinted"], posted: "2026-05-15" } },

  { sku: "CL-0015", title: "adidas Firebird track jacket", brand: "adidas", category: "Outerwear", size: "M", color: "Navy", swatch: "#2C3A5C", material: "Tricot", condition: "good", flaws: ["Cuff elastic relaxed"], cost: 7, acquired: "2026-05-23", source: "Estate sale",
    list: { price: 64, ship: 9, channels: ["depop", "vinted", "mercari"], posted: "2026-05-29" },
    sold: { channel: "vinted", price: 58, shipCollected: 0, shipCost: 0, at: "2026-07-14" } },

  { sku: "CL-0016", title: "Wrangler 13MWZ, 36x34, made in USA", brand: "Wrangler", category: "Denim", size: "36x34", color: "Mid indigo", swatch: "#41597A", material: "Rigid denim", condition: "good", flaws: ["Hem roping worn"], cost: 6, acquired: "2026-05-23", source: "Estate sale",
    list: { price: 52, ship: 10, channels: ["ebay", "mercari"], posted: "2026-05-29" } },

  { sku: "CL-0017", title: "Filson Mackinaw cruiser, wool", brand: "Filson", category: "Outerwear", size: "42", color: "Forest", swatch: "#3F5140", material: "Mackinaw wool", condition: "good", flaws: ["Moth nibble at back hem"], cost: 55, acquired: "2026-01-15", source: "Marketplace lot",
    list: { price: 240, ship: 18, channels: ["ebay"], posted: "2026-01-25" } },

  { sku: "CL-0018", title: "Pendleton board shirt, plaid", brand: "Pendleton", category: "Shirts", size: "L", color: "Red / black", swatch: "#8C3A32", material: "Virgin wool", condition: "excellent", flaws: [], cost: 9, acquired: "2026-06-06", source: "Thrift",
    list: { price: 72, ship: 10, channels: ["ebay", "depop", "poshmark"], posted: "2026-06-12" },
    sold: { channel: "ebay", price: 68, shipCollected: 10, shipCost: 9.3, at: "2026-07-01" } },

  { sku: "CL-0019", title: "L.L.Bean chamois flannel shirt", brand: "L.L.Bean", category: "Shirts", size: "XL", color: "Mustard", swatch: "#B58A2C", material: "Cotton chamois", condition: "good", flaws: [], cost: 5, acquired: "2026-06-06", source: "Thrift",
    list: { price: 44, ship: 9, channels: ["mercari", "vinted"], posted: "2026-06-12" } },

  { sku: "CL-0020", title: "Polo Sport half-zip fleece", brand: "Ralph Lauren", category: "Fleece", size: "L", color: "Red", swatch: "#A33127", material: "Polyester fleece", condition: "good", flaws: ["Logo slightly cracked"], cost: 8, acquired: "2026-06-20", source: "Goodwill Outlet",
    list: { price: 68, ship: 10, channels: ["depop", "ebay"], posted: "2026-06-26" } },

  { sku: "CL-0021", title: "Lululemon Align leggings, 25\"", brand: "Lululemon", category: "Activewear", size: "6", color: "Black", swatch: "#26282C", material: "Nulu", condition: "excellent", flaws: [], cost: 6, acquired: "2026-06-20", source: "Goodwill Outlet",
    list: { price: 46, ship: 7, channels: ["poshmark", "mercari", "vinted"], posted: "2026-06-26" },
    sold: { channel: "poshmark", price: 44, shipCollected: 0, shipCost: 0, at: "2026-07-19" } },

  { sku: "CL-0022", title: "Free People tiered midi dress", brand: "Free People", category: "Dresses", size: "S", color: "Sage floral", swatch: "#8A9B77", material: "Rayon", condition: "excellent", flaws: [], cost: 7, acquired: "2026-07-04", source: "Thrift",
    list: { price: 58, ship: 8, channels: ["poshmark", "depop"], posted: "2026-07-10" } },

  { sku: "CL-0023", title: "Dr. Martens 1460, UK 8", brand: "Dr. Martens", category: "Footwear", size: "UK 8", color: "Cherry red", swatch: "#7B2E2A", material: "Smooth leather", condition: "good", flaws: ["Creasing at vamp", "Soles ~70%"], cost: 20, acquired: "2026-07-04", source: "Thrift",
    list: { price: 95, ship: 14, channels: ["ebay", "depop", "vinted"], posted: "2026-07-10" } },

  { sku: "CL-0024", title: "adidas Samba OG, US 9.5", brand: "adidas", category: "Footwear", size: "US 9.5", color: "White / black", swatch: "#EDEBE6", material: "Leather / suede", condition: "good", flaws: ["Midsole yellowing"], cost: 22, acquired: "2026-07-11", source: "Marketplace",
    list: { price: 78, ship: 12, channels: ["ebay", "mercari", "depop"], posted: "2026-07-17" } },

  { sku: "CL-0025", title: "Coach Willis leather bag, vintage", brand: "Coach", category: "Accessories", size: "One size", color: "British tan", swatch: "#9C6B3F", material: "Glovetanned leather", condition: "good", flaws: ["Strap darkened", "Interior pen mark"], cost: 28, acquired: "2026-07-11", source: "Marketplace",
    list: { price: 185, ship: 12, channels: ["ebay", "poshmark"], posted: "2026-07-17" } },

  { sku: "CL-0026", title: "Reebok Classic crewneck sweatshirt", brand: "Reebok", category: "Sweats", size: "M", color: "Cobalt", swatch: "#2E5AA8", material: "Cotton blend", condition: "good", flaws: [], cost: 4, acquired: "2026-07-25", source: "Goodwill bins", list: null },

  { sku: "CL-0027", title: "Eddie Bauer down vest", brand: "Eddie Bauer", category: "Outerwear", size: "L", color: "Olive", swatch: "#5F6440", material: "Nylon / down", condition: "good", flaws: ["Zipper pull replaced"], cost: 9, acquired: "2026-07-25", source: "Goodwill bins", list: null },

  { sku: "CL-0028", title: "Guess denim jacket, 90s wash", brand: "Guess", category: "Denim", size: "M", color: "Light wash", swatch: "#8FA4BE", material: "Cotton denim", condition: "excellent", flaws: [], cost: 11, acquired: "2026-07-25", source: "Goodwill bins", list: null },

  { sku: "CL-0029", title: "Marmot grid fleece pullover", brand: "Marmot", category: "Fleece", size: "M", color: "Teal", swatch: "#2F6A6B", material: "Polartec grid", condition: "excellent", flaws: [], cost: 6, acquired: "2026-08-01", source: "Savers", list: null },

  { sku: "CL-0030", title: "Vintage Nautica sailing jacket", brand: "Nautica", category: "Outerwear", size: "L", color: "Yellow / navy", swatch: "#D9A62E", material: "Nylon", condition: "good", flaws: ["Small stain on left pocket"], cost: 14, acquired: "2026-08-01", source: "Savers", list: null },
];

/* ------------------------------------------------------------------ */

if (RESET) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
  console.log("wiped existing database");
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(fs.readFileSync(path.join(ROOT, "lib", "schema.sql"), "utf8"));

const existing = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
if (existing > 0) {
  console.log(`database already has ${existing} items — run with --reset to replace them`);
  process.exit(0);
}

const insertItem = db.prepare(`
  INSERT INTO items (sku, title, brand, category, size, color, swatch, material,
                     condition, flaws, cost_basis, acquired_at, source, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertListing = db.prepare(`
  INSERT INTO listings (item_id, channel, external_id, url, title, price, shipping_price, status, posted_at, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSale = db.prepare(`
  INSERT INTO sales (listing_id, sold_price, shipping_collected, shipping_cost, sold_at)
  VALUES (?, ?, ?, ?, ?)
`);
const insertFee = db.prepare(`INSERT INTO fees (sale_id, kind, label, amount) VALUES (?, ?, ?, ?)`);

// Vinted and Poshmark ship on their own labels, so the seller neither collects
// nor pays shipping. That asymmetry is exactly what the net column exists to expose.
const SELLER_HANDLES_SHIPPING = { ebay: true, depop: true, mercari: true, poshmark: false, vinted: false };

let items = 0, listings = 0, sales = 0;

db.exec("BEGIN");
for (const f of FIXTURES) {
  const status = f.sold ? "sold" : f.list ? "listed" : "draft";

  const itemId = insertItem.run(
    f.sku, f.title, f.brand, f.category, f.size, f.color, f.swatch, f.material,
    f.condition, JSON.stringify(f.flaws ?? []), f.cost, f.acquired, f.source, status
  ).lastInsertRowid;
  items++;

  if (!f.list) continue;

  for (const channel of f.list.channels) {
    const isSoldHere = f.sold?.channel === channel;
    const listingStatus = f.sold ? (isSoldHere ? "sold" : "ended") : "live";
    const ship = SELLER_HANDLES_SHIPPING[channel] ? f.list.ship : 0;

    const listingId = insertListing.run(
      itemId,
      channel,
      `${channel.toUpperCase()}-${f.sku.replace("CL-", "")}`,
      `https://example.invalid/${channel}/${f.sku.toLowerCase()}`,
      f.list.title ?? f.title,
      f.list.price,
      ship,
      listingStatus,
      f.list.posted,
      f.list.posted
    ).lastInsertRowid;
    listings++;

    if (!isSoldHere) continue;

    const saleId = insertSale.run(
      listingId, f.sold.price, f.sold.shipCollected, f.sold.shipCost, f.sold.at
    ).lastInsertRowid;
    sales++;

    for (const fee of computeFees(channel, {
      soldPrice: f.sold.price,
      shippingCollected: f.sold.shipCollected,
    })) {
      insertFee.run(saleId, fee.kind, fee.label, fee.amount);
    }
  }
}
db.exec("COMMIT");

console.log(`seeded ${items} items, ${listings} listings, ${sales} sales`);
db.close();
