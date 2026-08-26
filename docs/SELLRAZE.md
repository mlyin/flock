# SellRaze, read against Flock — 26 Aug 2026

Supersedes the 20 Aug version, which is kept in git history only. That one
was built from eight research passes, three of which died on a rate limit, and
it said so — its feature list was explicitly "a floor". This one re-ran those
three angles and put every claim through a reviewer whose job was to refute it.

**Read the evidence-hygiene note first.** The previous doc's failure was
evidentiary rather than analytical, and several of its most quotable lines do
not survive checking.

The 20 Aug gap list is **4 of 7 closed**, one refuted at its premise, and its
build order is 4 of 5 done. Its sentiment section should be discarded outright.

---

**Evidence hygiene first, because the last doc's failure was evidentiary, not analytical.** Three claims from the earlier research cannot be repeated externally: the permanent-eBay-ban reviews, the "deleted all my listings" review, and the long auto-delist essay are absent from every retrievable source today. Auto-delist failure is real but it is **1–2 reviews**, not a theme. SellRaze's aggregate ratings are 4.81/5 from 38,212 iOS ratings and 4.7/5 from 15.8K Android reviews — the written-review corpus (mean 3.27) is not the user base, and Trustpilot's five reviews are not evidence about a product. The `~750K downloads` figure survives only in third-party aggregator caches; the real floor is 100K+ Android installs plus an unknown iOS number.

---

## 1. Genuinely missing, ranked by how much a seller feels it

### 1. A phone that can actually list — the largest gap by a distance
SellRaze is a native app with 100K+ Android installs and 38K iOS ratings. Flock's phone story is a PWA (`public/manifest.webmanifest`, `public/sw.js`) plus `app/post/[id]/page.tsx`, which is **tap-to-copy, one field at a time, in the order the marketplace asks for them**. That is the correct design given iOS sandboxes apps so nothing can fill Depop's form there — but the seller's experience is: photograph the garment, then hand-copy eight fields into each marketplace app. SellRaze's is: photograph, tap, done.

`mobile/` holds an Expo 52 WebView shell that has **never been built or submitted**. `mobile/eas.json` still carries placeholder `appleId`/`ascAppId`/`appleTeamId`, and `mobile/package.json` contains neither `expo-camera` nor `expo-image-picker` — so the "system camera" that `mobile/README.md` offers as its App Store Guideline 4.2 defence is not implemented. Meanwhile `docs/COMPETITION.md`'s do-not-build list still reads "Mobile app — revisit at real scale." The repo argues with itself.

**Cost:** Apple Developer enrollment (24–48h) plus a real native capture surface plus review. Two to four weeks of calendar time, most of it waiting.
**Worth it?** Not yet, and the reason is that the WebView shell doesn't close the gap anyway — a WebView still can't fill Depop's form on iOS. The thing that would close it is native capture feeding the existing intake pipeline, which is a genuinely different build. **Decide, don't drift:** either commit to that build or retire `mobile/` and let the do-not-build entry win. The current half-state is the worst option because it looks like progress.

### 2. Cross-listing that has demonstrably worked on more than two channels
This is the one that should sting. `lib/fees.ts:124` declares seven fillable channels. **Two have completed a fill:** Depop (a real Maison Margiela went live, four bugs fixed afterwards) and Facebook (`extension/SELECTORS.md:283` — "Verified end to end against the live form on 21 Aug 2026", all eight fields, price rendering back as `$35` proving React processed the event). Grailed is partial — `#designer-autocomplete` reverts any scripted value synchronously, so every Grailed listing takes one typed field from the seller. eBay, The RealReal have **never been run**. Vinted is blocked at the account level (selecting a category redirects to `/users/verification`). Mercari serves automated tabs an empty shell.

`BACKLOG.md` has carried "Finish one filler end to end. Five of seven have never completed a fill" as an unchecked blocked item since the last doc. SellRaze demonstrably lists to six-plus channels — badly, with wrong categories and missing brand/size, but it lists.

