# Flock backlog

The queue an autonomous loop works through. Ordered — top unchecked item is next.

Run it with:

```
/loop work the top unchecked item in BACKLOG.md. Build it, test it, commit it,
tick the box, then move to the next one. Don't stop to ask.
```

Rules for whoever (or whatever) works this:

- **Never guess a marketplace selector.** Read it off the live page or a fill
  report, or leave the field and say so. See `.claude/agents/selector-medic.md`.
- **Money changes need a test before the commit**, and `npm run simulate` green.
- **A fill stops by default; the seller commits.** This said "nothing auto-submits"
  until 26 Aug, which was false -- Depop, Vinted and Grailed press submit when the
  popup's auto-submit toggle is on. It defaults to off, so the rule is "opt-in, and
  never on Mercari", not "never".
- **Don't mark a feature done in `lib/plan.ts`** until it actually works.
- Blocked items stay blocked — say what's blocking and move down the list.

---

## Now

- [x] **Sale detection → auto-delist queue.** *(20 Aug — rides on the shop read; absence raises a question, never a verdict.)* The extension already captures
      listing URLs. Poll them on a `chrome.alarms` cadence, detect sold state on
      Depop and Vinted's public pages, POST to a new `/api/ext/sale-detected`,
      fill the `delist_tasks` queue that already exists, and show a red "still
      live on…" banner with one-click links to each channel's edit page.
      *Category table stakes — 7 of 7 competitors have it, and SellRaze's misfires
      badly enough to be their loudest complaint.*

- [x] **Import an existing closet.** *(20 Aug — /import reads the shop over the bridge and adopts listings as unreviewed garments.)* `read-depop-listings.js` exists with no UI.
      Add a screen: run the reader, land rows in `external_listings`, then a
      separate confirmable matching step using `lib/reconcile.ts` (already
      tested). Without this, first-run asks a seller with 200 live listings to
      re-photograph their closet.

- [x] **Bulk create.** *(20 Aug — select on the inventory table, draft every channel at once.)* Multi-select on the drafts that already exist, then draft
      or fill them as a batch. Flock already has bulk price drops; this is the
      missing half.

## Blocked

- [ ] **Finish the remaining fillers end to end.** Two of seven have now
      completed one: Depop (a real listing went live) and Facebook (verified
      field by field against the live form, 21 Aug). Grailed is partial — its
      designer field reverts any scripted value, so one field is always typed by
      hand. eBay and The RealReal are written and unrun. *Blocked: Vinted needs
      account verification; Mercari serves automated tabs an empty shell.*
- [x] **Pricing from sold comps** — done 21 Aug, by routing around the block
      rather than waiting on it. eBay publishes completed sales on a PUBLIC
      search page; `read-ebay-sold.js` reads it with no API key and no approval.
      The blocker turned out not to be load-bearing. Worth remembering the next
      time something looks blocked.

## Soon

- [ ] Poshmark filler (agreed as MVP in the group chat, never started). BLOCKED
      the same way Vinted is: the create-listing form needs a signed-in session to
      read, and a filler written from guessed selectors is the mistake The RealReal
      already taught us. Needs a DOM read before a line is written.
- [x] Verify the three `unverified` fee rates — done 20 Aug. Facebook, StockX and
      The RealReal, each read off the marketplace's own page and then put through
      an adversarial pass that refuted all three researchers on detail. All ten
      channels now carry a source URL and a date.
- [x] Wire `markMessageRead` — done 20 Aug, plus the count itself was wrong:
      outgoing rows have no `read_at` either, so your own replies were unread.
- [x] Repack the extension — 0.3.0 packed and published 20 Aug. `bridge.js` now
      stamps its version so the app can say when an install is behind.
- [x] Delete the legacy no-Supabase path in `middleware.ts` — done 20 Aug.
      Missing env vars now serve a 503 instead of removing the gate. Same
      fail-open shape was in `app/page.tsx` and `app/layout.tsx`.

## Standing rules

- **Never meter the AI.** SellRaze paywalled their formerly-free identify
  feature and it is the single loudest complaint against them. That's the wedge.
- **Never publish a fee rate without a source URL and a date.**

## Found by the adversarial sweep, 21 Aug — all fixed

Five finder agents over distinct lenses, every finding then handed to a skeptic
whose job was to refute it. 29 candidates, 26 survived, 3 refuted.

The two criticals were both invisible rather than loud:

- A `$1,250` Depop listing read as `$1.00`, because the price regex stopped at
  the comma. That number passes every downstream check and lands at the TOP of
  the price-drift queue as a one-click "Use $1.00".
- The Mercari filler had grown a branch that clicks List — the one channel the
  file's own header, and CLAUDE.md, forbid auto-submitting.

The lesson worth keeping: both had a correct version of themselves sitting
next door. `read-depop-messages.js` already parsed money properly, and the
Mercari header already said not to submit. Neither was consulted.

## Still open

- [ ] Poshmark, Vestiaire and StockX fillers. All blocked the same way: their
      forms need reading off a live signed-in page before a line is written.
- [ ] A reminder for the delist queue. Recording a sale doesn't notify, on
      purpose — the seller is looking at the screen. The useful version is
      "you recorded this six hours ago and three listings are still up", which
      needs a scheduled job.
- [ ] Comp reads are per-garment and manual. Reading them in bulk at intake
      would price a whole box in one pass.
