# Brief: apply the Threader identity across the app

Paste into Claude Code from the repo root, after the bundle is merged.

---

Read `docs/brand.md` first — palette, type roles, mascot rules, motion, voice, and
three honesty rules that are design requirements rather than polish.

**Step 1 — survey, don't edit.** Walk the repo and report back before touching
anything: every colour and font currently defined in `app/globals.css`, every place
a logo or icon is referenced, every component under `components/`, and the full
route list under `app/`. Flag any colour that doesn't map onto the six brand tokens.
Stop there for my review.

**Step 2 — tokens.** Merge `docs/brand-tokens.css` into `app/globals.css`. The new
tokens are prefixed `--brand-*` so they can't collide with what's already there.
Repoint the existing tokens at the brand palette, then delete the originals once
nothing references them. Keep the light/dark split that's already working.

**Step 3 — fonts.** `npm i @fontsource/outfit @fontsource-variable/hanken-grotesk
@fontsource/jetbrains-mono`, imported in `app/layout.tsx`, self-hosted, `swap`.
Then the mono pass: every price, net figure, fee rate, confidence score, SKU,
channel name, listing count and date becomes mono with tabular figures. Show me
that pass as its own commit — it changes the feel of the whole product.

**Step 4 — marks.** Wire `components/brand/Mark.tsx` into the header and the login
page. Add favicon, apple-touch-icon, manifest, theme-color and the OG card to the
metadata export in `app/layout.tsx`.

**Step 5 — the listing card.** Replace the inventory grid on `app/page.tsx` with
`components/brand/ListingCard.tsx`, and use it on `app/items/[id]/` too. It already
encodes the confidence and unverified-fee rules — wire the real fields from
`lib/data.ts` rather than working around them.

**Step 6 — loader and empty states.** `Loader` replaces every spinner, above all
during identification in `app/inbox/` where the wait is seconds long and costs
money. Put `Multiply` on the empty inventory state and the logged-out landing page.

**Step 7 — the fees screen.** `app/fees/` shows numbers built on rates marked
`verifiedOn: "unverified"`. Give that a real visible treatment using `--brand-sold`
— a seller must not mistake an estimate for a fact. Propose the treatment before
building it.

Work on one branch, commit per step, stop after Step 1 and after Step 7's proposal.
This is a visual pass: don't touch server actions, RLS, the inference schema, or
fee math. If a change would reach into application logic, flag it and leave it.