**Cost:** eBay is nearly free — `extension/fill-ebay.js` was written from a live signed-in DOM read on 19 Aug and just needs running. Grailed needs a decision about the one typed field. Vinted needs an account chore, not engineering.
**Worth it?** This is the highest-value work available and it is mostly not engineering. Everything else in the product is downstream of the fill working.

### 3. Poshmark
Dated review evidence says SellRaze's Poshmark integration works ("Does the job well for posh and ebay integrations", 6 Aug 2026, v5.15) despite Poshmark being absent from their own FAQ's six named integrations. Flock has a **verified Poshmark fee rule, host permission in the manifest, generated copy — and no filler**. Poshmark is the largest US women's-clothing resale channel. `BACKLOG.md` lists it as agreed MVP in the group chat, never started, blocked on one live signed-in DOM read.

**Cost:** One afternoon reading the form, then a filler in the shape of the six that already exist.
**Worth it?** Yes, and it is the best value-per-hour item in this document. It is blocked on a chore, not on a partner, an approval, or a hard problem.

### 4. eBay that works — and this is partly not a choice
`CLAUDE.md:194` reads "eBay — copy generated, no API integration; **developer account rejected**." The first half is stale (`fill-ebay.js` is a complete four-screen filler). The second half is the buried lede: **Flock applied for eBay API access and was denied. SellRaze evidently has it.**

The evidence for SellRaze holding real eBay API access is good and independent: connecting eBay rewrites the seller's shipping and business policies account-wide (only the Sell Account API can do that), and listings created through SellRaze can't be revised via `ReviseItem`/`ReviseFixedPriceItem`, which is eBay's documented Inventory-model restriction.

So Flock's credential-free posture is a genuine seller-safety advantage **and, on the biggest channel, also a constraint**. Any external comparison that sells it as pure principle is telling the team something flattering and false.

**Cost:** Re-applying is free. Note there may be an angle: overwriting sellers' fulfillment policies to route them into a third party's shipping product is worth raising in an application.
**Worth it?** Re-apply. Meanwhile ship the extension path, which works on eBay whether or not the API ever lands.

### 5. Comps beyond eBay, and any velocity signal at all
`lib/comps.ts` is better than SellRaze's on quality — real completed sales, median with a 1.5× IQR fence, and `MIN_COMPS=8` below which it refuses to print a number. SellRaze's visible comps are retail (Amazon.com, Nike.com, Walmart.com), corroborated by a reviewer complaining the comps were "new items sold from the maker or big box stores."

But Flock's coverage is **eBay only**, reads are **per-garment and manual, one background tab at a time**, and Flock has **no velocity data whatsoever**. SellRaze shows a sell-through rate and a demand score (thinly evidenced — one review in 421 mentions STR, zero mention demand score) and answers "which channel is likeliest to move it." Flock has better fee data than anyone to answer that second question and can't, because it doesn't know how fast anything sells.

**Cost:** Bulk comp reads at intake are already the last open `BACKLOG.md` item and are cheap. Cross-marketplace sold data is a research question — eBay may be the only channel that publishes completed sales on a public page. Velocity would need Flock's own listing history, which means waiting for data.
**Worth it?** Bulk reads yes, now. Cross-marketplace comps: research first, don't commit. Velocity: it builds itself over time; don't build a synthetic version.

### 6. Shipping labels and free pickup — and the premise has collapsed
`docs/SELLRAZE.md` called this "the most-praised thing in their reviews." That is now refuted: **"pickup" and "pick up" appear in zero of 421 reviews, and only three mention shipping labels at all.** What users actually report is breakage — a stale address populating on Depop labels, "$130 gone," a broken public-meetup option, and the app defaulting shipping to $10.50 when the seller chose to handle it themselves.

Flock has nothing: a repo-wide grep for shippo/easypost/pirateship/shipengine/stamps.com returns exactly two hits, both in `docs/FEATURES.md:202,205`, where it was explicitly deferred — *"Don't want to deal with piratesihp + shippo label auto generation for now."* What exists is adjacent and doesn't add up: `items.package_size` (0006, purely so Depop and Mercari accept a listing), `sales.shipping_collected`/`shipping_cost` as typed ledger inputs, and an addresses table for the seller's own ship-from.

