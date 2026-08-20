# SellRaze, read against Flock — 20 Aug 2026

Full analysis with the gap matrix:
https://claude.ai/code/artifact/a2525e58-160d-4293-af4b-eddb696e2c76

Three research passes (their site, both app stores, seller communities). Three more —
dashboard walkthroughs, press comparisons, posting mechanics — hit a rate limit, so the
feature counts below are a floor.

## Who they are

Mobile-first cross-lister. YC F25, ~$500K seed, 6–11 people, founded 2023 by Jeff Mao
(ex-sneaker reseller) and Tyler Ma. ~750K downloads. iOS 4.8 from 38K ratings — but 3.2
across the 498 people who wrote something, because onboarding asks for a rating before you
have used the product.

Marketplaces: eBay, Poshmark, Depop, Mercari, Facebook Marketplace confirmed; users also
report Grailed, Vinted, WhatNot, Amazon.

## What they have that Flock doesn't

1. **Market-scan pricing** — comps across marketplaces returning what to pay, what to sell
   for, and which channel is likeliest to move it. Their strongest feature.
2. **Shipping labels + free USPS pickup** — the most-praised thing in their reviews.
3. **Import existing listings** (eBay, Depop, OfferUp) — onboarding. Without it, first-run
   is "re-photograph your closet."
4. **Bulk create** — Flock has bulk price drops; bulk create is the missing half.
5. **Barcode / ASIN / SKU input** — matters for retail arbitrage, not for secondhand
   clothing where nothing has a code. Low priority for Flock's seller.
6. **Native mobile app** — a real moat for sourcing in a shop.
7. Listing templates (shipped in Flock on 20 Aug), changelog, leaderboards, referrals,
   their own video marketplace.

## Where Flock is ahead

- **Fee-adjusted net, and the inverse.** "What do I list at to walk away with $X" answered
  per channel by inverting a piecewise fee curve. Nobody else does this.
- **Verified, sourced, dated fee rates.** Theirs are invisible.
- **Offer judgement in net terms**, showing the arithmetic. Theirs is announced, not built.
- **Honest identification** — Flock flags what it can't read rather than guessing.

## Their weaknesses are the positioning

Every one of these is a recurring complaint in written reviews, and a position Flock holds
by continuing to do what it already does:

- Three-day trial auto-converts with no reminder; discounts appear only when you cancel.
- Some subscriptions bill via Paddle, so they never appear in Apple's Subscriptions list
  and **cannot be cancelled there**.
- Elite advertises "Unlimited Listings"; a reviewer hit a 300 cap and got conflicting
  answers from support.
- They **paywalled the formerly-free** identify/price-check, triggering a wave of 1-stars.
- Their eBay integration **rewrites the seller's business policies** — handling time
  silently changed 3→10 days across live listings.
- Support is a Discord plus a bot that makes canned promises.

**The standing rule this implies:** the moment Flock meters AI or adds credits, the wedge
is gone. Never add credits.

## Build order

1. Finish one filler end to end. Five of seven have never completed a fill.
2. Sale detection → auto-delist. Their version misfires and it's their loudest complaint,
   so shipping one that doesn't is a differentiator, not catch-up.
3. Import an existing closet. Reader exists, needs a screen.
4. Pricing from sold comps — blocked on eBay approval, which unlocks this *and* API-grade
   sale detection.
5. Bulk create.
