/**
 * Fills Facebook Marketplace's "Create new listing" form. Selectors read off
 * the live signed-in page on 21 Aug 2026 — see SELECTORS.md.
 *
 * THE FIELDS HAVE NO STABLE ATTRIBUTES. Facebook's class names are generated
 * and its input ids are React's — `_r_28_`, `_r_2c_`, `_r_2q_` — which change
 * between renders. There is no name, no data-testid, no aria-label on any text
 * field. What IS stable is the structure: every field is an <input> or
 * <textarea> wrapped in a <label> whose first line of text is the field name.
 * So we find the label by its words and take the control inside it. That is
 * the only hook this form offers, and it is why this file has no selector
 * constants at the top like the others do.
 *
 * CATEGORY MUST COME FIRST. Choosing it is what makes Color, Material and SKU
 * exist at all — before that, the form is Title, Price, Category, Condition,
 * Description and nothing else. Query those three up front and you get null and
 * report a miss on fields that were about to appear. Same cascade as Depop,
 * Vinted and Grailed.
 *
 * THE CATEGORY ROWS ARE THE ALOYE TRAP. Every shipping-eligible option renders
 * its name on the first line and "Shipping available" on the second, so
 * matching the whole innerText matches nothing and a substring match on
 * "Clothing" hits both "Women's clothing & shoes" and "Men's clothing & shoes".
 * Listing a men's jacket under women's is not a cosmetic error — it is the
 * wrong audience and a buyer who feels misled. First line, exact, or nothing.
 *
 * IT NEVER SUBMITS. This screen's button is "Next", not "Publish" — there is a
 * second screen after it. Flock fills, stops, and the seller walks both screens
 * themselves. There is also a "Save draft" button, which we do not touch: a
 * draft the seller did not ask for is state appearing in their account without
 * them doing anything.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** React tracks input state internally; a plain assignment gets overwritten. */
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The option's own name, without the badge Facebook renders beneath it. */
const optionName = (el) => (el.innerText || "").trim().split("\n")[0].trim();

/**
 * The <label> whose first line is exactly this field name.
 *
 * First line only, and exact: once a combobox has a value its label reads
 * "Category\nMen's clothing & shoes", so a whole-text match stops finding a
 * field the moment it has been filled — which would make the filler
 * unrepeatable.
 */
function labelFor(name) {
  return [...document.querySelectorAll("label")].find(
    (l) => (l.innerText || "").trim().split("\n")[0].trim() === name
  );
}

function setField(name, value) {
  if (value === undefined || value === null || String(value).trim() === "") return false;
  const control = labelFor(name)?.querySelector("input, textarea");
  if (!control) return false;
  setNativeValue(control, value);
  return true;
}

/**
 * Open one of Facebook's comboboxes and click the exactly-matching option.
 *
 * THERE ARE TWO WIDGET SHAPES ON THIS ONE FORM, and they look identical to a
 * seller:
 *
 *   Category            [role="dialog"]  of  div[role="button"]
 *   Condition, Color    [role="listbox"] of  [role="option"]
 *
 * Written against the dialog shape alone, this reported "menu didn't open" for
 * Condition and Color while the menu was in fact open — `aria-expanded` was
 * already true, the query was just looking in the wrong container. It then
 * pressed Escape and moved on, so the two fields were silently never filled
 * and the banner blamed the page. Caught by running the real helpers against
 * the live form before shipping.
 */
async function pickExact(fieldName, wanted) {
  if (!wanted) return { ok: false, reason: "nothing to set" };

  const combo = labelFor(fieldName);
  if (!combo) return { ok: false, reason: "field missing" };

  combo.click();
  await wait(900);

  const container = document.querySelector('[role="dialog"], [role="listbox"]');
  const rows = [
    ...(container?.querySelectorAll('div[role="button"], [role="option"]') ?? []),
  ];
  if (rows.length === 0) return { ok: false, reason: `menu didn't open for ${fieldName}` };

  const want = String(wanted).trim().toLowerCase();
  const target = rows.find((r) => optionName(r).toLowerCase() === want);

  if (!target) {
    const offered = rows.slice(0, 5).map(optionName).join(", ");
    // Escape rather than clicking something: an open dialog swallows the next
    // field's click, and this menu is a live list of real choices.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(500);
    return { ok: false, reason: `no exact match for "${wanted}" — offered: ${offered}` };
  }

  target.click();
  await wait(1200);
  return { ok: true };
}

