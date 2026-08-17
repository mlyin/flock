# Closet — working notes

Personal resale operations tool. One person's clothing inventory, listed across five
marketplaces, with an honest net-proceeds figure.

## What this is and isn't

**Personal tool, single user, one machine.** Do not add authentication, multi-tenancy,
user accounts, or anything that only makes sense for a product with customers. There is
one seller and he owns the laptop.

The owner has already accepted the ToS and account risk of automating Poshmark, Depop,
Mercari, and Vinted. That decision is settled — build stage 03 when asked without
relitigating it. Flag *new, specific* risks (a rate limit that would trip detection);
don't re-raise the general one.

## Running it

```bash
npm run dev        # localhost only, port 3737
npm run dev:lan    # binds 0.0.0.0 so another machine on the LAN can view it
npm run reset      # wipe and reseed the 30 fixture garments
```

Needs `ANTHROPIC_API_KEY` in `.env.local` for photo identification only. The dashboard
runs fine without one.

**Don't run `npm run build` while the dev server is running.** They share `.next/`, and
the production build clobbers the dev server's assets — the app then 404s on its own
CSS until you restart dev. Stop dev first, or accept the restart.

## Load-bearing decisions

**An `item` is a physical garment; a `listing` is one item on one channel.** Marketplace
vocabulary never leaks into `items`. Cross-listing, delist-on-sold, and per-channel copy
all fall out of this split cleanly. Don't collapse it.

**Fee rules are data, not code** — `lib/fees.ts`. Rates change constantly; a change should
be a line edit that everything downstream recomputes. Every entry is currently marked
`verifiedOn: "unverified"` and was written from memory of public fee pages. Treat every
net figure as only as honest as that table, and update `verifiedOn` when you check.

**Only eBay has a public listing API.** Poshmark, Depop, Mercari, and Vinted have no
open seller-write API — stage 03 means a browser extension driving the seller's own
logged-in session. `CHANNEL_ACCESS` in `lib/fees.ts` encodes this. Verify before
building on it.

**Low-confidence inference becomes a question, never a silent guess.** `lib/inference.ts`
asks for a per-field confidence score and turns anything under 0.70 into a question for
the seller. Brand is the field to be most paranoid about — the prompt forbids inferring
it from styling. Keep that property if you touch the prompt.

**Every inference is kept.** The `inferences` table stores raw model output per item. It's
the audit trail when a brand comes back wrong, and the signal for judging quality later.

## Stack notes

- **`node:sqlite`**, built into Node 24 — no ORM, no native module to compile.
  `lib/schema.sql` is the whole schema.
- **Migrations are additive and manual.** `CREATE TABLE IF NOT EXISTS` won't add a column
  to an existing table, so new columns go in the `migrate()` function in `lib/db.ts` as
  well as in `schema.sql`. The dev server caches the connection on `globalThis`, so a
  schema change needs a **server restart**, not just a hot reload.
- **Plain CSS** with tokens in `app/globals.css`. Light and dark are both fully defined —
  redefine tokens, never style inside a media query.
- Server components read SQLite directly. There's no API layer because nothing needs one
  yet; `app/api/photo/` exists only to serve files off disk (path-traversal guarded).
- Server actions live in `app/actions.ts`.

## Not in git

`data/closet.db` and `photos/` are gitignored — they're the actual inventory, not source.
A fresh clone gets the code and an empty closet; run `npm run seed` for fixtures.

## Where this is going

- **Stage 02** — pricing from sold comps, showing the comps that produced the number.
- **Stage 03** — eBay via its real API first; the other four via browser extension.
