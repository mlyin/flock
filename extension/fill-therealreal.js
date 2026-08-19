/**
 * Fills The RealReal's packing list. Selectors read off the live signed-in page
 * on 19 Aug 2026 — see SELECTORS.md.
 *
 *   #category-dropdown-input   Category   -> menu #category-dropdown-menu
 *   #designer-dropdown-input   Designer   -> menu #designer-dropdown-menu
 *   #taxon-dropdown-input      Item Type  -> menu #taxon-dropdown-menu
 *   button[type="submit"] "Add Item"
 *
 * This is NOT a listing form, and the difference matters. The RealReal is
 * consignment: you declare what's in the box, ship it, and they photograph,
 * price, describe and list it. So there is no title, no description, no price
 * and no photos here — only the three facts that decide whether they'll accept
 * the item at all. Flock's job is to get those three right and to stop.
 *
 * Reached at /sell-trr/packing-list, via Sell → Ship to Us → START.
 *
 * THE CASCADE IS STRICT. Item Type is `disabled` until a designer has been
 * genuinely selected — not typed, selected. Category first, then designer, then
 * item type; skip a step and the third field is inert.
 *
 * THE DESIGNER FIELD IS THE ALOYE TRAP AGAIN, and worse than usual. Typing
 * "Maison Margiela" offers four designers:
 *
 *   MM6 Maison Margiela · Maison Margiela · Maison Margiela Fine ·
 *   Maison Margiela x Reebok
 *
 * These are four different brands with four different price expectations. A
 * `startsWith` lands on MM6; "take the first option" lands on MM6. And the
 * right one renders as "Maison Margiela\n\nMOST OBSESSED", so matching the
 * whole textContent misses it and falls through to a sibling. Match the FIRST
 * LINE, exactly, or select nothing.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** React tracks input state internally; a plain assignment gets overwritten. */
