# Threader — working notes

Resale operations for secondhand clothing. Photograph a garment, get it identified and
priced, list it across five marketplaces, and see what you actually netted.

Multi-tenant product. Postgres + Supabase Auth + Supabase Storage, deployed on Vercel.

## Running it

```bash
npm run dev        # localhost:3737
npm run dev:lan    # binds 0.0.0.0 for another machine on the LAN
npm run migrate    # apply supabase/migrations/*.sql (needs SUPABASE_DB_URL)
```

Requires `.env.local` — see `.env.example`. Without the Supabase vars the auth
middleware no-ops and every page will fail on its first query, so all five are needed.

**Don't run `npm run build` while the dev server is running.** They share `.next/`, and
the production build clobbers the dev server's assets — the app then 404s on its own CSS
until you restart dev.

## Load-bearing decisions

**Row-level security does the tenant isolation, not application code.** Every table has
RLS on and a `auth.uid() = user_id` policy. Reads go through the request-scoped Supabase
client (`lib/supabase/server.ts` → `supabaseServer()`), so you will not see `where
user_id = ...` in `lib/data.ts` — that's deliberate. Forgetting a filter returns nothing
rather than leaking another seller's inventory. **Inserts must set `user_id` explicitly**
or the `with check` clause rejects them.

`supabaseAdmin()` bypasses RLS entirely. It exists for OAuth callbacks and background
jobs. Never import it into a client component, and scope every query by hand when you do
use it.

**An `item` is a physical garment; a `listing` is one item on one channel.** Marketplace
vocabulary never leaks into `items`. Cross-listing, delist-on-sold, and per-channel copy
all fall out of this split. Don't collapse it.

**Money is `numeric(10,2)`, never float.** PostgREST can return numerics as strings, so
`lib/data.ts` coerces with `num()` on the way in.

**Fee rules are data, not code** — `lib/fees.ts`. Every entry is marked
`verifiedOn: "unverified"` and was written from memory of public fee pages. Every net
figure is only as honest as that table. Update `verifiedOn` when you check one.

**Only eBay has a public listing API.** Poshmark, Depop, Mercari, and Vinted have no open
seller-write API — reaching them means a browser extension driving the seller's own
logged-in session. `CHANNEL_ACCESS` in `lib/fees.ts` encodes this.

This matters more now than it did when this was a personal tool: automating a
*customer's* marketplace account puts their income at risk, not ours. That's why the
extension model exists — the seller installs it and drives it. Don't move that
automation server-side.

**Low-confidence inference becomes a question, never a silent guess.** `lib/inference.ts`
asks for per-field confidence and turns anything under 0.70 into a question for the
seller. Brand is the field to be most paranoid about — the prompt forbids inferring it
from styling, only reading it off tags. Keep that property if you touch the prompt.

**Every inference is kept**, with token counts. It's the receipt when a brand comes back
wrong and the signal for judging quality over time.

## Photos

The browser uploads straight to Supabase Storage under `{user_id}/inbox/{uuid}.ext`; the
bucket policy checks that first path segment against `auth.uid()`, so a client can't aim
an upload at someone else's prefix. On identification the object moves to
`{user_id}/{item_id}/`. The bucket is private — images are served via short-lived signed
URLs (`signPhotos()`), never public links.

The inbox is a query (`photos where item_id is null`), not a folder.

## Migrations

`supabase/migrations/*.sql`, applied in filename order by `scripts/migrate.mjs`, each in
a transaction, tracked in `schema_migrations`. Additive only — write a new file, never
edit an applied one.

## Known gaps

- `channel_accounts` stores eBay OAuth tokens in plaintext. RLS keeps users out of each
  other's rows, but a database dump would be enough to act as any connected seller.
  **Encrypt before anyone but the owner connects an account.**
- No listing creation yet. Items and photos are real; listings, sales, and fees have
  schema and math but nothing writes them.
- No pricing from sold comps yet.

## Where this is going

- **Stage 02** — pricing from sold comps, showing the comps behind the number.
- **Stage 03** — eBay via its real API; the other four via browser extension.
