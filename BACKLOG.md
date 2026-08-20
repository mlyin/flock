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
- **Nothing auto-submits** a marketplace form. Fills stop; the seller commits.
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

- [ ] **Bulk create.** Multi-select on the drafts that already exist, then draft
      or fill them as a batch. Flock already has bulk price drops; this is the
      missing half.

## Blocked

- [ ] **Finish one filler end to end.** Five of seven have never completed a
      fill. *Blocked: Vinted needs account verification; Mercari serves
      automated tabs an empty shell.*
- [ ] **Pricing from sold comps.** *Blocked: eBay developer approval.* Unlocks
      API-grade sale detection too, so it does double duty when it lands.

## Soon

- [ ] Poshmark filler (agreed as MVP in the group chat, never started).
- [ ] Verify the three `unverified` fee rates — `therealreal`, and the two others
      `lib/fees.ts` still admits to. Every net figure rests on them.
      Dispatch `.claude/agents/fee-auditor.md`.
- [ ] Wire `markMessageRead` — unread state is write-only, so the badge can only
      grow.
- [ ] Repack the extension. `dist/` is older than the source and the version
      never moved past 0.2.0, so `/install` is likely serving a stale build.
- [ ] Delete the legacy no-Supabase path in `middleware.ts`. Losing the env vars
      currently ungates the whole app rather than failing loudly.

## Standing rules

- **Never meter the AI.** SellRaze paywalled their formerly-free identify
  feature and it is the single loudest complaint against them. That's the wedge.
- **Never publish a fee rate without a source URL and a date.**
