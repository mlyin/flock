# How SellRaze reaches the marketplaces, and what that means for the node — 16 Sep 2026

Companion to `docs/SELLRAZE.md` (features, 26 Aug) and `docs/NODES.md` (the
design). This one answers a narrower question: **how** SellRaze and the rest
of the category technically post to marketplaces, what Facebook Marketplace
in particular tolerates, what gets sellers banned, and what a browser node
on a VPS inherits from all that.

Built from a 129-agent sweep run on 16 Sep 2026 (253 findings, 60 put
through refutation: 9 confirmed, 51 contested, 0 refuted; then a critic pass
and a 29-finding follow-up sweep). Every claim below carries its grade.
**"Confirmed"** means a primary artifact was read (a manifest, a source file,
a spec). **"Contested"** means the claim survived a refutation attempt but
rests on a search snippet, a single review, or a second-hand note; treat it
as a lead. The sweep ran from an egress-restricted environment: SellRaze's
own site, both app stores, Reddit, eBay Community, Meta's help pages and
every marketplace's terms page were unreachable. Where that matters it is
said.

## 1. Evidence quality, first

Three things are known from primary artifacts. The rest is inference from
reviews and snippets, most of them n=1.

- SellRaze published a Chrome extension, "SellRaze Marketplace Crosslister"
  (id `boddliddenilkmjjipicghgdcdapofhi`), Manifest V3, host permissions for
  `*.facebook.com`, `upload.facebook.com`, `*.mercari.com` and
  `api.sellraze.com`; no other marketplace hosts. Version 0.1.8, last updated
  Feb 2024, 58 users in March 2024. **Confirmed** from a Chrome Web Store
  scrape [1].
- SellRaze is YC F25, a team of six, and lists "across multiple
  marketplaces, including our own". **Confirmed** from the YC directory [2].
- The iOS app (`com.sellraze.scanner`) shipped 11 Sep 2023, five months
  *before* the extension; version 5.14 in July 2026. **Confirmed** from an
  App Store dataset [3]. So the extension was a companion, not the origin
  product, and the "they pivoted from extension to app" story is wrong.

Everything about the live product reached the sweep as paraphrase. The
aggregate ratings (4.8 on iOS, 4.7 on Play with ~16.8K reviews) are
unverified but plausible, which means the negative reviews quoted below are
a search-selected minority, not the base rate.

## 2. What SellRaze does, per marketplace

| Marketplace | Best reading | Grade |
|---|---|---|
| eBay | Official API via OAuth. Six eBay Community threads describe SellRaze under "Third-Party App Access", Business Policies forced onto the account and persisting after a cancelled trial, listings that cannot be revised in Seller Hub. eBay's Inventory API spec says exactly that: listings it creates cannot be revised through Trading API or Seller Hub, and Business Policies opt-in is required [4][5]. | Contested for SellRaze; the API behaviour itself is confirmed |
| Facebook Marketplace | 2024: driven from the seller's own Chrome by the extension. 2025–26: in-app Facebook login; reviews describe re-auth loops, missing Facebook-only fields, listings vanishing after Publish. Where the post executes (phone or SellRaze's servers) is **not established** [1][6]. | Contested |
| Mercari | 2024: extension host permission. App era: one reviewer could not connect despite verifying email and phone ten times, which reads as SellRaze driving Mercari's own login. Mercari has no listing API. | Contested, n=1 |
| Depop | "Connected to your Depop account"; one UK reviewer says linking was dead for a year. Depop has a private partner API (below); whether SellRaze has it is unknown. | Contested |
| Poshmark | Advertised since 2024; a developer reply in May 2025 said support was "something we're actively working toward"; a competitor's April 2026 comparison says covered. | Contested |
| Amazon, GOAT, Whatnot, Grailed, Vinted, OfferUp, Etsy | Marketing mentions only. No user report of any of them working. | Not established |

SellRaze's own marketplace lists disagree with each other (4, 5, 8 and 20
channels on different pages), and reviewers punish advertised-but-missing
integrations in so many words.

**Password custody.** Reviews describe signing in on marketplace pages
launched inside the app and Facebook "re-authenticate" loops, which fits
session custody rather than stored passwords. No privacy-policy text could be
read. Disconnect is manual: sellers are told to email support if a
marketplace stays connected after account deletion.

**Competitive context, not a mechanism finding.** The CEO's public GitHub
carries Akamai sensor generation, Amazon Metadata1 reverse engineering and
TLS-fingerprint work, with a Metadata1 API offered from a sellraze.com
address [7]. The team can afford server-side session replay if they want it.
Nothing ties those repositories to the product.

## 3. Facebook Marketplace

