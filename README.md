# Flock

Resale operations for secondhand clothing. Photograph a garment, get it identified and
priced, list it across the marketplaces you sell on, and see what you actually netted
after five different fee structures took their cut.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic values
npm run migrate              # apply the schema to your Supabase project
npm run dev                  # http://localhost:3737
```

Sign in with Google, then upload a garment and its brand tag from the Inbox.

## How a garment gets in

1. **Upload.** The browser sends photos straight to Supabase Storage under
   `{user_id}/inbox/…`. On a phone the picker opens the camera. Two shots per garment
   works best: the piece, and its brand or care tag.
2. **Identify.** Select the photos that belong to one garment. They're resized to 2000px
   (enough to read a care label, not so much you pay for pixels) and sent to Claude,
   which returns a fixed schema — brand, category, size, material, condition, flaws —
   with **a confidence score per field**.
3. **Questions, not guesses.** Anything scored under 0.70 comes back as a question for
   you rather than a confident answer. Brand is the field to distrust most; the prompt
   forbids inferring it from styling, so it only reports brands it can read off a tag.
4. **Review.** The draft sits as `unreviewed` with confidence badges on each field.
   Nothing enters inventory until you confirm it.

Cost is a few cents per garment at two photos. Measure your own before scaling up.

## Architecture

- **Next.js 15** App Router. Server components query Postgres directly; server actions
  handle writes.
- **Supabase** — Postgres, Auth (Google), and Storage. Row-level security is on for every
  table, so tenant isolation is enforced by the database rather than by remembering a
  `WHERE` clause.
- **Claude Opus 5** for photo identification, with a forced JSON schema.
- **Plain CSS** with tokens in `app/globals.css`. Light and dark both defined.

```
app/
  page.tsx            dashboard — net proceeds, take rates, inventory grid
  items/[id]/         one garment: photos, review form, listings, money ledger
  inbox/              upload and identify
  fees/               fee rules + net-at-price comparison
  login/, auth/       Google sign-in, OAuth callback, sign-out
  actions.ts          server actions
lib/
  data.ts             all reads; RLS scopes them
  inference.ts        the vision call — schema, prompt, image encoding
  intake.ts           inference → draft item, photo filing, SKU assignment
  fees.ts             per-channel fee rules and net projection
  supabase/           server, browser, and admin clients
supabase/migrations/  schema, applied by scripts/migrate.mjs
```

## Two things to know before trusting it

**Every fee rate is unverified.** `lib/fees.ts` carries `verifiedOn: "unverified"` on all
five channels — the numbers were written from memory of public fee pages. The net figures
are only as honest as that table.

**Only eBay has a public listing API.** Poshmark, Depop, Mercari, and Vinted have no open
seller-write API. Reaching them means a browser extension the seller installs and drives —
automating a customer's marketplace account server-side puts *their* income at risk.

## Known gaps

- eBay OAuth tokens in `channel_accounts` are stored in plaintext. Encrypt before anyone
  but the owner connects an account.
- Listing creation isn't built yet. Items and photos are real; listings, sales, and fees
  have schema and math but nothing writes them.
- No pricing from sold comps yet.
