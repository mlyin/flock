-- An `item` is a physical garment you own.
-- A `listing` is one item on one channel. Marketplace vocabulary never leaks into `items`.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY,
  sku          TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL,
  brand        TEXT,
  category     TEXT    NOT NULL,
  size         TEXT,
  color        TEXT,
  swatch       TEXT,                       -- hex, for the placeholder tile until real photos land
  material     TEXT,
  condition    TEXT    NOT NULL,           -- nwt | excellent | good | fair
  flaws        TEXT,                       -- JSON array of strings
  measurements TEXT,                       -- JSON object, inches
  cost_basis   REAL    NOT NULL DEFAULT 0,
  acquired_at  TEXT,
  source       TEXT,                       -- where you sourced it
  status       TEXT    NOT NULL DEFAULT 'draft',   -- draft | listed | sold | donated
  review_state TEXT    NOT NULL DEFAULT 'confirmed', -- unreviewed | confirmed
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  path       TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'hero',   -- hero | tag | flaw | detail
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  channel        TEXT    NOT NULL,          -- ebay | poshmark | depop | mercari | vinted
  external_id    TEXT,
  url            TEXT,
  title          TEXT,                      -- per-channel copy; differs from item.title on purpose
  description    TEXT,
  price          REAL    NOT NULL,
  shipping_price REAL    NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'draft',  -- draft | live | sold | ended | error
  error          TEXT,
  posted_at      TEXT,
  last_synced_at TEXT,
  UNIQUE (item_id, channel)
);

CREATE TABLE IF NOT EXISTS sales (
  id                 INTEGER PRIMARY KEY,
  listing_id         INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  sold_price         REAL    NOT NULL,
  shipping_collected REAL    NOT NULL DEFAULT 0,   -- what the buyer paid you for shipping
  shipping_cost      REAL    NOT NULL DEFAULT 0,   -- what the label actually cost you
  sold_at            TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS fees (
  id      INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  kind    TEXT    NOT NULL,      -- commission | payment | shipping | promo
  label   TEXT    NOT NULL,
  amount  REAL    NOT NULL
);

-- Every model call is kept. When it mislabels a brand you want the receipt,
-- and six months of these is the signal for making it better.
CREATE TABLE IF NOT EXISTS inferences (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
  source_path TEXT,
  model       TEXT    NOT NULL,
  fields      TEXT    NOT NULL,   -- JSON
  confidence  TEXT,               -- JSON, per-field 0..1
  raw         TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_item    ON listings (item_id);
CREATE INDEX IF NOT EXISTS idx_listings_channel ON listings (channel, status);
CREATE INDEX IF NOT EXISTS idx_photos_item      ON photos (item_id);
CREATE INDEX IF NOT EXISTS idx_sales_listing    ON sales (listing_id);
CREATE INDEX IF NOT EXISTS idx_fees_sale        ON fees (sale_id);
