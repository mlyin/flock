# Marketplace sell-form selectors

Read off the live, signed-in pages — not guessed. Guessing is what put the brand
"Aloye" on a real Alo listing, so anything added here should come from an actual
DOM read, with the date it was taken.

Captured 2026-08-17.

---

## Depop — `https://www.depop.com/products/create/`

Every control has a stable id. Dropdowns are text inputs with `role=combobox`
whose `aria-controls` names their own menu.

| Field | Selector | Notes |
|---|---|---|
| Photos | `#upload-input__input` | file, multiple |
| Description | `#description` | textarea |
| Price | `#priceAmount__input` | |
| Category | `#group-input` → `#group-menu` | combobox |
| Brand | `#brand-input` → `#brand-menu` | combobox — **exact match only** |
| Condition | `#condition-input` → `#condition-menu` | combobox |
| Colour | `#colour-input` → `#colour-menu` | combobox |
| Package size | `#shippingMethods-input` → `#shippingMethods-menu` | combobox |
| Size, Quantity | *rendered only after a category is chosen* | ids vary by category |

**Scope option lookup to the field's own menu.** Every menu renders its options
into the DOM at once, so a global `[role=option]` query will cheerfully pick a
colour when you asked for a condition.

---

## Mercari — `https://www.mercari.com/sell/`

**Form takes ~4 seconds to mount.** A 1.5s wait finds an empty page.

| Field | Selector | Notes |
|---|---|---|
| Photos | `input[data-testid="SellPhotoInput"]` | file, hidden |
| Title | `#sellName` | max 80 |
| Description | `#sellDescription` | max 1000 |
| Category | `button[data-testid="SellCategoryFieldButton"]` | **a button opening a picker**, not a combobox |
| Brand | `#sellBrandId` | |
| Condition | `input[name="sellCondition"]` radios | `#1` New with tags · `#2` Like new · `#3` Good · `#4` Fair · `#5` Poor |
| Ship from | `button[data-testid="ShipsFromAddButton"]` | |
| Delivery | `#MERCARI` radio, `name=deliveryOptions` | |
| Shipping class | `#sellShippingClassesInput` | |
| Price | `#Price` (`name=sellPrice`) | min $1, max $2000 |
| Save draft | `button[data-testid="SaveDraftButton"]` | |
| List | `button[data-testid="ListButton"]` | |

> ⚠️ **`g-recaptcha-response` is present on this form.** Mercari runs reCAPTCHA on
> submission. Auto-submitting here risks a challenge the extension can't answer —
> and shouldn't try to. Leave the final click to the seller.

---

## Vinted — `https://www.vinted.com/items/new`

| Field | Selector | Notes |
|---|---|---|
| Photos | `input[data-testid="add-photos-input"]` (`name=photos`) | file |
| Title | `#title` | |
| Description | `#description` | textarea |
| Category | `#category` (`@catalog-select-dropdown-input`) | dropdown |
| Price | `#price` | |
| Save draft | `button[data-testid="upload-form-save-draft-button"]` | |
| Submit | `button[data-testid="upload-form-save-button"]` | |

Brand, size, and condition follow the Depop pattern — they appear after a
category is chosen. Re-scan rather than querying up front.

---

## Grailed — `https://www.grailed.com/sell` → redirects to `/sell/new`

Different photo model from everything else: **nine separate single-file inputs**,
not one multi-file input.

| Field | Selector | Notes |
|---|---|---|
| Photos | `#photo_input_0` … `#photo_input_8` | one file each |
| Designer (brand) | `#designer-autocomplete` | disabled until a category is set |
| Title | `input[name="title"]` | "Item name" |
| Description | `textarea[name="description"]` | |
| Country of origin | `#country-of-origin` | |
| Price | `input[name="price"]` | `type=tel` |
| Make offer | `input[name="makeOffer"]` | checkbox |
| Smart pricing | `input[name="smartPricing.enabled"]` + `smartPricing.minimumPrice` | |

Department → Category → Sub-category → Size is a cascade of custom widgets, none
of which are plain inputs. Each level enables the next.

---

## Re-reading a form

Paste this into DevTools on any sell page:

