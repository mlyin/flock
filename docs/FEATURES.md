# Threader — feature plan

Synthesised from the *Threader* group chat (Matthew, Bryan Yan, Finn Gormely, 17 Aug 2026)
and reconciled against what the repo actually does today.

Two things to keep straight while reading:

- **Agreed in chat ≠ built.** The chat settled on Poshmark as an MVP channel; there is no
  Poshmark filler in the repo. Those gaps are called out explicitly.
- **The named MVP was:** cross-list on desktop + web for 4 platforms, fee-adjusted desired
  net revenue per product, and a joint integrated messaging system. Finn then narrowed the
  channel list to **Depop + Poshmark + Grailed**, with Vinted, eBay and Etsy after.

---

## Where the build actually is

| Channel | In repo | Reality |
|---|---|---|
| **Depop** | Filler, message reader | Fill works; a real listing went live. Reader written, never run |
| **Vinted** | Filler | Selectors verified on the live form, never run end to end |
| **Grailed** | Filler | Selectors verified on the live form, never run end to end |
| **Mercari** | Filler | Fill-only by design — invisible reCAPTCHA v3 scores script clicks |
| **eBay** | Listing copy only | No API. Developer approval was pending |
| **Poshmark** | **Nothing** | Agreed as MVP in chat, not started |
| **Etsy** | Nothing | Finn flagged it as the interesting 5th (seller app + normal Etsy differ) |

Also built and not in the chat: photo intake → AI identification → review, SKUs, cost basis
/ list price / floor price, fee-adjusted net projections per channel, a shared inbox schema,
ship-from address book, and the paired Chrome extension.

---

## MVP — what ships before anything else

### M1. Poshmark filler  ← *biggest gap vs. what was agreed*
The chat converged on "depop Poshmark Grailed for now" and Poshmark doesn't exist yet.
Selectors read off the live sell form, same pattern as the others, into `SELECTORS.md`.

### M2. Run Vinted and Grailed end to end
Both have verified selectors and have **never posted a real listing**. Until one does,
"three channels" is one channel and two hypotheses.

### M3. Desired net revenue per product, fee-adjusted
Explicitly in the named MVP, and the sharpest thing in the whole plan. The seller enters
*what they want to walk away with*; Threader back-computes the asking price on each
channel from that channel's fee schedule and postage. Nobody else leads with this.

Blocker: **every fee rate in `lib/fees.ts` is marked `unverified`** — written from memory
of public fee pages. This feature is a liability until each rate is checked against a real
payout. Verify Depop, Poshmark and Grailed first.

### M4. Joint integrated messaging inbox
Third item in the named MVP. Schema and API exist; the Depop reader has never run and
nothing reads the other channels. Also: message bodies are currently scraped as leaf text
nodes and are **not reliable** — thread ids and product links are solid, body text is not.

### M5. Floor price answers offers
Already modelled. The floor is what Inbox offers get judged against — that's the hook the
auto-negotiator later plugs into.

### M6. AI description generation, multi-photo, concise output
Bryan: *"Wb description tho"* → already added. Bryan: *"Think ai needs to be primed to be
concise"* → prompt work, not a feature. Multiple pictures already supported.

### M7. Encrypt `channel_accounts`
OAuth tokens are stored in plaintext. This must land **before anyone but the owner connects
an account** — it is the one item here that is a genuine liability rather than a gap.

---

## Post-MVP — in the order the chat justified them

### P1. Mass listing from one photo of a pile  ← *the highest-leverage idea in the thread*
> Finn: *"Like take a photo of a pile of clothes and it can list them all?"*
> Matthew: *"lay out 10 clothes on bed and take photo, flip them all over take another photo"*
> Finn: *"That's the most effort time consuming part"* … *"that's why vendoo is still so inefficient"*

Segment one photo into N garments, pair front/back shots, produce N draft items. Needs
image recognition + cropping. Matthew's own caveat stands: *"does get expensive from
frontier model API request side"* — so batch, downscale, and cache by image hash.

This is the demo that sells the product and the thing incumbents structurally don't do.

### P2. AI auto-negotiator / auto-responder
> Bryan: *"do you guys want to have ai agents auto negotiate / bargain with buyers"* → *"Yes."*
> Matthew: *"settings of how desperate you are to liquidate and params you can toggle"*
> Bryan: *"Presuming w anchoring taken into acct yeah"*
> Finn: *"have a set lowest price automatic seller buyer exchange tho until y reach it"*

Sits on top of M4 + M5. Needs: desperation dial, anchoring, a hard floor it may never
breach, and per-item opt-in. Do not ship it auto-sending before the message reader is
trustworthy — right now the body text isn't.

### P3. Photo → price / platform / brand inference, user approves
> Matthew: *"take photo -> recommend a price, platform, brand … that we can just let the user approve"*

Identification already exists. The missing half is **which channel to list on** and **what
to price at**, which needs P6.

### P4. Quick liquidation mode
A single toggle that drops asks toward the floor, widens channels, and makes the negotiator
concede faster. Cheap to build once P2 exists, and it's a strong story.

