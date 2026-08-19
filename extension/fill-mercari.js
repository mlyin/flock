/**
 * Fills Mercari's sell form. Selectors read off the live page — see SELECTORS.md.
 *
 *   input[data-testid="SellPhotoInput"]           Photos (file, hidden)
 *   #sellName                                     Title (max 80)
 *   #sellDescription                              Description (max 1000)
 *   button[data-testid="SellCategoryFieldButton"] Category — a BUTTON opening a
 *                                                 picker, not a combobox
 *   #sellBrandId                                  Brand
 *   input[name="sellCondition"] #1..#5            Condition radios
 *   #Price                                        Price ($1–$2000)
 *   button[data-testid="ListButton"]              List
 *
 * NEVER AUTO-SUBMIT HERE. The form carries g-recaptcha-response — invisible
 * reCAPTCHA v3, which scores behaviour rather than showing a challenge. A person
 * clicking List passes silently; a script clicking it is exactly the pattern the
 * score is looking for. Filling is fine, submitting is the seller's.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIELD = {
  photos: 'input[data-testid="SellPhotoInput"]',
  title: "#sellName",
  description: "#sellDescription",
  category: 'button[data-testid="SellCategoryFieldButton"]',
  brand: "#sellBrandId",
  price: "#Price",
};

/** Mercari's radio ids, in its own wording. */
const CONDITION_RADIO = {
  nwt: "1", // New with tags
  excellent: "2", // Like new
  good: "3", // Good
  fair: "4", // Fair
};

function setNativeValue(el, value) {
  // Mercari serves automated tabs an empty page, so this form can only be
  // inspected by RUNNING against it — and a run crashed here with "Illegal
  // invocation": some field is no longer a plain input or textarea, and the
  // prototype setter refuses any other receiver. Handle the three shapes a
  // text field can take, and if one still throws, say WHICH element died
  // instead of an anonymous crash.
  try {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    } else if (el.isContentEditable) {
      el.textContent = String(value);
    } else {
      el.value = value; // custom element exposing a value property
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (error) {
    throw new Error(`${el.tagName.toLowerCase()}#${el.id || el.name || "?"}: ${error.message}`);
  }
}

function setText(selector, value, max) {
  const el = document.querySelector(selector);
  if (!el || value === undefined || value === null || value === "") return false;
  setNativeValue(el, max ? String(value).slice(0, max) : String(value));
  return true;
}

function setCondition(condition) {
  const id = CONDITION_RADIO[condition];
  if (!id) return false;
  const radio = document.getElementById(id);
  if (!radio || radio.name !== "sellCondition") return false;
  radio.click();
  return true;
}

/** Brand is an autocomplete — exact match or nothing, per the Aloye incident. */
async function setBrand(brand) {
  const input = document.querySelector(FIELD.brand);
  if (!input || !brand) return false;

  input.focus();
  setNativeValue(input, String(brand));
  await wait(900);

  const options = [...document.querySelectorAll('[role="option"], li')].filter(
    (o) => o.offsetParent !== null && o.textContent.trim()
  );
  const want = String(brand).trim().toLowerCase();
  const target = options.find((o) => o.textContent.trim().toLowerCase() === want);

  if (!target) {
    input.blur();
    return false;
  }
  target.click();
  await wait(350);
  return true;
}

async function attachPhotos(urls) {
  const input = document.querySelector(FIELD.photos);
  if (!input || urls.length === 0) return false;

  const transfer = new DataTransfer();
  for (const [i, url] of urls.slice(0, 12).entries()) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const blob = await response.blob();
    transfer.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
  }
  if (transfer.files.length === 0) return false;

  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(3000);
  return true;
}

function unfilledControls() {
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => {
      if (el.offsetParent === null || el.disabled || el.type === "file") return false;
      if (el.value && el.value.trim() !== "") return false;
      return el.required || el.getAttribute("aria-required") === "true";
    })
    .map(
      (el) =>
        `${(document.querySelector(`label[for="${el.id}"]`)?.textContent ?? el.getAttribute("aria-label") ?? el.name ?? "?").trim()}#${el.id || "no-id"}`
    )
    .slice(0, 8);
}