```js
[...document.querySelectorAll('input,select,textarea,button[data-testid]')]
  .map(el => [
    el.tagName.toLowerCase() + (el.type ? ':'+el.type : ''),
    el.id ? '#'+el.id : '',
    el.getAttribute('data-testid') ? '@'+el.getAttribute('data-testid') : '',
    el.name ? 'n='+el.name : '',
    (document.querySelector(`label[for="${el.id}"]`)?.textContent
      || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0,30)
  ].filter(Boolean).join(' ')).join('\n')
```

Wait for the form to mount first — Mercari needs about four seconds.

---

## Depop messages — `https://www.depop.com/messages/`

Split across two views, and neither has everything:

| View | Selector | Gives |
|---|---|---|
| List | `a[href^="/messages/<32+ hex>/"]` | thread id, buyer handle, last-message preview, relative time |
| Thread | `a[href^="/products/"]` (excluding `/products/create/` and `/products/edit/`) | **the product link** — the exact key tying a conversation to a garment |

**Fetching the HTML does not work.** `fetch('/messages/<hash>/')` returns a 215KB
shell with none of the conversation in it — Depop renders messages client-side.
The reader has to run in a real tab that has actually loaded the page, which is
why syncing walks threads one at a time rather than pulling them in parallel.

Message bubbles have no stable hook, so they're read as leaf text nodes inside
the conversation pane, with Depop's own safety notice filtered by content. That
part is the fragile bit; the product link is not.

## Depop messages — verified 18 Aug 2026 against a live signed-in inbox

Run directly in the page (not via the extension) while signed in, on an inbox with
two threads and one real buyer conversation.

**Thread list** — `a[href^="/messages/"]`, id from `/messages/([a-f0-9]{32,})/`. Six
anchors resolved to two unique threads. The row's `innerText` lines are:

```
[avatar initial?]      only when the buyer has no avatar image — one character
handle                 e.g. "mrtt2", or "Depop" for their official account
preview                last message text
relative time          "Today"
"Conversation Menu"    row furniture
```

The optional avatar-initial line is what made every field read one position out —
sender came back as "M", preview as the handle, and the message text as the
timestamp. Depop's own account has an avatar image and so never showed it, which
is why this looked correct in testing. Handles are at least three characters, so a
one- or two-character first line is the initial.

**Thread** — `a[href^="/products/"]` gives the product link, and it is reliable:
resolved to `depop.com/products/yumseller21-ivory-soho-pullover-brand-alo-ab33/`.
That link is what ties a conversation to an item.

Message bodies still have no stable hook. Of 13 leaf nodes in a two-message
conversation, 11 were noise: timestamps, `Item(s)`, `Total`, `$80.00`,
`Shipping calculated at checkout`, `Refresh`, `Active today`, the safety notice,
the report/block notice, and the product card repeating the listing description.
Filtering by content (see `isMessageText`) kept exactly the two real messages.

## Depop shop + header badge — verified 18 Aug 2026, live and signed in

**Shop** — `depop.com/<username>/`. Product cards are `a[href^="/products/"]`, but
Depop's own "Sell now" button is also an `/products/create/` link, so filter it out.
Real cards carry `aria-label="item listed by <username>"` — the only stable hook on
the card itself, since the anchor has no text and the grid is images only.

