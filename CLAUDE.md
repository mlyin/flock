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

**RLS is ROW level, and that is not a pedantic distinction.** It decides which
rows a role may touch, never which columns. `channel_accounts` carried a comment
claiming its tokens were "only ever read in full by the service role" while its
policy was a plain `for all using (auth.uid() = user_id)` — so any signed-in
seller, or anything running in their page, could select their own live
marketplace `refresh_token` straight out of PostgREST. Their own token, so never
a cross-tenant leak; worse in another direction, because that token acts on
their real marketplace account with no second factor. Column-level `grant
select (...)` is the mechanism RLS does not provide, and `anon` is revoked
outright there. If a table holds a credential, check its GRANTS, not just its
policy.

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

**Fee rules are data, not code** — `lib/fees.ts`. All ten channels are now verified
against the marketplace's own fee page, with the source URL and date in each note.
Nothing else counts as a source: the five-band Vestiaire schedule that circulates on
blogs is contradicted by Vestiaire's own page, and the 5%/$0.40 Facebook rate that
still saturates search results belongs to a program Meta retired in 2025.

The corrections that changed routing answers:

- **Depop** removed its 10% US selling fee in July 2024, and **Mercari** charges
  sellers no payment processing. The old table showed Depop near-worst when it is
  near-best.
- **Facebook** is 10%, not 5% — and the basis is item + shipping + *tax*, so a
  commission is charged on money the seller never receives.
- **The RealReal** is not a flat 45%. It is five category tables of price bands, and
  the band is set by that item's own price: a $99 sale keeps 20%, a $100 sale keeps
  30%. Clothing & More is what's modelled; handbags, watches, sneakers and branded
  jewellery are all better and are not.
- **StockX** raised US seller shipping from $4 to $5 on 1 March 2026, and Flex sales
  pay 2 points more at every level (not modelled).

`unverifiedChannels()` computes the honesty warning the UI shows. Don't hardcode that
sentence — it sat on three pages saying "every rate is unverified" long after six of
them had been checked.

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

This has now gone wrong four times, each time in a field I had not yet thought of
as an identity field:

- `"alo"` prefix-matched **Aloye** and put a stranger's brand on a live listing.
- `"Tops"` substring-matched **Crop Tops** on Grailed and filed a pullover under it.
- `"Maison Margiela"` sits among **MM6 Maison Margiela**, **Maison Margiela
  Fine** and **Maison Margiela x Reebok** on The RealReal — three different
  brands at three different prices — and the right row renders with a
  `MOST OBSESSED` badge on a second line, so matching the whole `textContent`
  misses it and falls through to a sibling. Match the first line only.
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

## State as of 19 Aug 2026

Working end to end: Google sign-in, photo upload, identification, review, listing copy
for six channels, one-click fill from the inventory row, and a published Depop listing.

- **Depop** — fill works; a real listing went live through it. Four bugs fixed 19 Aug
  after a real Maison Margiela failed: an 8-photo cap (we sent 11 and it kept none),
  `shoes -> "Shoes"` which is not a Depop category, three identical "Loafers" options
  distinguished only by a `MEN > FOOTWEAR` path on an ancestor, and `nwt -> "Brand new
  with tags"` against a menu that says "Brand new". EU shoe sizes now convert to
  Depop's US-only scale.
- **The RealReal** — packing-list filler written 19 Aug, **never run end to end**.
  Consignment, so it fills a manifest (category, designer, item type), not a listing.
- **Vinted, Grailed** — selectors verified against the live forms, **never run end to end**
- **Mercari** — fill-only, by design (reCAPTCHA v3)
- **StockX** — no filler and deliberately so: `/sell/{slug}` redirects to
  `/selling/onboarding` until the account has a payment method and verified identity,
  so the ask form has never been read. A style-code catalog search ships instead.
- **Vestiaire Collective** — channel and verified fees added 19 Aug; no filler, form unread
- **eBay** — copy generated, no API integration; developer account rejected
- **Offers** — the queue could never contain an offer until 19 Aug: the extension never
  sent an amount and the Depop reader's MONEY_ONLY filter binned the one bubble that
  carried it. Fixed, but **never run against a real inbox**.
- **Sales** — `recordSale` and the delist queue landed 19 Aug. Before that, `sales` and
  `fees` were read everywhere and written nowhere.

Known gaps, roughly in order of how much they'd hurt:

- `channel_accounts` still has no code — nothing writes a token yet. What it now
  has is the machinery to do it safely: `lib/secrets.ts` (AES-256-GCM under
  `CHANNEL_TOKEN_KEY`, held outside the database so a Postgres dump alone is not
  enough to act as a seller), and column-level grants. **Any OAuth callback that
  lands must call `encryptToken` — the column comments say so and nothing enforces
  it.**
- Pricing is an admitted model guess with no sold comps.
- `items.custody` has schema and no reader or writer.
- Message bodies are read as leaf text nodes; Depop's bubbles have no stable hook.
- No filler for Poshmark, Facebook, Vestiaire or StockX. Each needs its form read
  off a live signed-in page first — see the selector rule above.

Closed since this list was written: repricing live listings (all three price-write
paths now cover `draft` and `live`), bulk operations (`BulkController`),
`external_listings` and `channel_syncs` (both written by the import route).

## Where this is going

- Sold-comps pricing, so the price band stops being judgement.
- eBay via its real API once approved; Etsy and Shopify also have real APIs.
- Poshmark, and readers for the other channels' messages.

## Agents, tests, CI — how work gets done here

**Tests** (`npm test`): property sweeps for money math (lib/fees.test.ts — dense
grids across tier boundaries, because hand-picked examples never land on the
edges), real-fixture cases for parsers (lib/reconcile.test.ts pins an actual
Depop slug). Tests run without DB or network; if logic is tangled with Supabase,
extract the pure core first. The fees round-trip sweep found a real solver bug
(Vestiaire's floor/cap needed breakpoints) on its first run — keep it green.

**Simulator** (`npm run simulate`): 400 synthetic garments through askPlan on
every channel, deterministic (--seed), exit 1 on any violated invariant. `--json`
for machine consumption. This is what "run the simulations" means.

**CI** (.github/workflows/ci.yml): typecheck → tests → simulator → build, every
push and PR.

**GitHub agents** (need the `ANTHROPIC_API_KEY` repo secret):
- Mention `@claude` in an issue → an agent does the task and opens a PR
  (claude.yml; owner/member comments only).
- Every PR gets an automatic review pass prioritising money math, tenant
  isolation, and the fills-never-submits boundary (claude-review.yml).

**Project subagents** (.claude/agents/): `selector-medic` (filler repair —
never guess a selector), `fee-auditor` (verify rates against official pages
only), `test-writer`, `simulator`. Dispatch these rather than re-deriving
their disciplines.

**VPS** (Dockerfile + docker-compose.yml + deploy-vps.yml): image builds on
every main push to GHCR; the deploy job stays dormant until the `VPS_ENABLED`
repo variable is `true` and the SSH secrets exist. Vercel remains primary.
