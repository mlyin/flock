/**
 * Fills Grailed's sell form. Selectors read off the live page — see SELECTORS.md.
 *
 *   #photo_input_0 … #photo_input_8   Photos — NINE SEPARATE single-file inputs
 *   input[name="title"]               Item name
 *   textarea[name="description"]      Description
 *   #designer-autocomplete            Designer (brand) — disabled until category set
 *   input[name="price"]               Price (type=tel)
 *   #country-of-origin                Country of origin
 *
 * Grailed's photo model is the odd one out: every other marketplace takes one
 * multi-file input, so the usual DataTransfer-once trick doesn't port. Each
 * photo goes into its own input.
 *
 * Department → Category → Sub-category → Size is a cascade of custom widgets,
 * none of them plain inputs, each enabling the next. They're left to the seller
 * — walking that reliably is brittle, and Grailed rejects miscategorised
 * listings anyway.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIELD = {
  title: 'input[name="title"]',
  description: 'textarea[name="description"]',
  designer: "#designer-autocomplete",
  price: 'input[name="price"]',
};

function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (!el || value === undefined || value === null || value === "") return false;
  setNativeValue(el, String(value));
  return true;
}

/** Designer is an autocomplete; an exact match or nothing. */
async function pickDesigner(brand) {
  const input = document.querySelector(FIELD.designer);
  if (!input || !brand) return false;
  if (input.disabled) return false; // category not chosen yet

  input.focus();
  setNativeValue(input, String(brand));
  await wait(1000);

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
  await wait(400);
  return true;
}

/**
 * One photo per input. Grailed exposes nine slots; we fill as many as we have.
 * Each needs its own DataTransfer — reusing one carries the previous file over.
 */
async function attachPhotos(urls) {
  let attached = 0;

  for (const [i, url] of urls.slice(0, 9).entries()) {
    const input = document.getElementById(`photo_input_${i}`);
    if (!input) break;

    const response = await fetch(url);
    if (!response.ok) continue;
    const blob = await response.blob();

    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    attached += 1;
    await wait(1200); // each upload needs to settle before the next slot appears
  }

  return attached;
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
    <strong style="font-weight:650;white-space:nowrap">Threader filled ${filled.length}</strong>
    <span style="opacity:.8">
      ${filled.length ? filled.join(", ") + ". " : ""}
      ${missing.length ? `Skipped: ${missing.join(", ")}. ` : ""}
      Set Department, Category, Sub-category and Size yourself — Grailed rejects
      miscategorised listings, so it's worth doing by hand.
      ${blocked.length ? ` Still empty: ${blocked.join(" · ")}.` : ""}
    </span>
    <button id="threader-close" style="margin-left:auto;background:none;border:1px solid #5C635E;
      color:inherit;padding:6px 11px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;
  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
}


/* --------------------------------------------------------------------------
   Grailed's dropdowns are Radix menus, and .click() does not open them.

   This is the whole reason the cascade was never filled. Radix listens on
   pointerdown/pointerup, so a plain HTMLElement.click() sets aria-expanded on
   nothing and silently does nothing at all. Dispatching real pointer events
   opens it. Verified on the live sell form, 18 Aug 2026.

   Department and Category live in ONE control: opening it lists
   Menswear/Womenswear, and choosing one replaces the list with that
   department's categories (Tops, Bottoms, Outerwear, Dresses, Footwear,
   Accessories, Bags & Luggage, Jewelry). Only once both are chosen do
   Sub-category, Size and Designer stop being disabled.
   -------------------------------------------------------------------------- */

function pointerClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 })
    );
  }
}

const onScreen = (selector) =>
  [...document.querySelectorAll(selector)].filter((el) => el.offsetParent !== null);

const menuItems = () => onScreen('[role="menuitem"],[role="option"],[role="menuitemradio"]');

function triggerMatching(pattern) {
  return [...document.querySelectorAll("button[class*='DropdownMenu-module__trigger']")].find((b) =>
    pattern.test(b.textContent.trim())
  );
}

/** Open a Radix dropdown and choose the first item matching any candidate. */
async function chooseFrom(trigger, candidates) {
  if (!trigger || trigger.disabled) return null;

  pointerClick(trigger);
  await wait(600);

  for (const candidate of candidates) {
    const item = menuItems().find((el) => {
      const text = el.textContent.trim().toLowerCase();
      return text === candidate.toLowerCase() || text.includes(candidate.toLowerCase());
    });
    if (item) {
      pointerClick(item);
      await wait(900);
      return item.textContent.trim();
    }
  }

  // Nothing matched — close it rather than leaving a menu hanging open over the
  // rest of the form.
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(300);
  return null;
}

const DEPARTMENT_LABEL = { women: "Womenswear", men: "Menswear", unisex: "Menswear" };

