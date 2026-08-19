# Channels — what's in, what's next, and why

One row per marketplace, with the honest state. A channel being "supported"
means different things depending on how the site lets you write to it, so the
access model is the first column, not an afterthought.

## Access models

| Model | Meaning |
|---|---|
| `api` | A real listing API. No browser needed, nothing to break when a page changes. |
| `extension` | No API. Flock fills the sell form in your own browser; you review and publish. |
| `manual` | Automation is the wrong tool — there's no form to fill, or the site actively blocks it. Flock still tracks the item, projects the payout and writes the copy. |

## Where each channel stands

| Channel | Access | Fill | Verified end to end |
|---|---|---|---|
| **Depop** | extension | ✅ | ✅ real listing published |
| **Grailed** | extension | ✅ | ✅ 8 fields; designer needs typing (see below) |
| **Vinted** | extension | ✅ | ⚠️ account verified, fill not yet confirmed |
| **Mercari** | extension | fill-only | ❌ served an empty document to automated tabs |
| **eBay** | api | copy only | ❌ developer approval pending |
| **Poshmark** | extension | ❌ not built | — |
| **Facebook Marketplace** | extension | ❌ selectors unread | — |
| **The RealReal** | manual | n/a by design | — |

### Grailed's designer field
`#designer-autocomplete` reverts any scripted value synchronously. Real
keystrokes work, script never does. Not a bug to fix — every Grailed listing
takes one typed field from the seller, and the filler names the exact string.
Full detail in `extension/SELECTORS.md`.

### Facebook Marketplace
In the data model and the fee table; the filler is blocked on reading the live
form, which needs a signed-in session. Two things to know going in:

- Meta's automation detection is aggressive. Expect this to behave more like
  Mercari than like Depop.
- A Marketplace listing settles as **local pickup** (no fee) or **shipped**
  (fee). The same listing can go either way, so a projected net is a guess about
  how it sells, not a property of the channel. Modelled as shipped — the worse
  case — so the number is never optimistic.

### The RealReal — consignment, and what that changes
Read live on 18 Aug 2026: there is no per-item listing form. The Sell flow is a
lead capture that starts a consignment conversation, after which you ship the
item and they photograph, authenticate, price and list it. The dashboard also
returns "Access to this page has been denied" to an automated tab.

The consequence worth designing around isn't the missing form, it's **custody**.
Every other channel is non-exclusive: list the same jacket in six places and the
first buyer wins. A consigned item is physically in someone else's warehouse —
listing it elsewhere is an oversell that surfaces when a Depop buyer pays for
something you can't post. Hence `items.custody` (`hand` / `consigned` /
`returned`) in migration 0011, and why a consigned item must not be offered for
listing anywhere else.

Second consequence: **you don't set the price**, so "what do I net at my ask" is
the wrong question. `projectedPayout()` returns a band, not a figure, because
the commission tier alone moves the answer by more than the band's width.

⚠️ Its commission rate in `lib/fees.ts` is a placeholder standing in for the
lowest ordinary tier. The real schedule is tiered by category and by trailing
annual sales, with different terms again for fine jewellery and watches. Verify
against a real payout statement before showing anyone a net.

---

## Later

### B-Stock
Wholesale liquidation — pallets and truckloads of returned or overstock
inventory, sold to businesses by auction. Requested 18 Aug 2026.

Structurally the furthest thing from the rest of this list, and worth being
clear-eyed about before building:

- **The unit isn't an item, it's a lot.** Flock's whole model is "an item is a
  physical garment". A B-Stock listing is a manifest of hundreds of them. That's
  a new noun, not a new channel, and it touches the data model far more deeply
  than adding a sixth filler did.
- **It's auction-based**, so there's no ask price to fee-adjust — the closing
  bid decides. `projectedNet` doesn't apply as written.
- **It's B2B.** Most B-Stock marketplaces gate sellers behind business
  verification, and buyers need resale certificates.

Where it genuinely fits: as the **exit for what doesn't sell**. An item that's
sat unsold across six channels for months is dead capital, and bundling the tail
of the inventory into a lot is the honest end of that story. That makes B-Stock
a natural companion to the aged-inventory view rather than another chip on the
item page.

Revisit once the six retail channels are actually verified end to end.

### StockX and GOAT
Requested 18 Aug 2026. Both are a **third access shape** the model doesn't have
yet, and it's worth naming before building either.

