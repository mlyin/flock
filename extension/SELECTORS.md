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
department's categories:

```
Tops · Bottoms · Outerwear · Dresses · Footwear · Accessories · Bags & Luggage · Jewelry
```

Only once both are chosen do **Sub-category**, **Select Size** and
`#designer-autocomplete` stop being `disabled`. Confirmed: after picking
Womenswear then Tops, the trigger read `Womenswear / Tops` and all three unlocked.

There is no neutral department option, so an item with no `department` cannot be
categorised here at all — the filler refuses rather than flipping a coin on the most
visible field in the listing.