function banner(filled, missing, blocked) {
  document.getElementById("threader-banner")?.remove();
  const el = document.createElement("div");
  el.id = "threader-banner";
  el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1A1F1D;
    color:#EFF0EC;font:14px/1.45 system-ui,sans-serif;padding:13px 18px;display:flex;gap:14px;
    align-items:flex-start;box-shadow:0 2px 12px rgba(0,0,0,.35)`;
  el.innerHTML = `
    <strong style="font-weight:650;white-space:nowrap">Flock filled ${filled.length}</strong>
    <span style="opacity:.8">
      ${filled.length ? filled.join(", ") + ". " : ""}
      ${missing.length ? `Skipped: ${missing.join(", ")}. ` : ""}
      Set category and shipping yourself, then hit Mercari's own List button —
      this one is never auto-submitted.
      ${blocked.length ? ` Still empty: ${blocked.join(" · ")}.` : ""}
    </span>
    <button id="threader-close" style="margin-left:auto;background:none;border:1px solid #5C635E;
      color:inherit;padding:6px 11px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;
  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
}

/**
 * Category, through Mercari's own picker.
 *
 * Read off the live modal: a search box placeholder "Search category", a
 * "Suggested" list of full paths like "Men > Tops > T-shirts", and an "All
 * Categories" drill-down. Every candidate is a full path, which is the useful
 * part — the department is IN the string, so it can be checked rather than
 * hoped for.
 *
 * Left unset, Mercari guesses from the photos and remembers the last draft. A
 * navy t-shirt came out as "Men > Pants > Khakis, chinos", and size then
 * offered waist inches, so XL had nowhere to go. A wrong category on Mercari
 * doesn't just misfile the listing — it changes which size scale exists.
 */
const MERCARI_LEAF = {
  tshirt: ["T-shirts"], "t-shirt": ["T-shirts"], tee: ["T-shirts"], tees: ["T-shirts"],
  polo: ["Polos"], shirt: ["Button-front", "T-shirts"], blouse: ["Blouse"],
  hoodie: ["Sweats & hoodies"], sweatshirt: ["Sweats & hoodies"], crewneck: ["Sweats & hoodies"],
  pullover: ["Sweats & hoodies", "Sweaters"], sweater: ["Sweaters"], jumper: ["Sweaters"],
  cardigan: ["Sweaters"], knit: ["Sweaters"],
  tank: ["Tank tops"], jeans: ["Jeans"], trousers: ["Pants"], pants: ["Pants"],
  chinos: ["Khakis, chinos"], shorts: ["Shorts"], skirt: ["Skirts"], dress: ["Dresses"],
  jacket: ["Coats & jackets"], coat: ["Coats & jackets"], blazer: ["Blazers & sport coats"],
  sneakers: ["Shoes"], boots: ["Shoes"], shoes: ["Shoes"],
};

const MERCARI_DEPARTMENT = { women: "Women", men: "Men", kids: "Kids" };