function setNativeValue(el, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * The option's own name, without the merchandising.
 *
 * Options carry badges on later lines — "MOST OBSESSED" under the designer
 * name. Those are decoration; the first line is the identity.
 */
const optionName = (el) => (el.innerText || "").trim().split("\n")[0].trim();

/**
 * Open a Chakra combobox, type, and take an exact match or nothing.
 *
 * Deliberately no `acceptFirst`. Every field on this form is an identity field:
 * the wrong designer or the wrong item type doesn't produce a bad listing, it
 * produces a box arriving at a warehouse described as something it isn't.
 */
async function pickExact(inputId, menuId, wanted) {
  const input = document.getElementById(inputId);
  if (!input || !wanted) return { ok: false, reason: input ? "nothing to set" : "field missing" };
  if (input.disabled) return { ok: false, reason: "field still locked" };

  input.focus();
  input.click();

  // Retyping over an existing value doesn't reopen the menu — clear it first.
  setNativeValue(input, "");
  await wait(350);
  setNativeValue(input, String(wanted));
  await wait(1400);

  const menu = document.getElementById(menuId);
  const options = [...(menu?.querySelectorAll('li[role="option"]') ?? [])];
  if (options.length === 0) return { ok: false, reason: `no options for "${wanted}"` };

  const want = String(wanted).trim().toLowerCase();
  const target = options.find((o) => optionName(o).toLowerCase() === want);

  if (!target) {
    // Naming the near-misses turns "it didn't work" into a decision the seller
    // can actually make — these are usually real sibling brands.
    const offered = options.slice(0, 4).map(optionName).join(", ");
    setNativeValue(input, "");
    input.blur();
    return { ok: false, reason: `no exact match for "${wanted}" — offered: ${offered}` };
  }

  target.click();
  await wait(1200);
  return { ok: true };
}

/**
 * Our department vocabulary onto The RealReal's six top-level categories.
 * Read off the live menu: Women, Men, Fine Jewelry, Watches, Home, Kids.
 */
const TRR_CATEGORY = {
  women: "Women",
  womens: "Women",
  "women's": "Women",
  men: "Men",
  mens: "Men",
  "men's": "Men",
  kids: "Kids",
  children: "Kids",
  unisex: "Women",
};

/**
 * Our category words -> The RealReal's item types, where they differ.
 *
 * Item Type options are scoped to the DESIGNER, not just the category, so this
 * cannot be a complete map and isn't meant to be — it's a translation of the
 * few words where Flock and The RealReal simply use different nouns. Typing
 * "Footwear" into their box returns NOTHING; "Shoes" returns exactly one
 * option. Without this, every pair of shoes reported a miss and the seller
 * filled the field by hand for no reason.
 *
 * Verified against the live form on 19 Aug 2026 with Men + Maison Margiela
 * selected, which offered: Grooming Products, Jeans, Accessories, Suiting
 * Accessories, Ties, Sweaters, Sweatshirts & Hoodies, Outerwear, Shoes.
 *
 * Anything not here is typed through unchanged and still has to match exactly.
 */
const TRR_ITEM_TYPE = {
  footwear: "Shoes",
  denim: "Jeans",
  knitwear: "Sweaters",
  sweats: "Sweatshirts & Hoodies",
  fleece: "Sweatshirts & Hoodies",
  outerwear: "Outerwear",
  accessories: "Accessories",
};

function banner(filled, missing) {
  document.getElementById("flock-banner")?.remove();
  const el = document.createElement("div");
  el.id = "flock-banner";
  el.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:12px 14px;" +
    "background:#111;color:#fff;font:13px/1.45 system-ui;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3)";
  el.innerHTML =
    `<strong>Flock — packing list</strong><br>${filled.length ? "Filled: " + filled.join(", ") : "Nothing filled."}` +
    (missing.length ? `<br><span style="color:#ffb4a2">Do by hand: ${missing.join("; ")}</span>` : "") +
    `<br><span style="opacity:.6">Check it, then press Add Item.</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 30000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // "apply", not "fill" — background.js sends { type: "apply", payload }. This
  // listened for the wrong name and read the wrong field, so it never answered
  // at all and every run died on the 90-second deadline looking like a slow
  // form rather than a filler that was never listening.
  if (message.type !== "apply") return;

  (async () => {
    const item = (message.payload && message.payload.item) ?? {};
    const filled = [];
    const missing = [];

    const department = String(item.department ?? "").trim().toLowerCase();
    const category = TRR_CATEGORY[department];
    if (!category) {
      missing.push(
        department
          ? `category — "${item.department}" isn't one of The RealReal's six`
          : "category — no department on this garment"
      );
    } else {
      const outcome = await pickExact("category-dropdown-input", "category-dropdown-menu", category);
      if (outcome.ok) filled.push(`category (${category})`);
      else missing.push(`category — ${outcome.reason}`);
    }

    // Designer gates Item Type, so a miss here costs both fields.
    const designer = await pickExact("designer-dropdown-input", "designer-dropdown-menu", item.brand);
    if (designer.ok) filled.push(`designer (${item.brand})`);
    else missing.push(`designer — ${designer.reason}`);

    if (designer.ok) {
      const wanted =
        TRR_ITEM_TYPE[String(item.category ?? "").trim().toLowerCase()] ?? item.category;
      const taxon = await pickExact("taxon-dropdown-input", "taxon-dropdown-menu", wanted);
      if (taxon.ok) filled.push(`item type (${wanted})`);
      else missing.push(`item type — ${taxon.reason}`);
    } else {
      missing.push("item type — stays locked until the designer is set");
    }

    // Never pressed automatically. Add Item is the seller's declaration about
    // what they are putting in a box, and a consignment intake is not something
    // to be wrong about on their behalf.
    missing.push("press Add Item yourself once it looks right");

    banner(filled, missing);
    sendResponse({ filled, missing, blocked: [] });
  })().catch((error) => {
    console.error("[flock] The RealReal fill crashed:", error);
    sendResponse({ error: error.message });
  });

  return true;
});