### P5. Voice input (Wispr Flow style)
> Matthew: *"Planning on also supporting TTS like wispr flow technology"* → Bryan: *"Ohhhh for the plebs who cant type like we can"*

Speech-to-text while photographing. Route each clause to the right field rather than dumping
a transcript into the description.

### P6. Sold-comps pricing
So the price band stops being judgement. Also unblocks P3 and the negotiator's sense of
what an offer is actually worth.

### P7. Auto-send offers to likers / auto-messages
> Finn: *"auto send offers auto messages"*, *"Depop also has and Poshmark"*

Copy the native mechanic. Threader's version wins by running across all channels at once.

### P8. Multi-account management, Meta Business Suite style
> Finn: *"specific page management feature like copy it from meta business suite"* … *"auto managers of the acct for each site"*

One Threader login managing several seller accounts per marketplace.

### P9. Full back-office — never open Depop again
> Matthew: *"end state for someone never have to log in to depop again after account creation, e.g. label generation and invoice generation and pay analytics are all in this platform"*

Shipping labels, invoices, payout analytics. This is the retention story, not an acquisition one.

### P10. Assisted account creation at signup
> Matthew: *"auto delegate the platform to create all of the accounts"* … *"list on all 10 platforms within a min of signing up"*

Flagged deliberately: automating account *creation* is a materially different risk from
filling a form in a seller's own browser. Marketplace ToS generally prohibit automated
registration, and it's the fastest route to bulk bans. Recommend a **guided** flow — deep
links, prefilled details, human completes each signup — rather than headless creation.

### P11. Self-healing selectors
> Matthew: *"Will require quite a bit of maintenance as sites quite often change their UI and javascript"* … *"figure out how to dynamically debug this with agents later"*

An agent that re-reads a broken sell form and proposes a `SELECTORS.md` diff. This is what
makes a 5-channel product maintainable by one person.

---

## Positioning

Not "another crosslister". The chat kept circling two things nobody else does:

1. **You tell it what you want to net; it prices every channel backwards from that.**
2. **You photograph a pile, not a garment.**

Everything else — inbox, negotiator, liquidation mode — hangs off those.

## Audience

Wider than resellers, which the chat settled on directly:

> Matthew: *"Doesnt have to target only resellers, also people that have inventory sitting for years"*
> Finn: *"I can make all my friends with too many clothes mass list"*
> Matthew: *"literally anyone that wants to sell clothes"*

Bryan's counterpoint is the one to keep honest about: *"Fair marketplace volume drives tho"* —
casual closet-clearers list once and leave. Resellers are the revenue; casuals are the
virality. Price and message to resellers, build the onboarding for casuals.

## Distribution

Bryan: *"Distribution imo is most cooked"* and *"idk if we have network into reselling"*.
Agreed channels: YouTube, TikTok, Instagram, word of mouth, plus a referral program.
Split from the chat: Matthew builds; Bryan and Finn take marketing, GTM, customer
acquisition and organic virality. Bryan on fundraising: *"I can close any VC"*.

## Open questions the chat never resolved

1. **Which three channels, finally?** "Depop Poshmark Grailed" was the last word, but
   Vinted and Mercari are already further along in code than Poshmark. Cheapest path to a
   real three-channel demo is Depop + Vinted + Grailed; the agreed path needs Poshmark built.
2. **Pricing.** Never discussed. Nothing in the app charges anyone.
3. **eBay.** Approval was pending — did it land? It changes whether eBay is an API
   integration or another filler.
4. **Does the extension survive the Chrome Web Store review?** Privacy policy is done; the
   listing copy and assets exist. Not submitted as far as the repo shows.

---

## Later ideas — from the 17 Aug chat with Finn

Captured so they aren't lost. Ordered by how strongly the thread argued for them,
not by ease.

### L1. Auto-delist when it sells on one channel  ← *the one that got an unqualified yes*
> Finn: *"Auto delisting when its sold on one"* → Matthew: *"Yep I think this is very important"*

The classic cross-lister failure is selling the same garment twice. Threader already
knows an item is one physical thing across N listings, so it has the model for this;
what's missing is knowing a sale happened, which needs the same per-channel polling the
offers queue needs. Build it directly after the sync readers.

### L2. Shipping — forward the marketplace's own labels (MVP), revisit later
> Finn: *"We should have seller pay shipping our own shipping label QR code generator"* … *"We wanna offer more than them not rely on them"*
> Matthew: *"For MVP stage I am going to rely on the existing architecture for label generation and just forward the labels from the websites"* … *"Don't want to deal with piratesihp + shippo label auto generation for now"*

**Decided for MVP: forward the labels the marketplaces already generate.** Own-label
generation via Pirate Ship or Shippo is a real integration and was explicitly deferred.
Worth revisiting because Finn's point stands — relying on their labels caps what Threader
can offer. Note also Finn's observation that Depop runs shipping promotions roughly
monthly, which would undercut a paid own-label flow.

