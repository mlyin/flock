# Flock — working notes

Resale operations for secondhand clothing. Photograph a garment, get it identified and
priced, cross-list it, and see what you actually netted. Multi-tenant: Next.js 15 +
Supabase (Postgres, Auth, Storage) on Vercel, plus a Chrome extension.

Live at **www.sellonflock.com**. Repo **github.com/mlyin/flock**.

## Running it

```bash
npm run dev        # localhost:3737
npm run dev:lan    # binds 0.0.0.0 for another machine on the LAN
npm run migrate    # apply supabase/migrations/*.sql (needs SUPABASE_DB_URL)
```

`.env.local` is gitignored — copy `.env.example` and fill in five values. The Supabase
project is shared, so a fresh clone sees the same inventory immediately.

The extension is loaded unpacked from `extension/` at `chrome://extensions`, and must be
**reloaded there after any change to it** — Chrome does not hot-reload unpacked
extensions, and forgetting this looks exactly like a broken fix.

**Don't run `npm run build` while the dev server is running.** They share `.next/`, and
the production build clobbers the dev server's assets — the app then 404s on its own CSS
until you restart dev.

## Load-bearing decisions

**Row-level security does the tenant isolation, not application code.** Every table has
RLS on with an `auth.uid() = user_id` policy, so you won't see `where user_id = ...` in
`lib/data.ts`. That's deliberate: forgetting a filter returns nothing rather than leaking
another seller's inventory. **Inserts must set `user_id` explicitly** or the `with check`
clause rejects them.

Bearer-authenticated routes under `/api/ext/*` are the exception. The extension carries a
token, not a session, so there's no `auth.uid()` for RLS to match — those routes use
`supabaseAdmin()` and **scope by `user_id` by hand**. Every one of them must.

**An `item` is a physical garment; a `listing` is one item on one channel.** Marketplace
vocabulary never leaks into `items`. Don't collapse it.

**`external_listings` and `messages` are separate from `listings`.** A `listing` is
something Flock created. An external listing or message is something we *found* on a
marketplace — it may predate Flock and may never match an item. `item_id` starts null
and matching is a separate step, because a wrong auto-match silently corrupts the
net-proceeds maths.

**Money is `numeric(10,2)`, never float.** PostgREST can return numerics as strings, so
`lib/data.ts` coerces with `num()`.

**Fee rules are data, not code** — `lib/fees.ts`. Every channel is still marked
`verifiedOn: "unverified"`; the rates were written from memory of public fee pages. Every
net figure in the app is only as honest as that table.

**Three prices, and they mean different things.** `cost_basis` is what you paid,
`list_price` what you're asking, `floor_price` what you'd actually take. The floor is what
offers in the Inbox are judged against.

## The extension

**It never submits a listing.** It fills the form and stops; the seller clicks. That's the
honest boundary when it's someone else's marketplace account, and a listing originating
from their real browser and IP is far less likely to be flagged than one from a server.
Do not move this automation server-side.

**Never auto-submit Mercari.** Its form carries `g-recaptcha-response` — invisible
reCAPTCHA v3, which scores behaviour. A person clicking List passes; a script clicking it
is the pattern being scored. `fill-mercari.js` ignores `autoSubmit` by design.

**Identity fields take an exact match or nothing — and CATEGORY is one of them.**

This has now gone wrong three times, each time in a field I had not yet thought of
as an identity field:

- `"alo"` prefix-matched **Aloye** and put a stranger's brand on a live listing.
- `"Tops"` substring-matched **Crop Tops** on Grailed and filed a pullover under it.
- `"Tops"` substring-matched **Crop tops** on Depop — which builds the listing
  TITLE from the category, so a men's XL tee went public as "Oakley Men's
  Navy and Black Crop-top".

The rule, stated once: **if a buyer can see the field, match it exactly or leave
it.** Never `includes()`, never `startsWith()`, and never "take the first option"
as a fallback. Match from the garment's own words through a map of the
marketplace's real option names, and report a miss. A blank field is a form the
seller finishes; a wrong one is a public listing describing something they do not
own. Loose matching once put the brand
"Aloye" on a live Alo listing, because "alo" prefix-matches "aloye". A wrong brand is
worse than a blank one. `combo(..., { exact: true })` exists for this.

**Wait for the form, not a timer.** Marketplaces are SPAs whose mount time varies by
seconds. `background.js` polls `READY[channel]` until the form exists. A fixed delay was
the cause of fills that opened a tab and silently did nothing.

**Category, size, brand and condition often only render after a category is chosen** —
Depop, Vinted and Grailed all do this. Set category, wait, then re-scan. Querying up front
is what put listings in Depop's Incomplete drafts.

**All selectors live in `extension/SELECTORS.md`**, read off live signed-in pages with the
date taken. Anything added there should come from an actual DOM read, never a guess.

## Photos

The browser uploads straight to Supabase Storage under `{user_id}/inbox/{uuid}.ext`; the
bucket policy checks that first path segment against `auth.uid()`. On identification the
object moves to `{user_id}/{item_id}/`. The bucket is private — images are served through
short-lived signed URLs (`signPhotos()`), never public links.

The inbox for photos is a query (`photos where item_id is null`), not a folder. It lives
at **/add**; **/inbox** is buyer messages.

## Migrations

`supabase/migrations/*.sql`, applied in filename order by `scripts/migrate.mjs`, each in a
transaction, tracked in `schema_migrations`. Additive only — write a new file, never edit
an applied one. Postgres won't let a new enum value be *used* in the transaction that
creates it, so adding a channel is its own migration.

## State as of 17 Aug 2026

Working end to end: Google sign-in, photo upload, identification, review, listing copy for
five channels, one-click fill from the inventory row, and a published Depop listing.

- **Depop** — fill works; a real listing went live through it
- **Vinted, Grailed** — selectors verified against the live forms, **never run end to end**
- **Mercari** — fill-only. Its sell form rendered on first visit and served an empty
  document on every visit after; unproven whether that's mitigation or coincidence
- **eBay** — copy generated, no API integration; developer account was pending approval
- **Messages** — Depop reader written, **never run**. Nothing reads the other channels

Known gaps, roughly in order of how much they'd hurt:

- `channel_accounts` stores OAuth tokens in plaintext. **Encrypt before anyone but the
  owner connects an account.**
- Every fee rate is unverified, and the whole dashboard is built on them.
- Depop category matching picks the first plausible option, which put a women's Alo
  pullover under Men's. Needs a real category map.
- Message bodies are read as leaf text nodes; Depop's bubbles have no stable hook. The
  product link and thread ids are solid, the body text is not.
- Nothing scrapes `external_listings` yet, so the "everything live everywhere" view has a
  schema and an API but no collector.

## Where this is going

- Sold-comps pricing, so the price band stops being judgement.
- eBay via its real API once approved; Etsy and Shopify also have real APIs.
- Poshmark, and readers for the other channels' messages.
