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
