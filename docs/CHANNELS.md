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

### Also queued
- **Poshmark** — agreed as an MVP channel in the group chat, still not built.
  Renders fine for automated tabs, so its DOM can be read properly first time.
- **Etsy** — blocked: no shop exists on the account.
- **Shopify** — real API, worth doing when there's a reason to.
- **Whatnot** — live auction, so a different interaction model again.