- **No API for a C2C seller tool.** Meta's "Marketplace Partnerships"
  (Product Item API + Seller API) is a partnership for online classified-ad
  services, not a signup [8]. Every crosslister on Facebook is driving the
  web UI or its private GraphQL endpoints.
- **Meta now competes on the exact story.** The Seller app launched 24 Jul
  2026 (The Verge, Meta newsroom): US-only, iOS, photo-to-listing and bulk
  listing, free, no integration surface [9]. **Confirmed** as real; details
  from a second-hand read of the Meta pages.
- **A monthly cap may exist.** A dealer-tool vendor citing Meta's Help
  Center says Marketplace allows 20 new listings a month per account (five
  in Vehicles) [10]. **Contested**, but if true it bounds what any tool can
  do for a Facebook seller and is worth confirming in a real account before
  promising "publish everywhere".
- **Nobody claims unattended Facebook posting at scale.** The one first-hand
  teardown of dealer extensions shows two shapes: DOM form-filling ("detection-
  prone") and direct calls to Facebook's internal listing mutation with the
  page's `fb_dtsg`/`lsd` tokens, whose failure modes are doc_id rotation and
  rate limits [11]. A Canadian dealership's June 2026 design is Flock's
  stop-at-Next exactly: a visible browser fills the fields and never clicks
  the final submit [12].
- **First login from a new device is a checkpoint on its own.** Facebook
  treats a new browser, device and IP as a new-device login and commonly asks
  for approval from an existing device or a code, before any bot signal. The
  node design already has the seller sign in by hand on the node's screen;
  that is when they approve it from their phone. Expect it, say so in the UI.
- **Datacenter origin.** First-hand automation notes say Facebook rate-limits
  or blocks datacenter ranges and that trust established from a residential
  IP carries in the cookies [13]; an Instagram post-mortem ranks a datacenter
  ASN second only to a fresh fingerprint per run as a checkpoint trigger, and
  its mitigations are one persisted session, one never-rotating residential
  IP, and locale/timezone pinned to the account's home region [14]. No
  finding quantifies the checkpoint rate. Flock has to measure it.

**What this means:** the stop-at-Next boundary is consistent with the
evidence, not over-cautious. Facebook is SellRaze's worst-reviewed
integration, and the extension-in-the-seller's-Chrome approach they started
with is the one Flock is extending.

## 4. The bot walls, per channel

This is the part that changes the node's IP story, and it is better
evidenced than anything about SellRaze.

| Channel | Wall | What is observed | Grade |
|---|---|---|---|
| Vinted | DataDome (first-party CNAME `dd.vinted.lt`) | Blocks datacenter egress outright: an OVH IP is refused, residential passes; a captcha "especially on a new session or from an unfamiliar IP"; copying a profile between machines can invalidate the session [15][16] | Confirmed (DataDome present); contested (behaviour) |
| Depop | Cloudflare Bot Management | A real headed Chrome clears the managed challenge silently and earns a `cf_clearance` cookie bound to the user agent; a headless UA gets walled [17] | Contested, first-hand |
| Grailed | Cloudflare | Playwright Chromium from a datacenter host (Railway) gets a consistent 403; the operator gave up on the browser [18] | Contested, first-hand, Aug 2026 |
| Mercari | Cloudflare, client-side rendered | Unofficial libraries get AWS IPs blacklisted; "will never be safe to centralize on a server" per a competitor's research | Contested |
| Facebook | Meta's own | Section 3 | — |
| eBay | Official API | Automation via an authorized app is the norm; enforcement is about seller metrics, not bots | Contested |

**Consequence.** `docs/NODES.md` said a datacenter IP is the default and the
proxy is for Facebook and Mercari. That was too generous: on the evidence,
**Vinted will refuse a bare datacenter IP, and Depop and Grailed will
challenge it**. A geo-matched static ISP proxy per seller is part of the
node's cost of goods for every channel that matters, not an option for two
of them. And the WebGL renderer is a second tell no proxy fixes: a GPU-less
container renders through llvmpipe or SwiftShader, which bot-detection
scripts weight as "no real GPU, as on cloud hosts" [19]. Measure both in the
pilot; do not assume.

## 5. Bans and flags: what actually costs accounts

No review or forum post attributes a ban, suspension or restriction to using
SellRaze. Across the category, the pattern that costs accounts is **stale
inventory, not automation**: a Vendoo user banned from Poshmark because a
quantity was not updated; a Flyp user restricted on eBay and Poshmark "for
cancelling too many orders" after a failed delist; Poshmark's Excessive
Listing Removal policy (May 2025, withdrawn 23 Jul 2026) punishing mass
delete-and-relist "manually or through automation" [20]. All n=1 to n=3,
all second-hand.

Sellers' stated trust signal is "never asks for your password, runs from
your own device and IP". Power users already dedicate a second laptop to
keeping extension tools signed in, which is the hardware and hassle the node
replaces, and the reliability bar it has to clear.

## 6. Unit economics, corrected

The runbook's "$8–10 a seller a month on a shared host" assumed 5–6 nodes on
an 8 GB droplet and treated the proxy as an add-on for two channels. With the
proxy needed for most channels: a $48 DigitalOcean 8 GB droplet at ~1.5 GB a
node holds 4–5 sellers ($10–12 each), plus a static ISP IP at $2–8 a month
[21], plus backups, so **$14–22 a seller a month before support**. Hetzner
Falkenstein at €15.99 for 8 GB halves the host line for EU sellers, and a US
seller's node must be in the US regardless. Price the node above Hogget's
margin or push density; do not ship it at $8.

## 7. Depop has an official door

Depop's Selling API (`partnerapi.depop.com`) is real and private: OAuth 2.0
with PKCE for multi-seller cross-listing tools, `PUT /api/v1/products/{sku}`
upserts a listing, webhooks, 20 requests a second on product writes; access
by emailing business@depop.com with a sandbox key. Depop's help centre says
they "work closely with crosslisting tools via API connection". A competitor
applied in 2026 and had no reply by 6 Sep [22]. **Confirmed** as documented;
the wait time is one data point. Apply now; it costs an email, and it would
retire the Depop filler, the Cloudflare wall and the IP question for Depop
in one move.

## 8. What changes in Flock

Done in this commit:

- **The node's Chromium can no longer save passwords.** `docs/NODES.md`
  promised "sessions, never passwords", but a Chromium profile on Flock's
  disk would have kept any password the seller let it save. `new-node.sh`
  now mounts a managed policy with `PasswordManagerEnabled: false` [23].
- `docs/NODES.md` now says which channels need the proxy (most), that the
  first sign-in is a new-device checkpoint by design, and that the software
  WebGL renderer is a known tell.

To build, in the order the evidence ranks them:

1. **Session health per marketplace on every tick** (a `check-session` job
   that loads each `SELL_PAGE` and reports whether the ready marker
   appeared), a push with a one-tap link to the node's screen when a session
   dies, and time-to-reauth per marketplace as the pricing-defence metric.
   Re-auth loops, not bans, are the category's dominant failure.
2. **Pilot as an A/B on origin** for Facebook and Mercari: half the pilot
   sellers on the geo-matched ISP proxy from the node, half on their own
   laptop, counting checkpoints, re-auth prompts and verification emails.
   Flock's own baseline (how often sessions die on laptops today) is
   internal telemetry that has to exist before the A/B has a control arm.
3. **Delist as a monitored, retried, alerting job**, not a side effect of
   the sync: detect the sale on every tick, delist the siblings, and if one
   cannot be confirmed within a cycle, notify with a link to do it by hand.
4. **A per-marketplace status line** in the product (working / degraded /
   needs your hand) so stop-at-Next on Facebook and never-auto-submit on
   Mercari read as features. Advertise a channel only after an end-to-end
   fill, submit and delist on a real node.
5. **If eBay is added by API**: never create Business Policies without a
   per-policy consent screen, reuse the seller's existing ones, offer to
   delete Flock's on disconnect, and say up front that Inventory-API
   listings are edited in Flock, not Seller Hub.
6. **Disconnect that a seller can verify**: one click retires the
   container, wipes the profile, revokes the token; the account-deletion
   path already does this, and the Settings card should too.

## 9. Open questions worth an afternoon each

- Where SellRaze executes Facebook, Mercari and Depop posts today. Static
  analysis of the Android APK, or proxying a test phone's traffic and
  posting with the app backgrounded, would settle it.
- Whether the 20-listings-a-month Marketplace cap is real, from a real
  account's Help Center.
- Facebook's checkpoint rate from a node behind a static ISP IP, for
  Flock's own sellers. Nobody publishes this.
- The base rate of "re-auth", "won't connect" and "delist failed" in
  SellRaze's reviews: Apple's review RSS and Google Play's review feed are
  public and would replace n=1 with a number.

## Sources

Grades: C = confirmed from a primary artifact; T = contested (survived
refutation; snippet, single review or second-hand).

1. C — Chrome Web Store scrape, 8 Mar 2024, manifest of `boddliddenilkmjjipicghgdcdapofhi`: https://raw.githubusercontent.com/Neche-Stephen/feedback/43bda030e0532876a459b5839b548bda491b3b62/csv-json/partitioned_extensions/bo/boddliddenilkmjjipicghgdcdapofhi.json
2. C — YC directory mirror: https://raw.githubusercontent.com/yc-oss/api/main/batches/fall-2025/sellraze.json
3. C — App Store dataset row (ph storefront, 1 Aug 2026): https://github.com/wookat/app-store-apps-dataset-sample/blob/e20cef8c2357dcb36aecb911b9fa54a9fc2ca494/data/apps_sample_500.csv
4. T — eBay Community threads on SellRaze and Business Policies: https://community.ebay.com/forum/ask-a-mentor-57913/topic/sellraze-406317/
5. C — eBay Inventory API spec (Trading API cannot revise; Business Policies required): https://github.com/zijianhuang/openapiclientgen/blob/c092630bc35b42c96aee16f37af76f0840f3638a/Tests/NG2Tests/SwagMock/sell_inventory_v1_oas3.yaml
6. T — App Store reviews and developer replies (paraphrased via search): https://apps.apple.com/us/app/sellraze-list-sell-earn/id6455042085?see-all=reviews&platform=iphone
7. C (repo facts) — https://github.com/HypePhilosophy/amazon-metadata1
8. T — Competitor research note on Marketplace Partnerships and the Seller app: https://github.com/dj-pearson/GradeThread/blob/f0a91c60041128f6ba3bb06974bd980c6a7dc6c1/vault/30-platform/facebook-marketplace-no-api.md
9. C — The Verge RSS item, 24 Jul 2026, and the Meta newsroom URL: https://about.fb.com/news/2026/07/introducing-seller-app-facebook-marketplace/
10. T — Dealer-tool vendor's Marketplace automation guide (cites Meta Help Center): https://github.com/mgarbs/autolander-website/blob/9763f87823bc1e7c68b3ad2d108f3d5e80713ed2/public/guide/facebook-marketplace-automation/index.html
11. C — Teardown of two dealer Facebook extensions: https://github.com/ajsh/ListItIn/blob/94625835e4bdcb7bce7fb523d445206200f818ab/FACEBOOK_POSTING_ANALYSIS.md
12. C — Dealership's stop-at-submit design, 26 Jun 2026: https://github.com/EASYDRIVECANADA/easydrivecanadav2-master/blob/9c36c94a730da6b0e29bba071c7401188e0cf1a8/docs/superpowers/plans/2026-06-26-owini-style-facebook-browser-assistant.md
13. T — Facebook Playwright notes on datacenter IPs and 2FA checkpoints: https://github.com/hdmGOAT/veent-event-scraper/blob/89e3c6a218ba60c3802f094d064b8fd1aeea0022/docs/facebook-posts-scraper.md
14. T — Instagram automation post-mortem, 5 Aug 2026: https://github.com/salehMomtaz/tgbot/blob/b595c5c2d46377b8d6c115b7be239fe2b435ecb6/docs/COOKIES.md
15. C — DuckDuckGo Tracker Radar, vinted.com loads DataDome: https://github.com/duckduckgo/tracker-radar/blob/a736b501227797f47ac46d15a3da4b0aabac9157/domains/US/vinted.com.json
16. T — Anti-bot survey observing DataDome engage from datacenter egress at Vinted: https://github.com/us/crw/blob/e8eea02a0339b52a19f8a0d04f252003f5408974/docs/docs/tls-fingerprint-walls.md
17. T — Depop CLI notes on Cloudflare Bot Management: https://github.com/adbertram/cli-tools/blob/aae04a5456600620d5a99877943467e1ed5a14a2/depop/README.md
18. T — Grailed 403 from a datacenter host, 14 Aug 2026: https://github.com/iegorov553/price-gh-bot/blob/4d30896a943c3233a8a8552203afec7a4d73b6fc/docs/superpowers/specs/2026-08-14-grailed-algolia-migration-design.md
19. C — Bot-detection script weighting software WebGL: https://github.com/Adversarix/aegis-labs/blob/e754a5087c97396976d195313aeb51bf184dc749/client-recon/lib/headless.js
20. T — Feasibility report corroborating the Poshmark timeline: https://github.com/sernl/listing-sync/blob/de71998d49c33eea9527c1bdf2bbc59d481eac5e/docs/research/feasibility-report.md
21. T — Static ISP proxy pricing, May 2026: https://github.com/dmarzzz/private-re-search/blob/c59132590bb3ec2fd3f428fb845d8fda3e32ff95/sources/dataprixa.com/2026-05-30-proxy-types-complete-guide-to-web-scraping-proxi-proxy-types-web-scra.md
22. C (as documented) — Depop Selling API notes: https://github.com/dj-pearson/GradeThread/blob/f0a91c60041128f6ba3bb06974bd980c6a7dc6c1/vault/30-platform/cross-listing.md
23. C — Chromium policy definition, PasswordManagerEnabled: https://github.com/chromium/chromium/blob/main/components/policy/resources/templates/policy_definitions/PasswordManager/PasswordManagerEnabled.yaml
