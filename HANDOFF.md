# Where Flock stands — 18 Aug 2026

Written to hand off between machines. Read this plus `extension/SELECTORS.md`
and you have everything.

## Live state

- Deployed at **sellonflock.com**, auto-deploys from `main` via Vercel.
- **Migrations 0001–0010 are applied** to the production Supabase database
  (verified directly: `items.department`, seven `messages` offer columns, and
  the `messages_open_offers_idx` / `messages_item_thread_idx` indexes all exist).
- 30 unit tests passing, build clean.
- One real item in inventory: **Ivory Soho Pullover, Alo, $80**, live on Depop.
- The Chrome extension **is installed and working** — it filled 4 photos, title,
  description and price on Vinted successfully.

## The single most important thing learned

**Radix menus ignore `HTMLElement.click()`.** Grailed's entire cascade and
Vinted's category dropdown are built on menus that listen for
`pointerdown`/`pointerup`. A plain `.click()` dispatches an event nothing is
subscribed to: `aria-expanded` stays `false`, no menu opens, and the filler
correctly reports the field as skipped.

This one fact explains why category, sub-category, size, condition and designer
were *never* filled on either site. Fixed by dispatching real `PointerEvent`s.
If a dropdown ever "doesn't work", check this first.

Second most important: **`#category` on Vinted is a read-only input.**
`setNativeValue` can never touch it — it must be opened and driven through
Vinted's own "Find a category" search.

## Blocked on you (nothing here is a code problem)

1. **Vinted account needs verification.** Selecting a category redirects to
   `/users/verification?ref_url=/items/new`. Vinted cannot list at all until
   that's done, so the cascade fix is unverified end to end.
2. **Mercari serves automated tabs an empty shell** — zero inputs, zero buttons,
   in a fresh tab, twice. Its category/brand/shipping selectors therefore cannot
   be read, and per the project rule they must not be guessed. Mercari may stay
   extension-only, or need a real browser session.
3. **Accessibility permission for desktop control** (optional). Screen Recording
   is already granted. To let Claude drive the cursor: System Settings → Privacy
   & Security → Accessibility → add `/Applications/Claude.app`, then restart
   Claude. `cliclick` is installed. Note the display is 2560×1664 Retina, so
   screenshot pixels must be **halved** to get cliclick's logical points.
4. **Rotate the database password.** It was set to a weak value during setup and
   appeared in a chat transcript. `node scripts/set-db-url.mjs` takes a new one
   without echoing it.

## What changed this session

- **Auto-capture of listing URLs.** The "I published it" button is gone.
  `background.js` watches the tab it filled and records the URL the moment the
  marketplace navigates to the new listing. The `posted` route previously
  whitelisted only depop.com and mercari.com, so Vinted and Grailed URLs were
  being silently dropped; all six marketplaces now.
- **Grailed cascade** — Department/Category (one control: Menswear/Womenswear,
  then Tops/Bottoms/Outerwear/…), Sub-category, Size, Condition, then Designer,
  which only unlocks once a category is set.
- **Vinted category** via its own search, filtered by the item's department.
  A search for "sweatshirt" returns 19 leaf rows, **most of them Men's** — the
  department filter is doing real work, not being defensive.
- **Brand aliases.** "Alo" now finds "Alo Yoga" through a curated table. Not
  looser matching: a prefix rule would let "Aloye" back onto a live listing,
  which is a bug that actually happened once.
- **Depop shop reader + reconciler.** Reads live listings and links them to
  items by slug, refusing when two items could both match.
- **Passive offer detection.** Depop renders `See 2 new offers` as a leaf span in
  its header on every page; a content script watches it while any Depop tab is
  open, so offers surface in seconds rather than up to 30 minutes.
- **Icons/Names toggle** for channel chips on the inventory page.

## Next, in order

1. **Reload the extension** at `chrome://extensions` — the Radix fix, the
   cascade, brand aliases and URL capture are all in code but not yet in your
   running browser.
2. **Fill Vinted and Grailed** on the Alo pullover and see how much lands. This
   is the first real test of the pointer-event fix.
3. **Poshmark filler** — in the agreed MVP three, doesn't exist yet. Poshmark
   renders fine for automated tabs, so its DOM can be read properly first time.
4. **Encrypt `channel_accounts`**, which stores tokens in plaintext. Must happen
   before a second person ever connects an account.
5. **Email forwarding for offers** (`docs/FEATURES.md` L12) — the only way to
   sync with the browser closed, and cheaper than the cloud-browser rewrite.

## Decisions made, so they don't get relitigated

- **Staying with the extension for now.** The cloud-browser-per-user plan is
  written up in `docs/CLOUD-BROWSER.md` for when there are users. Its Stage 0 is
  half a day and settles whether the whole approach works.
- **Exact-or-nothing matching**, everywhere. An unfilled field is visible and
  fixable; a wrongly-filled one is neither.
- **Never guess a selector.** Every selector in `extension/SELECTORS.md` was read
  off the live signed-in site, with the date and what was *not* verified.
- **Flock never clicks the final submit.** It fills; the seller publishes.