/**
 * Facebook accepts TEN photos. Depop taught us what happens past a cap: send
 * eleven to an eight-photo form and it keeps none, so the seller sees a filled
 * listing with no images and no error that explains it.
 */
const MAX_PHOTOS = 10;

async function attachPhotos(all) {
  if (!all || all.length === 0) return 0;

  const files = [];
  for (const [i, url] of all.slice(0, MAX_PHOTOS).entries()) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
    } catch {
      // One unreachable signed URL shouldn't lose the others.
    }
  }
  if (files.length === 0) return 0;

  // There are two file inputs and the second one takes video only. Picking by
  // `accept` rather than by position: handing ten JPEGs to the video input
  // fails silently.
  const input = [...document.querySelectorAll('input[type="file"]')].find((el) =>
    (el.getAttribute("accept") || "").includes("image")
  );
  if (!input) return 0;

  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  // Uploads have to finish before Next will accept them.
  await wait(3500);
  return files.length;
}

/**
 * Flock's department and category words onto Facebook's 26 real options.
 *
 * Read off the live menu on 21 Aug 2026. Only four of the 26 are clothing:
 * Women's clothing & shoes, Men's clothing & shoes, Bags & Luggage, and
 * Jewelry & Accessories.
 *
 * Department decides most of it, because Facebook splits clothing by who it is
 * for and not by what it is. Bags and jewellery are the exceptions — they have
 * their own categories regardless of department, and they are worth more in
 * them.
 */
const BY_CATEGORY = {
  bag: "Bags & Luggage",
  bags: "Bags & Luggage",
  handbag: "Bags & Luggage",
  luggage: "Bags & Luggage",
  jewelry: "Jewelry & Accessories",
  jewellery: "Jewelry & Accessories",
  watch: "Jewelry & Accessories",
  watches: "Jewelry & Accessories",
};

const BY_DEPARTMENT = {
  women: "Women's clothing & shoes",
  womens: "Women's clothing & shoes",
  "women's": "Women's clothing & shoes",
  men: "Men's clothing & shoes",
  mens: "Men's clothing & shoes",
  "men's": "Men's clothing & shoes",
};

function facebookCategory(item) {
  const category = String(item.category ?? "").trim().toLowerCase();
  if (BY_CATEGORY[category]) return BY_CATEGORY[category];

  const department = String(item.department ?? "").trim().toLowerCase();
  // Deliberately no default. Unisex and kidswear have no home among Facebook's
  // four, and guessing "Women's" for a unisex tee files it under the wrong
  // audience — leave it for the seller, who knows who they're selling to.
  return BY_DEPARTMENT[department] ?? null;
}

/**
 * Flock's condition vocabulary onto Facebook's four.
 *
 * Facebook offers exactly: New, Used - Like New, Used - Good, Used - Fair.
 * Note there is no "For parts" and no "New with tags" — NWT is simply New
 * here, and anything below fair has nowhere to go, so it is left blank rather
 * than rounded up into "Used - Fair" on the seller's behalf.
 */
const CONDITION = {
  nwt: "New",
  new: "New",
  "new with tags": "New",
  "brand new": "New",
  nwot: "Used - Like New",
  "new without tags": "Used - Like New",
  excellent: "Used - Like New",
  "like new": "Used - Like New",
  "very good": "Used - Good",
  good: "Used - Good",
  used: "Used - Good",
  fair: "Used - Fair",
  worn: "Used - Fair",
};

/**
 * Flock's colour words onto Facebook's sixteen.
 *
 * Their list has no navy, no cream, no tan — a garment Flock calls "navy" has
 * to become "Blue" or stay empty. Anything not here is left blank: Color is
 * decoration on a listing, and a wrong one is a buyer complaint about an item
 * not matching its description.
 */