The price is **not** on the anchor. It sits two levels up (`$80.00` was found on the
card's grandparent). Walk outward at most 4 levels and stop at the first money-shaped
match; going further reaches the whole grid and picks a neighbour's price.

Sold marking on a card is **unverified** — no sold item existed on the shop when this
was read.

Note the shop slug does not have to match the seller's username: `yumseller22`'s live
listing is `/products/yumseller21-ivory-soho-pullover-brand-alo-ab33/`. Don't derive
one from the other. `depop.com/yumseller21/` 404s.

**Header badge** — Depop renders `See 2 new offers` as a leaf `<span>` in the header on
*every* page, including the shop and the inbox. Matched with
`/see\s+(\d+)\s+new\s+(offers?|messages?)/i` on text rather than a class, since Depop's
class names are hashed per deploy.

This is the cheapest new-offer signal available: no API exists, and reading a badge the
seller's own browser already rendered costs nothing. `watch-depop.js` observes it and
only wakes the background script when the count *rises* — a drop just means they read
them.

## Vinted category — verified 18 Aug 2026 on the live signed-in sell form

`#category` is `<input type="text" readonly data-testid="catalog-select-dropdown-input">`.
**Read-only** — which is why `setNativeValue` silently did nothing and every run
reported category as skipped.

Clicking it opens a dropdown carrying its own search box,
`input[placeholder="Find a category"]` (no test id). Typing there returns flat leaf
results that spell out their whole path:

```
Hoodies & sweatshirts / Women > Clothing > Jumpers & sweaters
Hoodies & sweatshirts / Women > Clothing > Activewear
Hoodies & sweatshirts / Men   > Clothing > Sweaters & sweatshirts
Hoodies & sweatshirts / Kids  > Girls clothing > Sweaters & hoodies
```

Searching beats walking the tree: the tree is four levels deep and its shape differs
per department, while the results carry the department in their text, which is what
makes the choice safe. A query of "sweatshirt" returned 19 leaf rows, **most of them
Men** — so filtering by the item's department is doing real work, not being
defensive.

Result rows are `li` elements whose innerText contains `>` and splits into exactly two
parts on `" / "`. **The clickable target is a `div[role="button"][tabindex="0"]` inside
the li — clicking the `li` itself does nothing.** That cost a debugging cycle.

Not verified end to end: selecting a category redirected to
`/users/verification?ref_url=/items/new`. This Vinted account has to be verified before
it can list at all, so the final selection could not be confirmed.

## Radix menus need pointer events — verified 18 Aug 2026

**The single most useful thing in this file.** Grailed's whole cascade and Vinted's
category rows are Radix-style menus. `HTMLElement.click()` **does not open them** —
they listen on `pointerdown`/`pointerup`, so a plain click dispatches an event nothing
is subscribed to. `aria-expanded` stays `false`, no menu appears, and the filler
reports the field as skipped. That one fact is why category, sub-category, size,
condition and designer were never filled on either site.

What works:

```js
for (const type of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
  el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0,
  }));
}
```

### Grailed cascade

Trigger buttons are `button[class*="DropdownMenu-module__trigger"]`; menu entries are
`[role="menuitem"]` rendered in a portal.

**Department and Category are one control.** Opening it lists exactly two items —
`Menswear`, `Womenswear`. Choosing one *replaces the list in the same menu* with that
department's categories — **the menu stays open**. Clicking the trigger again at that
point toggles the menu closed and the category list is gone; the filler must pick the
category from the already-open menu (`pickFromOpen`, not a second `chooseFrom`).
Verified by driving the live menu with pointer events, 18 Aug 2026:

```
Tops · Bottoms · Outerwear · Dresses · Footwear · Accessories · Bags & Luggage · Jewelry
```

Only once both are chosen do **Sub-category**, **Select Size** and
`#designer-autocomplete` stop being `disabled`. Confirmed: after picking
Womenswear then Tops, the trigger read `Womenswear / Tops` and all three unlocked.

There is no neutral department option, so an item with no `department` cannot be
categorised here at all — the filler refuses rather than flipping a coin on the most
visible field in the listing.

**Womenswear / Tops sub-categories** (read live, 18 Aug 2026):

```
Blouses · Bodysuits · Button Ups · Crop Tops · Hoodies · Long Sleeve T-Shirts
Polos · Short Sleeve T-Shirts · Sweaters · Sweatshirts · Tank Tops
```

Menswear uses combined labels (`Sweatshirts & Hoodies`, `Sweaters & Knitwear`), so the
filler carries both spellings. Do **not** feed the top-level category in as a
sub-category candidate: `"Tops"` substring-matched `Crop Tops` and filed a pullover
under it on a real fill.

### `#designer-autocomplete` cannot be filled by script — 18 Aug 2026

The one control on the page that refuses a scripted value. Verified directly, with the
category set and the field enabled and focused:

```
setNativeValue(input, "Alo Yoga")     → input.value === "Alo Yoga"
input.dispatchEvent(new Event("input")) → input.value === ""   ← synchronously
```

React re-renders from state its handler never updated. `execCommand("insertText")` and
per-character synthetic `keydown`/`input`/`keyup` were also tried; all revert the same
way. Typing the identical string on a **real keyboard** matches `Alo Yoga` instantly, so
this is not a bad selector and not a missing alias — the field wants trusted events,
which no content script can produce.

Grailed requires a designer, so every Grailed listing takes one manual keystroke-field
from the seller. The filler detects the revert and names the exact string to type
(`designer — type "Alo Yoga"`) rather than reporting a vague skip. Filling it
automatically would need `chrome.debugger`, whose permanent "debugging this browser"
banner is not worth one field.

---

## The RealReal — no filler, and why — 18 Aug 2026

Read live while signed in. Recorded here so nobody spends a day writing
`fill-therealreal.js` before discovering the same three things.

**There is no per-item listing form.** `therealreal.com/sell` redirects to
`/sell-trr` and its "SELL NOW" opens a lead capture, not a listing:

```
input[name="firstName"]   input[name="lastName"]   input[name="email"]
input[name="phone"]       input[name="postalCode"] input[name="tos"]  (checkbox)
button "Continue"
```

That form starts a consignment *conversation*. After it you ship the item in,
and The RealReal photographs, authenticates, prices and lists it. The seller
never writes a listing, so there is nothing for a filler to fill.

**Its ids are React-generated and unstable** — `field-_R_grn9l6klmlst6_` and
similar, regenerated per render. Anything here must key off `name`, never `id`.
This is worth remembering for other React sites that look id-addressable.

**It blocks automated navigation.** `therealreal.com/dashboard` returned
`Access to this page has been denied` in an automated tab on a signed-in
session — bot mitigation, the same family of problem as Mercari serving an
empty document. Not investigated further, because there was nothing to reach.

**Not submitted.** The Continue button was deliberately not clicked: it posts a
real name, email and phone and starts an actual consignment request.

So The RealReal is `CHANNEL_ACCESS: "manual"`. Flock tracks custody, projects
the payout and writes the intake condition report; the consignment itself is
done by hand.

## Facebook Marketplace — still not read — 18 Aug 2026 (second attempt)

Retried with the account signed in elsewhere. Three things, in order:

1. `facebook.com/marketplace/create/item` **redirects to `/marketplace/`**. So does
   `/marketplace/create/`. The create route is not directly addressable.
2. Clicking Marketplace's own "Create new listing" link (`a[href="/marketplace/create/"]`)
   also lands back on `/marketplace/`.
3. The page is serving the **logged-out** Marketplace: `document.cookie` has no
   `c_user`, and `input[name="email"]` / `input[name="pass"]` are present.

So the blocker is a missing session in this browser profile, not a selector problem —
Depop, Vinted, Grailed and The RealReal all had live sessions in the same profile at the
same time. Sign in to facebook.com here and the form can be read properly.

Worth expecting once it is: Meta's automation detection is the most aggressive of any
channel here, and Marketplace listings settle as local pickup (no fee) or shipped (fee),
which is why `lib/fees.ts` models the shipped case and says so.

## Facebook Marketplace — not yet read — 18 Aug 2026 (first attempt)

`facebook.com/marketplace/create/item` redirected to `/marketplace/` and served
a login wall (`Email or phone number` / `Password`), so **no selectors have been
read and none should be guessed.** The channel exists in the data model and in
the fee table; `fill-facebook.js` waits on a signed-in DOM read.

Worth knowing before that read: Meta's automation detection is aggressive, and
Marketplace listings settle either as local pickup (no fee) or shipped (fee),
which is why the fee note there hedges.

## Vinted post-category fields — verified live 18 Aug 2026

`#category`, `#brand`, `#size` and `#condition` are all **read-only inputs that open a
panel**. `setNativeValue` can never touch any of them. Each panel uses a different
control type, which is the part that cost two rounds of fills:

| Field | Panel contents | Match on |
|---|---|---|
| Category | own search box, `input[placeholder="Find a category"]`, results are `li` with `>` paths | leaf name, filtered by department |
| Brand | `#brand-search-input`, rows are `input[id^="brand-radio-"]` | exact row text, refuse if not exactly one |
| **Size** | **`div[role="checkbox"]`** reading `L / US 12-14` | leading segment before `/` |
| **Condition** | **`div[role="radio"]`**, title line + description line | first line only |

Size and condition were being searched for as `label, [role=option], li`. None of those
match, so both silently reported missing on every run while the panel sat open on screen.
There is no single option-element convention on this form — check the role attribute per
panel rather than assuming.

Condition values: `New with tags` · `New without tags` · `Very good` · `Good` ·
`Satisfactory`. Flock's `excellent` maps to **Very good**, not "New without tags", which
asserts the garment is unused.

## Mercari category and size — verified live 19 Aug 2026

**Category decides which SIZE SCALE exists.** With `Men > Pants > Khakis, chinos`
selected the size list offers waist inches (23 in., 24 in., 25 in.); with
`Men > Tops > T-shirts` it offers `XS (30-32)` … `5XL (62-64)`, `One Size`. So a
wrong category silently breaks two fields, and size must be set **after** it.

Left alone, Mercari guesses the category from the photos and remembers the last
draft — a navy t-shirt came out as Khakis, chinos.

**The picker** is a modal opened by `button[data-testid="SellCategoryFieldButton"]`:

| Part | What's there |
|---|---|
| Search | `input` with placeholder `Search category` |
| Suggested | full paths, e.g. `Men > Tops > T-shirts` |
| All Categories | drill-down: Women / Men / Kids / Home / Vintage & collectibles / … |

Every candidate is a **full path**, so the department is in the string and can be
checked rather than assumed. Split on `>`, require the first segment to equal the
item's department and the last to equal the mapped leaf exactly.

⚠️ **Rows have a chevron, so they are not leaf elements.** Filtering on
`children.length === 0` matched nothing at all — the picker sat open with the
right row visible and unclickable. Take the innermost element whose text is the
whole path, then click its nearest `a, button, li, [role=button]`.

**Size options read `XL (46-48)`** — match the leading token only. A substring
match would let `L` satisfy a request for `XL`, silently, on the field a buyer
orders by. The control is found from its visible `Size` label rather than an id:
`#sellSize` was a guess and was wrong.

> ⚠️ **reCAPTCHA v3 is still on this form.** Auto-submit is honoured at the
> seller's explicit request, but the risk is unchanged: v3 scores behaviour
> rather than showing a challenge, and a scripted click on List is the pattern
> being scored. If listings start getting held, turn this off first.

## The RealReal — consignment packing list (read live, 19 Aug 2026)

**Not a listing form.** Reached at `/sell-trr/packing-list` via Sell → Ship to
Us → **START**. You declare what's going in the box; they photograph, price,
describe and list it. So there is no title, description, price or photo field —
only the three facts that decide whether they accept the item.

This **corrects an earlier note** claiming The RealReal had no per-item form and
blocked automated tabs. The packing list is a real form and it loads fine in an
automated tab. The page that refuses automation is the seller *dashboard* —
different page, and that note still holds.

Chakra UI. Each control is `input[role="combobox"]` paired with a `ul` menu of
`li[role="option"]`:

```
#category-dropdown-input   →  #category-dropdown-menu   (li#category-dropdown-item-N)
#designer-dropdown-input   →  #designer-dropdown-menu
#taxon-dropdown-input      →  #taxon-dropdown-menu      ("Item Type")
button[type="submit"]      →  "Add Item"
```

Category options, read off the live menu: **Women, Men, Fine Jewelry, Watches,
Home, Kids.** That's a department, not a garment type.

### The cascade is strict

`#taxon-dropdown-input` is **`disabled`** until a designer has been genuinely
*selected* — typing the name and leaving it there is not enough, and the field
stays inert. Order: category → designer → item type.

### Item Type is scoped to the DESIGNER, not the category

Maison Margiela under Men offers: Grooming Products, Jeans, Accessories,
Suiting Accessories, Ties, Sweaters, Sweatshirts & Hoodies, Outerwear. A
different designer offers a different set. **A static category map is therefore
impossible** — type the garment's own category and take an exact match or
report the miss.

### The designer field is the Aloye trap, wearing a badge

Typing `Maison Margiela` offers four *different brands*:

```
MM6 Maison Margiela · Maison Margiela · Maison Margiela Fine · Maison Margiela x Reebok
```

`startsWith` lands on **MM6**. "First option" lands on **MM6**. And the correct
row renders as:

```
Maison Margiela\n\nMOST OBSESSED
```

so matching the whole `textContent` **misses the right answer and falls through
to a sibling brand**. Match `innerText.split("\n")[0]`, exactly, or select
nothing. Getting this wrong doesn't produce a bad listing — it produces a box
arriving at a warehouse described as another designer's work.

Reopening a combobox that already holds a value does not re-show the menu.
Clear it (`setNativeValue(el, "")`), then type.

## StockX — catalog match, not a listing form (read live, 19 Aug 2026)

**There is no sell form to fill.** StockX is a catalog marketplace: you place an
**Ask** against a product that already exists in their catalog, at a size. The
entire listing is (catalog product, size, ask price). No title, no description,
no photos.

### The ask flow is a URL, not a modal

From a product page, "Place Ask" and "Sell Now" are plain links:

```
/sell/{product-slug}?defaultAsk=true     Place Ask
/sell/{product-slug}?action=sellNow      Sell Now (take the highest bid)
```

### BLOCKER: /sell/* redirects to onboarding until the account is complete

Navigating to `/sell/maison-margiela-tabi-county-loafer-black?defaultAsk=true`
landed on `/selling/onboarding` with the checklist at 60%: **Add a payment
method — Not Started**, **Verify your identity — Not Started**.

**So the ask form itself has NEVER been read.** Do not write selectors for it
from memory or from a blog post — that is exactly the mistake that cost four
cycles on Depop, Grailed and Mercari. Finish onboarding, reach the real form,
read it, then write the filler.

### Style code is the join key, and it is exposed

The product page carries it as a trait and in `<title>`:

```
Style   S57WR0139 P3827 H8396
<title>Maison Margiela Tabi County Loafer Black Men's - S57WR0139 P3827 H8396 - US</title>
```

Search accepts it: `/search?s=S57WR0139`.

### Style code NARROWS but does not UNIQUELY identify — verified

Searching the style code cut 1000 results to **8**, correct product first. But
second was **"Maison Margiela Men Tabi County Loafer Black"** — a near-duplicate
sibling entry. So "search the style code and take the first hit" is the Aloye
trap wearing a serial number, and the stakes are the worst of any channel: the
wrong pick ships a real shoe to an authenticator against another product's
listing, which ends in a failed sale and a penalty fee.

The only safe match is to open a candidate and compare its **Style trait**
against ours character for character. Anything less is a shortlist for the
seller to choose from, and should be presented as one.

### Prices seen on this product, for scale
Lowest Ask $850 · Last Sale $545 · Sell Now $513 — the spread between "what you
can get now" and "what someone is asking" is 65%, which is why an ask price
lifted from another channel would be badly wrong here.

## Depop — package size is doubly gated (read live, 19 Aug 2026)

`#shippingMethods-input` (label: "Package size", menu `#shippingMethods-menu`)
returns **"No option"** until BOTH of these are set:

1. a shipping address is chosen in `#select__address-input`
   (toggle `#select__address-toggle-button`, menu `#select__address-menu`), and
2. an item **category** is chosen in `#group-input`.

With neither, the menu is empty and the fill reports package size as missing —
which looked like a broken selector and is actually the form working as designed.

### The real tiers, and they are CATEGORY-DEPENDENT

With a shoes category selected, the menu offers exactly three, under two
headings:

```
SUGGESTED
  Large          Under 2lb
CHANGE SIZE
  Medium         Under 1lb
  Extra large    Under 10lb
```

**"Extra small" and "Small" are not offered for shoes at all.** Flock stores all
five, so two of its values can never match on this category — which is precisely
why `combo(FIELD.packageSize, ...)` must not fall back to `options[0]`. Before
19 Aug 2026 it did, and since the unmatched value filters the menu to Depop's
own SUGGESTED row, a mismatch quietly selected a postage tier the seller never
picked and pays for. Now `{ acceptFirst: false }`, and a miss is reported.

Note "SUGGESTED" is Depop's recommendation for the chosen category — for shoes
it recommends **Large**, which is the honest answer to "what does a shoebox fit
into".