The structural ceiling matters too: Poshmark and Mercari issue prepaid labels deducted from payout, so an own-label flow only has room on Depop, Facebook and direct sales.

**Cost:** EasyPost (free to 3,000 labels/month, supports USPS pickups; Shippo's API pickup excludes Ground Advantage, which is what clothing resellers use) plus address and weight capture, rate-shop UI, funds handling to front postage, refund-on-unused-label. Weeks, and it introduces money custody Flock currently doesn't touch.
**Worth it? No.** This was the stale doc's #2 gap and the evidence for it has evaporated. The MVP decision in `docs/FEATURES.md` L2 — forward the marketplace's own labels — was right and should stand. Revisit only if a real Flock seller asks twice.

### 7. Bulk delist and relist — a gap against sellers' habits, not against SellRaze
Flock has bulk create (`bulkDraftListings`) and bulk price drop (`bulkDropPrices`, which never crosses a garment's `floor_price` and reports changed/floored/skipped separately). It has **no bulk delist** — `delist_tasks` is resolved one row at a time via `resolveDelistTask`, deliberately, because delisting is destructive inside someone else's account. It has **no relist of any kind**; the only thing close is `unmarkListed` (`app/actions.ts:677`), which walks one listing back to draft.

SellRaze isn't ahead here — support told an Elite subscriber that bulk cross-listing of existing listings is unavailable and each must be opened individually. And their per-month **new-listing** meter actively punishes delete-and-relist-for-recency.

**Worth it?** Bulk delist: no, and say why — that restraint is a feature. Relist: low priority, but note `lib/plan.ts:78` sells it today (see §2).

### 8. Amazon, GOAT, Whatnot, Shopify
SellRaze names Amazon and GOAT in its FAQ and shows Shopify in its logo strip; reviews confirm Whatnot use. Flock has none of these. Conversely SellRaze has **none of** Grailed, Vinted, Vestiaire Collective or The RealReal, all four of which Flock models with verified, dated fee rules. Breadth is roughly even; the split is that SellRaze leans general goods and Flock leans fashion and luxury. **That's a positioning difference, not a gap.** GOAT is the only one worth a second look, and only for sneakers.

### 9. Barcode / UPC / ASIN scanning — not worth it, unchanged
No scanner, no code reader, no retail-catalog join anywhere in Flock. The adjacent field is `style_code`, which is either read off the printed inner tag by the vision model or typed in `ReviewForm` — and never inferred, because a wrong style code ships the wrong product to an authenticator. It earns its keep twice: it short-circuits `compQuery()` because it names one exact product, and it builds a StockX catalog search link. **Correctly deprioritised.** Barcodes matter for retail arbitrage; secondhand clothing has none.

---

## 2. Closed since the last comparison

Old doc's "what they have that Flock doesn't":

| # | Old gap | Status | What closed it |
|---|---|---|---|
| 1 | Market-scan pricing | **Half closed, narrower and better** | `lib/comps.ts`, `extension/read-ebay-sold.js`, `components/CompsCard.tsx`, `supabase/migrations/0035_sold_comps.sql`. Real eBay completed sales vs their retail comps. Still eBay-only and manual. |
| 2 | Shipping labels + free pickup | **Open — and the premise refuted** | Nothing. Zero of 421 reviews mention pickup. |
| 3 | Import existing listings | **Closed for Depop** | `app/import/page.tsx`, `components/ImportClient.tsx`, `app/api/ext/import/route.ts`, `extension/read-depop-listings.js`, `lib/reconcile.ts`. Adoption is a separate confirmable step — nothing auto-matches on title. No eBay/OfferUp import. |
| 4 | Bulk create | **Closed** | `bulkDraftListings` (`app/actions.ts:1252`), `components/BulkBar.tsx`, `components/BulkController.tsx`. |
| 5 | Barcode / ASIN / SKU | **Open, deliberately** | — |
| 6 | Native mobile app | **Open** | `mobile/` exists, never built or submitted. |
| 7 | Listing templates | **Closed** | `lib/defaults.ts`, `supabase/migrations/0027_listing_defaults.sql`, `components/ListingDefaultsForm.tsx`. |
| 7 | Changelog, leaderboards, referrals, video marketplace | **Open, and mostly should stay that way** | Their referral screen and wallet are marketing mockups; their FAQ says "SellRaze does not handle payouts yet." |

Old doc's build order — **4 of 5 done**:

1. **Finish one filler end to end** — partly. Depop live, Facebook verified 21 Aug. Five of seven still unrun.
2. **Sale detection → auto-delist** — closed as *detection → question → queue*: `lib/vanished.ts`, `0028_sale_candidates.sql`, `0025_delist_queue.sql`, `recordSale`. Auto-delist deliberately absent (see §4).
3. **Import an existing closet** — closed.
4. **Pricing from sold comps, "blocked on eBay approval"** — closed by **routing around the block entirely**. eBay publishes completed sales on a public search page; `read-ebay-sold.js` reads it with no API key and no approval. The blocker turned out not to be load-bearing. This was the best call of the stretch and the pattern is worth remembering when the next thing looks blocked.
5. **Bulk create** — closed.

**Also shipped, on no list:** the Facebook filler (verified end to end), bulk price drops, the price-drift queue (`lib/drift.ts`), consignment custody (`lib/custody.ts`, `0034`), verified dated fee rates for all ten channels, and the `0032` fix for a real privilege escalation — `authenticated` held table-level UPDATE on `profiles`, so any seller could set `beta:true` from the browser and grant themselves the top tier. Verified as a live bypass with a forged JWT claim, then rolled back.

**Three docs are now stale in the other direction and should be corrected in the same pass:**

- **`lib/plan.ts` is wrong in three places, in both directions.** Under-claiming: Hogget's `"Bulk relist and price drops", soon: true` (drops shipped at `app/actions.ts:1668`) and Mutton's `"Consignment tracking", soon: true` (custody shipped in full). The pricing page publicly says Flock doesn't have features it has, against a competitor charging $20/mo for bulk listing creation. **Over-claiming, and this one is worse:** Hogget line 3 reads `{ text: "One inbox across every marketplace" }` with **no `soon` flag at all** — the inbox is Depop-only, and `background.js` throws by name for every other channel. That is a false promise on a paid tier's public feature list. Two booleans and one sentence.
- **`docs/CHANNELS.md`** is wrong in three rows: Facebook as "selectors unread" (verified end to end 21 Aug), eBay as "copy only / developer approval pending" (`fill-ebay.js` exists, eBay is in `FILLABLE`), The RealReal as "manual, n/a by design" (a filler exists; `lib/fees.ts` already corrects this).
- **`CLAUDE.md:103`** — "It never submits a listing. It fills the form and stops; the seller clicks" — and `BACKLOG.md`'s "Nothing auto-submits a marketplace form" are **both false as written**. `fill-depop.js:733`, `fill-grailed.js:503` and `fill-vinted.js:614` all submit when `autoSubmit` is set. Only Mercari genuinely ignores the flag by design. The extension's own Chrome Web Store description — "You review every listing before it goes live" — does not describe that path either.

---

## 3. Where Flock is ahead — verified in code

- **Fee inversion nobody else attempts.** `lib/fees.ts` carries ten channels with `verifiedOn` dates and source URLs, and `askForNet()` inverts a piecewise fee curve to answer "what do I list at to walk away with $X." SellRaze's counterpart is one opaque "Potential earnings $336.01" in a marketing render; **zero of 421 reviews mention fees, net, or earnings**. `/fees` computes its own honesty warning via `unverifiedChannels()` rather than hardcoding it.
  *One correction to carry forward:* `lib/fees.test.ts:112-119` asserts only `toBeGreaterThan(bare)` — no magnitude — despite a title promising "by at least that much." It would pass if an $8 label raised the ask by a penny. The capability is real; tighten the test.
- **Real sold comps vs retail comps.** Median not mean (resale has a long right tail), 1.5× IQR fence, `MIN_COMPS=8` below which it refuses to print a number, and a narrow-then-broad fallback in `CompsCard.tsx`. Their comps are new goods from Amazon and Walmart.
- **Honest identification.** `lib/inference.ts` scores per-field confidence and emits an explicit `questions[]` array, escalating Haiku→Opus only when a money-moving field is uncertain. SellRaze guesses: a reviewer sold men's-9 Vans the AI read as women's 9; another had lens smudges written into the description as "stains."
- **Sale detection that asks rather than asserts.** `lib/vanished.ts` — an empty shop read is never evidence (a scrape returning zero listings is a failed load, and treating it as evidence would flag a seller's whole closet at once), and `MISSES_BEFORE_ASKING=2`. Absence produces a question, never a state change.
- **No metering, anywhere.** `lib/plan.ts` caps **concurrent live listings** and counts a garment once however many marketplaces it sits on. Grepping credit/meter/quota/usage across `app/` and `lib/` returns only Anthropic's own out-of-credit error string. SellRaze meters **new listings per month** — 25/125/250 — and the meter miscounts (24 Aug 2026: blocked at "22 listings and one draft" against a 25 cap, support insisting the count was 25).
- **A free tier that isn't a trial.** Lamb: 5 live, forever, no card. SellRaze has no free plan.
- **Export.** `/api/export` is one row per listing with money columns **fee-adjusted from the ledger**, not sticker price — guards leading `=+-@` against Excel formula injection and emits a UTF-8 BOM so Stüssy and Arc'teryx survive. A SellRaze reviewer: "there is literally no way to manage inventory."
- **Offer judgement in net terms.** `lib/offers.ts` and `lib/negotiate.ts` score every offer through the real fee curve in arithmetic the seller can check; `lib/negotiate-reply.ts` uses the model for exactly one thing — turning the decision into a sentence, forbidden from touching the number. **The model gets no vote on money.** SellRaze's "AI-haggling" is listed under COMING SOON on their own App Store page.
- **It never touches the seller's marketplace configuration.** Connecting eBay to SellRaze rewrites shipping and business policies account-wide, and the seller repairs every listing by hand.
- **Credential-free today.** Permissions are `storage`, `scripting`, `alarms` — no `cookies`, no `webRequest`, no `declarativeNetRequest`, no upload-host permission. SellRaze's privacy policy admits holding "authorization tokens" and passwords "when a connection method expressly requires it."
  *Caveat this externally:* `channel_accounts` exists with token columns, has had two hardening migrations (0030, 0031), and `lib/secrets.ts` is a finished AES-256-GCM module imported only by its own test. This is deliberately-built infrastructure awaiting an approval, not a permanent refusal. Don't frame it as a principle Flock's own roadmap intends to break.
- **Fashion and luxury depth:** Grailed, Vinted, Vestiaire and The RealReal all have verified fee tables and SellRaze names none of them.

---

## 4. What SellRaze does badly that Flock should keep not doing

1. **Metering throughput, and metering it wrong.** New-listings-per-month punishes delete-and-relist-for-recency, which is ordinary reseller behaviour. Their counter then disagrees with the user and support can't reconcile it. The standing rule in `BACKLOG.md` — never meter the AI, never add credits — is now backed by a dated, quotable failure. **Argue the meter, not the price.**
2. **Paywalling the free hook.** They put the AI scan/identify behind a subscription around v5.8–5.9 in mid-June 2026 and roughly a quarter of recent reviews are angry about it, specifically about feeling tricked.
3. **Billing outside the platform's own rails.** Paddle rather than Apple IAP means the subscription never appears in Apple's Subscriptions list and can't be cancelled there.
4. **Shipping marketing renders as evidence of shipped features.** Their store screenshots show a Business Center with "Current Balance $7,694.20 / Withdraw" while their own FAQ says "SellRaze does not handle payouts yet," and a unified inbox their own App Store listing files under COMING SOON. The demo seller in one screenshot is the CTO's own handle. Flock's equivalent temptation is the `soon` flag — and Flock's error currently runs the *safe* direction on two lines and the *unsafe* direction on one. Fix the unsafe one first.
5. **Overwriting the seller's own settings to route them into your product.** The most defensible reading of their eBay business-policy rewriting, given they sell labels, is that it exists to force their shipping into the seller's listings.
6. **Delisting without asking.** Where it fails, the seller finds out when a buyer pays for something already sold. `lib/vanished.ts` is the correct answer and the design comment naming SellRaze should stay.
7. **Guessing instead of flagging.** Every misidentification above is a confident wrong answer where an honest "I can't read this tag" would have cost nothing.
8. **AI-only support with no escape hatch when you can't log in.** Also: a `/status` page that renders "All Systems Operational" with no per-marketplace components, so a seller can't learn a channel is down.
9. **Advertising things that don't exist.** "Authenticity check" is gated on two tiers, depicted in zero screenshots, mentioned in zero of 421 reviews, and appears in none of their own writing beyond the pricing table.

---

## 5. Build order

**1. Run the fillers that already exist.** eBay first — `fill-ebay.js` was written from a live signed-in DOM read on 19 Aug and has never been executed once. Then Grailed. Sort out Vinted's account verification, which is an errand. Skip Mercari.
*Why first:* it's the cheapest work here and it's mostly not engineering, and every other feature in the product is downstream of the fill working. Two of seven proven is the honest number and it caps what Flock can claim anywhere.
*Do this alongside:* query `fill_reports` (0024) grouped by channel. That table would settle built-vs-working with data instead of prose in `CLAUDE.md` and `SELECTORS.md`. Nobody has looked at the rows.

**2. Resolve the auto-submit contradiction — pick a direction, today.** Three docs and the Chrome Web Store description are currently false. Either rewrite them to "opt-in, off by default, never on Mercari" — a defensible boundary — or pull the auto-submit paths from `fill-depop.js`, `fill-grailed.js` and `fill-vinted.js`. `docs/COMPETITION.md`'s "human-click publishing = account safety" wedge rests on the stronger claim, so this is a positioning decision, not a doc chore.
*Why second:* it costs an hour and the downside of being found by a Chrome reviewer — or a competitor reading the bundle — is disproportionate.

**3. Fix `lib/plan.ts`, then `docs/CHANNELS.md` and `CLAUDE.md:194`.** Delete two `soon: true` flags on features that shipped, and fix or flag "One inbox across every marketplace" on a paid tier when the inbox is Depop-only.
*Why third:* the over-claim is the only outright false promise on a public paid page, and the under-claims mean Flock is publicly conceding a comparison it wins.

**4. Poshmark filler.** Read the live form, write it in the shape of the six that exist.
*Why fourth:* the largest missing channel, blocked only on a chore, with the fee rule, host permission and copy already in place. Best value-per-hour item on this list.

**5. Bulk comp reads at intake.** The last open `BACKLOG.md` item.
*Why fifth:* it converts the sharpest genuine wedge from a per-garment chore into a per-box pass, which is the difference between a feature sellers admire and one they use.

**6. The delist-queue reminder.** "You recorded this six hours ago and three listings are still up." Needs a scheduled job; web push is already wired (`0026`, `lib/push.ts`, `/api/push/subscribe`).
*Why sixth:* small, and it's the difference between a queue and a system. Sale detection is only as good as the follow-through.

**7. Mobile: commit or retire.** Either implement native capture in `mobile/` and start Apple enrollment, or delete the shell and let `docs/COMPETITION.md`'s do-not-build entry stand and invest in the PWA instead.
*Why last but not never:* it's the largest felt gap and the largest cost, and the current half-state contributes nothing while looking like progress. It's also the only item here that needs a decision more than it needs a developer.

**Deliberately not on the list:** shipping labels (premise refuted, structurally capped, explicitly deferred in `docs/FEATURES.md` L2), barcode scanning (wrong category of seller), a video feed or own marketplace (their version generated a backlash and their own blog now disowns it), bulk delist (restraint is the feature), a unified inbox beyond Depop (SellRaze hasn't shipped it either — but the pricing page must stop saying Flock has).

**One thing to start in parallel because it's free:** re-apply for eBay API access. The rejection is load-bearing and currently invisible outside one stale line of `CLAUDE.md`.