const COLOR = {
  beige: "Beige",
  cream: "Beige",
  ivory: "Beige",
  tan: "Beige",
  khaki: "Beige",
  black: "Black",
  blue: "Blue",
  navy: "Blue",
  denim: "Blue",
  brown: "Brown",
  chocolate: "Brown",
  clear: "Clear",
  gold: "Gold",
  grey: "Gray",
  gray: "Gray",
  charcoal: "Gray",
  green: "Green",
  olive: "Green",
  multi: "Multi-Color",
  multicolor: "Multi-Color",
  "multi-color": "Multi-Color",
  patterned: "Multi-Color",
  orange: "Orange",
  pink: "Pink",
  purple: "Purple",
  red: "Red",
  burgundy: "Red",
  maroon: "Red",
  silver: "Silver",
  white: "White",
  yellow: "Yellow",
};

function banner(filled, missing) {
  document.getElementById("flock-banner")?.remove();
  const el = document.createElement("div");
  el.id = "flock-banner";
  el.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:12px 14px;" +
    "background:#111;color:#fff;font:13px/1.45 system-ui;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3)";
  el.innerHTML =
    `<strong>Flock — Marketplace</strong><br>${filled.length ? "Filled: " + filled.join(", ") : "Nothing filled."}` +
    (missing.length ? `<br><span style="color:#ffb4a2">Do by hand: ${missing.join("; ")}</span>` : "") +
    `<br><span style="opacity:.6">Check it, then press Next yourself.</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 30000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;

  (async () => {
    const p = message.payload ?? {};
    const item = p.item ?? {};
    const filled = [];
    const missing = [];

    // Photos first — the upload runs while we fill the rest.
    try {
      const offered = (p.photos || []).length;
      const count = await attachPhotos(p.photos || []);
      if (count > 0) {
        filled.push(`${count} photo${count === 1 ? "" : "s"}`);
        if (offered > MAX_PHOTOS) {
          missing.push(`only the first ${MAX_PHOTOS} of ${offered} photos — Facebook's limit`);
        }
      } else if (offered > 0) missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    if (setField("Title", p.title)) filled.push("title");
    else missing.push("title");

    if (setField("Price", p.price)) filled.push("price");
    else missing.push("price");

    // Category before anything below it: Color, Material and SKU do not exist
    // in the DOM until this is chosen.
    const wantedCategory = facebookCategory(item);
    let categoryChosen = false;
    if (!wantedCategory) {
      missing.push(
        item.department || item.category
          ? `category — nothing in Facebook's list fits "${item.department ?? item.category}"`
          : "category — no department on this garment"
      );
    } else {
      const outcome = await pickExact("Category", wantedCategory);
      if (outcome.ok) {
        filled.push(`category (${wantedCategory})`);
        categoryChosen = true;
      } else missing.push(`category — ${outcome.reason}`);
    }

    const wantedCondition = CONDITION[String(item.condition ?? "").trim().toLowerCase()];
    if (!wantedCondition) {
      missing.push(
        item.condition
          ? `condition — Facebook has no equivalent of "${item.condition}"`
          : "condition"
      );
    } else {
      const outcome = await pickExact("Condition", wantedCondition);
      if (outcome.ok) filled.push(`condition (${wantedCondition})`);
      else missing.push(`condition — ${outcome.reason}`);
    }

    if (setField("Description", p.description)) filled.push("description");
    else missing.push("description");

    // The three that only exist once a category is set.
    if (categoryChosen) {
      // Give the re-render a moment; querying too early finds nothing and
      // reports a miss on a field that is about to appear.
      await wait(800);

      const wantedColor = COLOR[String(item.color ?? "").trim().toLowerCase()];
      if (wantedColor) {
        const outcome = await pickExact("Color", wantedColor);
        if (outcome.ok) filled.push(`colour (${wantedColor})`);
        else missing.push(`colour — ${outcome.reason}`);
      } else if (item.color) {
        missing.push(`colour — Facebook's list has no "${item.color}"`);
      }

      if (setField("Material", item.material)) filled.push("material");
      // SKU is "Optional. Only visible to you" — exactly what it is for.
      if (setField("SKU", item.sku)) filled.push("SKU");
    }

    // Never pressed automatically, and this form makes that easy to get wrong:
    // the button says "Next", not "Publish", so clicking it feels like a step
    // rather than a commitment. It isn't ours to take either way.
    missing.push("press Next yourself once it looks right");

    banner(filled, missing);
    sendResponse({ filled, missing, blocked: [] });
  })().catch((error) => {
    console.error("[flock] Facebook fill crashed:", error);
    sendResponse({ error: error.message });
  });

  return true;
});