/** Garment type -> Grailed's top-level category, from the live option list. */
const GRAILED_CATEGORY = {
  pullover: ["Tops"], sweatshirt: ["Tops"], hoodie: ["Tops"], sweater: ["Tops"],
  jumper: ["Tops"], shirt: ["Tops"], tee: ["Tops"], tshirt: ["Tops"], top: ["Tops"],
  jeans: ["Bottoms"], trousers: ["Bottoms"], pants: ["Bottoms"], shorts: ["Bottoms"],
  skirt: ["Bottoms"],
  jacket: ["Outerwear"], coat: ["Outerwear"], parka: ["Outerwear"], puffer: ["Outerwear"],
  dress: ["Dresses"],
  boots: ["Footwear"], sneakers: ["Footwear"], shoes: ["Footwear"],
  bag: ["Bags & Luggage"], handbag: ["Bags & Luggage"], tote: ["Bags & Luggage"],
  hat: ["Accessories"], belt: ["Accessories"], scarf: ["Accessories"],
  necklace: ["Jewelry"], ring: ["Jewelry"], earrings: ["Jewelry"],
};

function categoryCandidates(item) {
  const words = String(item.title || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out = [];
  for (const w of words) for (const c of GRAILED_CATEGORY[w] ?? []) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * Department -> Category -> Sub-category -> Size -> Condition.
 *
 * Refuses without a department: Grailed's first choice is literally
 * Menswear or Womenswear, so there is no neutral option to fall back on and
 * guessing is a coin flip on the most visible field in the listing.
 */
async function setGrailedCascade(item) {
  const result = { filled: [], missing: [] };

  const department = item.department;
  if (!department || !DEPARTMENT_LABEL[department]) {
    result.missing.push("category (no department recorded on the item)");
    return result;
  }

  const trigger = triggerMatching(/department\s*\/\s*category|womenswear|menswear/i);
  const chosenDept = await chooseFrom(trigger, [DEPARTMENT_LABEL[department]]);
  if (!chosenDept) {
    result.missing.push("category (couldn't open the department menu)");
    return result;
  }

  // Same control, now showing that department's categories.
  const candidates = categoryCandidates(item);
  if (candidates.length === 0) {
    result.missing.push("category (nothing in the title maps to a Grailed category)");
    return result;
  }

  const chosenCategory = await chooseFrom(triggerMatching(/womenswear|menswear|department/i), candidates);
  if (!chosenCategory) {
    result.missing.push(`category (no match for ${candidates.join(", ")})`);
    return result;
  }
  result.filled.push(`category (${DEPARTMENT_LABEL[department]} / ${chosenCategory})`);

  // Sub-category, size and condition only exist now that a category is set.
  const sub = await chooseFrom(triggerMatching(/^sub-?category/i), [
    ...candidates,
    "Sweatshirts & Hoodies",
    "Sweaters & Knitwear",
    "Other",
  ]);
  if (sub) result.filled.push(`sub-category (${sub})`);
  else result.missing.push("sub-category");

  if (item.size) {
    const size = await chooseFrom(triggerMatching(/select size/i), [item.size, String(item.size).toUpperCase()]);
    if (size) result.filled.push("size");
    else result.missing.push(`size (no "${item.size}" option)`);
  }

  const conditionLabel = {
    new_with_tags: "New with tags", new_without_tags: "New without tags",
    excellent: "Gently used", good: "Used", fair: "Very worn", poor: "Very worn",
  }[item.condition];
  if (conditionLabel) {
    const cond = await chooseFrom(triggerMatching(/item condition/i), [conditionLabel]);
    if (cond) result.filled.push("condition");
    else result.missing.push("condition");
  }

  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;

  (async () => {
    const p = message.payload;
    const item = p.item ?? {};
    const filled = [];
    const missing = [];

    try {
      const count = await attachPhotos(p.photos || []);
      if (count > 0) filled.push(`${count} photo${count === 1 ? "" : "s"}`);
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    if (setText(FIELD.title, p.title)) filled.push("title");
    else missing.push("title");

    if (setText(FIELD.description, p.description)) filled.push("description");
    else missing.push("description");

    if (setText(FIELD.price, p.price)) filled.push("price");
    else missing.push("price");

    // The cascade first: Department, Category, Sub-category, Size and Condition
    // are Radix menus that .click() never opened, which is why every one of them
    // was left to the seller. Designer is disabled until a category is set, so
    // this has to run before it.
    const cascade = await setGrailedCascade({
      title: p.title ?? item.title,
      department: item.department,
      size: item.size,
      condition: item.condition,
    });
    filled.push(...cascade.filled);
    missing.push(...cascade.missing);

    await wait(800);

    // Try the brand as recorded, then any name the same company is listed under
    // here — Grailed calls it Designer and its list is curated, so "Alo" may
    // only exist as "Alo Yoga".
    const designerCandidates = item.brandCandidates?.length ? item.brandCandidates : [item.brand];
    let designerSet = null;
    for (const candidate of designerCandidates) {
      if (candidate && (await pickDesigner(candidate))) {
        designerSet = candidate;
        break;
      }
    }
    if (designerSet) {
      filled.push(designerSet === item.brand ? "designer" : `designer (as "${designerSet}")`);
    } else if (item.brand) {
      missing.push(`designer (no exact match for "${item.brand}")`);
    }

    await wait(600);
    const blocked = unfilledControls();

    banner(filled, missing, blocked);
    sendResponse({ filled, missing, blocked });
  })();

  return true;
});