function mercariLeaves(item, title) {
  const words = `${title ?? ""} ${item.category ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);

  const out = [];
  for (const w of words) for (const leaf of MERCARI_LEAF[w] ?? []) if (!out.includes(leaf)) out.push(leaf);
  return out;
}

/**
 * Every visible row in the picker that reads like a full category path.
 *
 * NOT `children.length === 0`. Each row carries a chevron, so the element
 * holding the path text always has a child — that test excluded every row in
 * the list and the picker sat open with the right answer visible and
 * unclickable.
 *
 * Instead: take the INNERMOST element whose text is the whole path. An outer
 * container matches too, and clicking that can miss the row's own handler.
 */
function categoryRows() {
  const PATH = /^(Women|Men|Kids|Home|Handmade|Vintage & collectibles)\s*>/;

  const all = [...document.querySelectorAll("a, button, li, div, span, p")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ el, text: (el.textContent ?? "").trim() }))
    .filter((r) => PATH.test(r.text) && r.text.length < 90);

  // Drop any element that merely contains a smaller element with the same
  // text — that's a wrapper, and the row itself is the one that responds.
  return all.filter(
    (r) => !all.some((other) => other.el !== r.el && r.el.contains(other.el) && other.text === r.text)
  );
}

async function setCategory(item, title) {
  const opener = document.querySelector(FIELD.category);
  if (!opener) return null;

  const department = MERCARI_DEPARTMENT[item.department];
  const leaves = mercariLeaves(item, title);

  // No department, or nothing in the words that maps to a Mercari leaf: leave
  // it. Guessing here picks the size scale too, so a wrong guess breaks two
  // fields rather than one.
  if (!department || leaves.length === 0) return null;

  opener.click();
  await wait(900);

  // Type into the picker's own search first — it surfaces leaves that would
  // otherwise need three levels of drill-down.
  const search = [...document.querySelectorAll("input")].find(
    (i) => i.offsetParent !== null && /search category/i.test(i.placeholder ?? "")
  );

  for (const leaf of leaves) {
    if (search) {
      setNativeValue(search, leaf);
      await wait(1100);
    }

    // Exact leaf, correct department, or nothing. The path's last segment is
    // the category itself; matching loosely is what put a pullover under
    // "Crop tops" on two other marketplaces.
    const match = categoryRows().find((r) => {
      const parts = r.text.split(">").map((x) => x.trim());
      return parts[0] === department && parts[parts.length - 1].toLowerCase() === leaf.toLowerCase();
    });

    if (match) {
      // The text node's own element may not be the handler; the row above it
      // usually is.
      const target = match.el.closest("a, button, li, [role=button]") ?? match.el;
      target.click();
      await wait(1400);
      return `${department} > ${leaf}`;
    }
  }

  // Nothing matched — shut the modal rather than leaving it over the form.
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(300);
  return null;
}

/**
 * Size, after the category.
 *
 * Mercari swaps the scale to match the category — letters for tops, waist
 * inches for trousers — so this can only run once the category is correct,
 * and it reads whatever scale is actually on screen rather than assuming one.
 *
 * Options read like "L (42-44)"; the leading token is the size. Matched
 * exactly on that token, so "L" can never satisfy a request for "XL".
 */
async function setSize(size) {
  if (!size) return false;

  const want = String(size).trim().toLowerCase();
  const field =
    document.querySelector("#sellSize") ??
    [...document.querySelectorAll("button, select, input")].find((el) => {
      if (el.offsetParent === null) return false;
      const label = (el.getAttribute("aria-label") ?? el.name ?? el.id ?? "").toLowerCase();
      return /(^|\b)size/.test(label);
    });

  if (!field) return false;

  if (field.tagName === "SELECT") {
    const option = [...field.options].find(
      (o) => o.textContent.trim().split(/[\s(]/)[0].toLowerCase() === want
    );
    if (!option) return false;
    field.value = option.value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  field.click();
  await wait(900);

  const option = [...document.querySelectorAll("li, [role=option], button, div")]
    .filter((el) => el.offsetParent !== null)
    .find((el) => {
      const text = (el.textContent ?? "").trim();
      return text.length < 24 && text.split(/[\s(]/)[0].toLowerCase() === want;
    });

  if (!option) {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }

  (option.closest("li, button, [role=option]") ?? option).click();
  await wait(700);
  return true;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;

  (async () => {
    const p = message.payload;
    const item = p.item ?? {};
    const filled = [];
    const missing = [];

    try {
      if (await attachPhotos(p.photos || [])) filled.push("photos");
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    if (setText(FIELD.title, p.title, 80)) filled.push("title");
    else missing.push("title");

    if (setText(FIELD.description, p.description, 1000)) filled.push("description");
    else missing.push("description");

    if (setText(FIELD.price, p.price)) filled.push("price");
    else missing.push("price");

    if (setCondition(item.condition)) filled.push("condition");
    else missing.push("condition");

    if (item.brand && (await setBrand(item.brand))) filled.push("brand");
    else if (item.brand) missing.push(`brand (no exact match for "${item.brand}")`);

    // Category before anything that depends on it: Mercari swaps the SIZE
    // scale to match, so setting size against the wrong category offers waist
    // inches for a t-shirt.
    const category = await setCategory(item, p.title);
    if (category) filled.push(`category (${category})`);
    else missing.push("category — pick it yourself, it decides the size scale");

    // Only meaningful once the category is set, since that's what decides
    // which scale exists.
    if (category && (await setSize(item.size))) filled.push("size");
    else if (item.size) missing.push(`size ("${item.size}" not in this category's scale)`);

    missing.push("shipping");

    await wait(700);
    const blocked = unfilledControls();

    banner(filled, missing, blocked);
    // autoSubmit is deliberately ignored here. See the header.
    sendResponse({ filled, missing, blocked, autoSubmitBlocked: true });
  })().catch((error) => {
    // A filler that dies without responding leaves the page stuck on
    // "Filling…" forever — the seller can't tell a crash from a slow form.
    // Report the crash as the result instead.
    console.error('[threader] fill crashed:', error);
    sendResponse({ error: error.message });
  });

  return true;
});
