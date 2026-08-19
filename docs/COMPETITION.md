# The category, scanned — and Flock's build order

Nine competitors' live sites read on 2026-08-19 (7 reachable), cross-checked
against the research sheet. Marketplace fees verified the same day from official
pages — those corrections are already applied in `lib/fees.ts`.

## Table stakes Flock lacks, ranked by how hard the category leads with them

1. **Auto-delist / sale detection** — 7 of 7 have it; 4 lead their homepage
   with it. Double-selling is the horror story that keeps sellers off
   cross-listers, and every rival's marketing says so. *Smallest real version:*
   the extension already captures listing URLs; Depop and Vinted expose sold
   state on the public page. A `chrome.alarms` poll every ~15 minutes → POST
   `/api/ext/sale-detected` → item marked sold with real net → a red "still
   live on: …" banner with one-click links to each channel's edit page. The
   human-confirmed delist matches the fills-never-submits boundary; full
   automation can follow per channel.
2. **Poshmark and eBay coverage** — the first two logos on every competitor
   homepage; Flock writes copy for both and drives neither. Poshmark is the
   proven extension pattern. eBay is the real API — and the only API-grade
   sale detection available in the whole channel set, which makes it feature
   #1's best data source too.
3. **Bulk import** — all 7. This is onboarding: a new seller has 200 listings
   on Depop already, and without import Flock's first-run is "re-photograph
   your closet." The Depop reader exists with no UI; imports become
   `external_listings`, matching stays a separate confirmable step.
4. **Stale-listing refresh / relist** — 4 of 7. Age flag + relist button once
   delist machinery exists.
5. **Templates / listing defaults** — shipping policy, condition boilerplate,
   per-channel footer. A `user_defaults` row merged into the generator.
6. **CSV export** — half a day, and the export is fee-adjusted, which
   competitors' are not. Already promised as "in build" on /pricing.
7. Background removal, offers automation, mobile app — see do-not-build.

## Where Flock is ahead

- **Honest pricing.** The category runs $29.99–$99+ with AI add-ons, credit
  meters, and auto-delist gated at $99 (List Perfectly). Flock: $0/12/29, AI
  included. The moment AI gets metered, this wedge is gone — never add credits.
- **Verified, sourced, dated fees.** No competitor answers "where does this
  item net most?" with sourced numbers. After the 2026-08-19 corrections the
  answers *changed*: Depop US is 0% commission (was modelled at 10%), Mercari
  has no seller processing, Grailed under $120 is 6% not 9%. Show the
  verified-on date in the UI; rivals can't copy that without admitting their
  numbers are undated.
- **The custody model.** Nobody else models consignment at all.
- **Per-channel voice copy** — everyone else blasts one description everywhere.
- **"Refuses to guess."** Exact-match-or-blank identity fields, no Fill button
  without a filler, "in build" labels on the pricing page. Surfaced as UI, the
  blanks read as integrity.
- **Human-click publishing = account safety.** Cloud automation from
  datacenter IPs is what marketplaces flag; Flock fills in the seller's own
  browser. Say it out loud in marketing — it reframes the boundary as the
  safety feature it is.

## Build order

1. Sale detection + delist queue (days — the category's headline feature)
2. eBay API listing + order webhooks (unblocks on the developer account appeal)
3. Poshmark filler (proven pattern; read the DOM first, never guess)
4. Depop bulk import UI (reader exists)
5. CSV export (half a day; removes an "in build" label)
6. Stale-listing flag + relist
7. Listing defaults/templates
8. Offers automation (schema exists; category treats it as premium)
9. Facebook filler (needs a signed-in session to read the form)
10. Comparison table on /pricing with competitors' gated-feature fine print

## Do-not-build

- **Cloud automation bots** (Poshmark share/follow) — the account-risk profile
  contradicts the safety wedge, and marketplaces actively hunt it.
- **Mobile app** — 2 of 7 have one; /post/[id] already covers phone listing.
  Revisit at real scale.
- **Background removal** — buy (PhotoRoom API) if ever; two rivals meter it,
  which makes it an upsell trap, not a stake.
- **Credit-metered AI** — the entire honest-pricing wedge dies with it.
- **A reseller marketplace of our own** (Flyp's model) — different business.

## Watch list

- **Flyp** at $9 flat with a 100-day no-card trial is the price threat.
- **FlowLister's sold-comp pricing** is the best idea in the set: prices from
  real eBay sold comps rather than vibes. Once eBay API access lands, Flock can
  do this with the same data. Their ProofPack (return-defence evidence packs)
  is the second idea worth stealing eventually.
- **List Perfectly's Listing Party** is a genuine community moat — not
  copyable, worth knowing about.