### L3. One shipping hub for all marketplaces
> Finn: *"Like one shipping hub"* … *"For all marketplaces"*

The natural home for L2 once labels are handled in-app. Pairs with P9 (never open Depop
again).

### L4. Smart pricing from live comps
> Finn: *"Smart pricing like it finds what its selling for on other platforms"* → Matthew: *"This might be kind of hard for an mvp"*

Same feature as P6 (sold-comps pricing), arrived at independently — which is a decent
signal it matters. Explicitly judged too hard for MVP.

### L5. Auto re-list / refresh for SEO
> Finn: *"Auto re - list / re fresh? For SEO"* → Matthew: *"Like delete and re list functionality?"*

Most of these marketplaces rank by recency, so sellers delete and relist to climb the
feed. Automating it is genuinely valuable and genuinely risky — it's also the behaviour
platforms rate-limit. Needs a per-channel view on what's tolerated.

### L6. Bulk discounts and sales across every channel
> Finn: *"Bulk discounts discounts and sales across all"*

Runs on top of the existing bulk price-drop idea; the differentiator is doing it
everywhere at once.

### L7. Expense tracker / seller stats
> Finn: *"Expense tracker depop lets u see ur stats"*

Threader already holds cost basis, fees and net — this is mostly surfacing what's there,
plus non-COGS expenses (supplies, postage, mileage). Feeds the tax-season wedge.

### L8. AI trend prediction — what to buy
> Finn: *"AI trend prediction like tells u what to buy?"* → Matthew: *"this has to come much later I think"*

Sourcing intelligence rather than selling. Deferred by agreement, and it needs a corpus
of sold data Threader won't have for a while.

---

## Architecture question: could this run off the seller's machine?

Asked 18 Aug 2026 — *"some virtual agent managing this so we don't have to run it on our
main computer, and the VM is provisioned per user."*

**Yes, it's buildable, and it's the only way to get true one-click-lists-everywhere.** A
browser extension can only drive tabs on the machine it's installed on, while that machine
is awake. Everything below is the honest trade.

### The shape of it

A per-user headful Chromium in a container — Browserbase, Steel, Kernel, or self-hosted
Playwright behind Xvfb. Threader stores that user's marketplace session cookies, hydrates
the container, drives the sell forms, and tears it down. Sessions hibernate between jobs so
you're not paying for idle browsers.

### What it buys

- One button genuinely fans out to N marketplaces **in parallel**, in seconds.
- Works with the laptop shut. Polling for offers, messages and sold-status becomes a cron
  job rather than something that depends on the seller having Chrome open.
- No extension install, which removes the single biggest onboarding drop-off — and the
  Chrome Web Store review entirely.

### What it costs

1. **Credential custody is the real one.** Today Threader never holds marketplace
   credentials; the seller's own browser does. Moving server-side means holding session
   cookies for every user — a breach becomes mass account takeover across five
   marketplaces. That changes the security posture from "modest" to "we are now a
   credentials company", with the encryption, rotation, audit and insurance that implies.
   The `channel_accounts` plaintext-token gap would have to be closed first, not later.
2. **Detection gets much harder.** Datacenter IPs, fresh browser fingerprints and
   server-timed interactions are precisely what Cloudflare, DataDome and reCAPTCHA v3
   score. Mercari's form already carries invisible reCAPTCHA, and its sell page has served
   an empty document on repeat visits. Mitigating means per-user residential proxies —
   more cost, and its own legal texture.
3. **ToS.** A seller automating their own browser is a grey area sellers themselves take
   on. Threader running automation from its own infrastructure, holding their credentials,
   is a much clearer violation and puts the liability on Threader rather than the user.
4. **Cost per user.** A warm browser is cents per hour but users are many and listings are
   bursty; this is a real per-seat COGS line that the current architecture simply doesn't
   have.
5. **Re-auth.** Sessions expire and 2FA challenges land. Something has to pull the user
   back in, and that flow is the least fun part of the build.

### Recommended path

- **Keep writes in the seller's browser for now.** Listing is the risky, ban-prone action,
  and it's the one where "a real person clicked it from their own IP" is doing genuine work.
- **Move reads to the cloud first.** Polling messages, offers and sold-status is lower risk
  than posting, is what unlocks auto-delist (L1) and the offers queue, and it's the part
  that most needs to run while the laptop is shut. Same cookie-custody problem, so encrypt
  first — but a smaller blast radius and no bot-detected *writes*.
- **Use real APIs wherever they exist.** eBay has one and Etsy and Shopify do too. Those
  should never touch a browser, cloud or local. Every channel moved onto an API is one
  fewer that needs any of this.
- **Revisit full cloud posting** once there's revenue to justify residential proxies and a
  security posture worth the name.

The honest summary: the extension is the *right* architecture for a product with no users
and one engineer, and the *wrong* one for a product with ten thousand. Don't rebuild it
yet — but assume it gets rebuilt, and keep the fillers as pure DOM functions so they port
to Playwright with minimal change. They already are.