Every channel so far takes a listing you *wrote*: a title, a description, your
photos. StockX and GOAT take neither. They're **catalog-matched**: you find the
exact product already in their database — by style code, colourway and size —
and place an **ask** against it. There is no copy to generate, no photos to
upload for a deadstock pair, and no category cascade. The entire listing is
`(catalog SKU, size, condition, ask)`.

That inverts what Flock does well. The hard part stops being "write six versions
of this description" and becomes **"which catalog entry is this, exactly"** —
and getting it wrong isn't a cosmetic error, it's shipping the wrong shoe to an
authenticator.

They also take custody, but differently from The RealReal: you ship *after* a
sale, to them, for authentication, and they forward it to the buyer. So the item
is in your closet while listed (unlike consignment) but the sale isn't final
until someone else has inspected it. `items.custody` covers the warehouse case;
this needs an in-authentication state, which is not the same thing.

Practical notes for whoever picks this up:

- **Style code is the join key.** Without it there's no reliable match, and it's
  usually printed on the shoe's inner label — a photo Flock doesn't currently
  ask for. Intake needs a new photo role before this can work.
- **Sneakers first, apparel second.** StockX has expanded into apparel, but the
  catalog depth and the buyer base are still sneaker-led. A closet of Alo and
  Depop clothing is largely out of scope for both.
- **Condition is mostly binary.** These marketplaces are built around deadstock;
  used goods are a secondary flow with different rules. The four-value
  `item_condition` enum doesn't map cleanly.
- **You set the ask, so `projectedNet` applies** — unlike consignment. Fee
  structures differ (StockX takes a transaction fee plus payment processing,
  GOAT a commission plus cash-out fee), and both vary by seller level and
  region. Verify before showing a number, same as everything else in
  `lib/fees.ts`.

Worth doing when the inventory actually contains sneakers. Doing it for a closet
of pullovers would be building a catalog matcher with nothing to match.

### ThredUp
Requested 18 Aug 2026. **Consignment, like The RealReal** — you request a Clean Out Kit,
post a bag of clothes, and ThredUp photographs, prices and lists whatever it accepts.
There is no per-item sell form, so there is nothing for a filler to fill.

Everything already built for The RealReal applies: `items.custody` marks the garment as
gone so no other channel offers to list it, `projectedPayout()` gives a band rather than
a figure because you don't set the price, and the intake copy reads as a condition report.

Two differences worth knowing before building it:

- **It rejects a lot, and keeps some of it.** ThredUp accepts a fraction of what's sent
  and, depending on the option chosen, doesn't return the rest. So custody needs a
  `rejected` outcome that isn't `returned` — the item may simply be gone, and an
  inventory that still shows it is wrong in a way that matters at tax time.
- **The payout is per accepted item, not per bag.** A bag maps to many items with
  different outcomes, so reconciliation is item-level against a payout statement.

Best done after The RealReal has been through one real consignment cycle, since the two
share a model and TRR is already wired in.

### Also queued
- **Poshmark** — agreed as an MVP channel in the group chat, still not built.
  Renders fine for automated tabs, so its DOM can be read properly first time.
- **Etsy** — blocked: no shop exists on the account.
- **Shopify** — real API, worth doing when there's a reason to.
- **Whatnot** — live auction, so a different interaction model again.

## Correction log

**19 Aug 2026 — The RealReal has a per-item form.** This document and
`lib/fees.ts` both said it had none and that its Sell flow was a lead capture.
That was wrong, and wrong because the funnel was read one screen too early:
Sell -> Ship to Us -> START lands on `/sell-trr/packing-list`, a real per-item
form (Category, Designer, Item Type, Add Item, repeated per piece) that loads
fine in an automated tab. It is still consignment — no price, no photos, no
copy, because they write all of it — so what Flock fills is a manifest, not a
listing. `extension/fill-therealreal.js` exists as of that date. The separate
note about the seller *dashboard* refusing automated tabs still stands; that is
a different page.

**19 Aug 2026 — StockX's ask form has never been read.** `/sell/{slug}
?defaultAsk=true` redirects to `/selling/onboarding` until the seller account
has a payment method and a verified identity. No filler exists and none should
be written from memory. What shipped is a style-code catalog search, which
narrows but does not uniquely identify: a real style code cut 1000 results to 8
with a near-duplicate sibling second.

**19 Aug 2026 — Vestiaire Collective added.** Marketplace, not consignment: the
seller sets the price. 12% of item price with a $10 floor and a $2,000 cap, plus
3% (min $3) processing, both seller-paid. Buyer Protection and the $15
authentication fee are BUYER-paid. The five-band 25/20/18/15/12 schedule that
circulates on blogs is not Vestiaire's and their own page contradicts it.
