# Threader

Personal resale operations tool. One catalog, five channels, and an honest answer to
"what did I actually net."

Stages 00–01. Nothing is posted to any marketplace and no marketplace credentials
exist — the only outbound call this app makes is to the Anthropic API, to read your
photos.

## Running it

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key in
npm run seed                 # 30 fixture garments
npm run dev                  # http://localhost:3737
```

`npm run reset` wipes and reseeds. The database is a single file at `data/threader.db` —
delete it and start over any time.

The API key is only needed for photo identification; the dashboard runs without one.

## Photo → draft listing

Drop photos into `photos/inbox`. Two per garment works best: the piece itself, and
its brand or care tag. JPEG or PNG — **iPhone HEIC needs converting first** (Settings →
Camera → Formats → Most Compatible shoots JPEG directly).

On the Inbox page, select the photos that belong to one garment and hit **Identify
garment**. What happens:

1. Each photo is EXIF-rotated and resized to 2000px on the long edge (`MAX_EDGE` in
   [lib/inference.ts](lib/inference.ts)) — enough to read a care label, not so much
   that you pay for pixels you don't need.
2. Claude returns a fixed JSON schema: brand, category, size, colour, material,
   condition, flaws, plus **a confidence score per field**.
3. Anything scored under 0.70 becomes a **question for you**, not a silent guess.
4. A draft item is created with `review_state = 'unreviewed'`, the photos move out of
   the inbox into `photos/items/<sku>/`, and the raw model output is written to the
   `inferences` table.
5. The item page shows the extraction as an editable form with confidence badges.
   Nothing enters your real inventory until you hit **Confirm details**.

**Brand is the field to distrust.** The prompt forbids inferring a brand from styling —
it only reads brands off tags and logos — but check it anyway. A wrong brand is a
wrong price.

Cost is a few cents per garment at two photos. Measure your own before scaling up.

### Tuning

- **Sloppy reads** → raise `effort` from `medium` in `lib/inference.ts`.
- **Too expensive** → drop `MAX_EDGE`, or shoot one photo instead of two.
- **Wrong vocabulary** → the category list and condition scale are in the same file;
  edit them to match how you actually describe stock.

## Stack

- **Next.js 15** (App Router). Server components read SQLite directly; there's no API layer
  yet because nothing needs one.
- **`node:sqlite`** — built into Node 24, so there's no native module to compile and no
  ORM to fight. `lib/schema.sql` is the whole schema.
- **Plain CSS** with tokens in `app/globals.css`. Light and dark both defined.

## The one idea worth preserving

An **item** is a physical garment you own. A **listing** is one item on one channel.
Marketplace vocabulary never leaks into `items`. Everything else — cross-listing,
delist-on-sold, per-channel copy — falls out of that split cleanly. Break it and you'll
be untangling eBay's category IDs from your own inventory for months.

Fee rules live in `lib/fees.ts` as **data, not code**. Rates change; a rate change should
be a line edit, not a rewrite.

## Layout

```
app/
  page.tsx            dashboard — tiles, channel strip, inventory grid
  items/[id]/         one garment: photos, review form, listings, money ledger
  inbox/              photo intake and the unreviewed queue
  fees/               fee rules + net-at-price comparison
  actions.ts          server actions: analyze photos, confirm a draft
  api/photo/          serves files out of photos/ (path-traversal guarded)
lib/
  schema.sql          items, photos, listings, sales, fees, inferences
  inference.ts        the vision call — schema, prompt, image encoding
  intake.ts           inference → draft item, photo filing, SKU assignment
  fees.ts             per-channel fee rules and net projection
  queries.ts          reads and the summary aggregation
  db.ts               node:sqlite connection + additive migrations
scripts/seed.mjs      30 fixture garments
photos/inbox/         drop photos here
photos/items/<sku>/   where they land once identified
```

## Known-unverified

`lib/fees.ts` carries `verifiedOn: "unverified"` on every channel. The rates were written
from public fee pages and will be stale. Check each channel's current schedule before
trusting any net figure, and update the date when you do.

Channel write access (`CHANNEL_ACCESS`) reflects the same assumption the project is built
on: only eBay has a public listing API. The other four would need a browser extension
driving your own logged-in session. Verify before building stage 03.

## What's next

- **Stage 02** — pricing from sold comps, showing the comps that produced the number.
  Every confirmed item now carries the attributes a comp query needs.
- **Stage 03** — eBay via its real API first; the other four via a browser extension
  driving your own logged-in session.

Every stored inference is kept. Six months of them is the signal for judging whether the
model is actually good at your inventory — and for deciding what to fix if it isn't.
