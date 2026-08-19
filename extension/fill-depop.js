/**
 * Fills Depop's sell form.
 *
 * Selectors below were read off the live page, not guessed. Every control has a
 * stable id, and every dropdown is a text input with role=combobox whose
 * aria-controls names its own menu:
 *
 *   #group-input          Category      → #group-menu
 *   #brand-input          Brand         → #brand-menu
 *   #condition-input      Condition     → #condition-menu
 *   #colour-input         Colour        → #colour-menu
 *   #shippingMethods-input Package size → #shippingMethods-menu
 *   #description          Description   (textarea)
 *   #priceAmount__input   Item price    (number)
 *   #upload-input__input  Photos        (file)
 *
 * Scoping option lookup to the field's own menu matters: every menu on the page
 * renders its options into the DOM at once, so a global [role=option] search
 * will happily pick a colour when you asked for a condition.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIELD = {
  photos: "upload-input__input",
  description: "description",
  price: "priceAmount__input",
  category: "group-input",
  brand: "brand-input",
  condition: "condition-input",
  size: "variants-input",
  // Category-dependent attribute fields. Depop grows these only AFTER a
  // category is chosen, and different categories grow different ones —
  // footwear gets Type/Occasion/Material, which nothing here knew about until
  // a fill report listed them as still empty.
  attrMaterial: "attributes.material-input",
  attrType: "attributes.shoe-type-input",
  colour: "colour-input",
  packageSize: "shippingMethods-input",
};

/**
 * Depop's wording, not ours. Read off the live menu on 19 Aug 2026, which
 * offers exactly five: Brand new | Like new | Used - Excellent | Used - Good |
 * Used - Fair.
 *
 * `nwt` used to map to "Brand new with tags" — a label Depop does not have. So
 * every new-with-tags item failed the exact match and the seller set condition
 * by hand, which is exactly what happened on the Maison Margiela.
 */
const CONDITION = {
  nwt: "Brand new",
  excellent: "Used - Excellent",
  good: "Used - Good",
  fair: "Used - Fair",
};

/** React tracks input state internally; a plain assignment gets overwritten. */
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null || value === "") return false;
  setNativeValue(el, String(value));
  return true;
}

/**
 * Type into a combobox and pick from its own menu.
 * Falls back from exact match to prefix match to first option — Depop filters
 * as you type, so the first remaining option is usually the right one.
 */
/**
 * Garment word -> Depop's own category names, most specific first.
 *
 * Depop BUILDS THE LISTING TITLE from the category. Choose wrong and the
 * listing is renamed: a men's XL tee went live as "Oakley Men's Navy and Black
 * Crop-top" because the item's category was "Tops", Depop's list contains
 * "Crop tops", and "Crop tops".includes("tops") matched.
 *
 * So category is matched from the garment's own words, exactly, and a miss
 * leaves the field for the seller. An unset category is a form you finish by
 * hand; a wrong one is a public listing describing something you don't own.
 */
/**
 * Our words -> DEPOP'S REAL LEAF NAMES, read off the live category menu on
 * 19 Aug 2026 by typing each term and recording what came back.
 *
 * The previous table was written from imagination and it showed. `shoes` mapped
 * to "Shoes", which is not a Depop category at all — typing it returns only
 * "Boat shoes", "Ballet shoes", "Baby shoes". So every pair of shoes silently
 * failed to match, and since Depop renders size, brand and condition only after
 * a category is chosen, one missing leaf name took the whole listing down with
 * it. That is exactly what happened to a Maison Margiela loafer: category
 * empty, condition empty, "This field is required".
 *
 * The real footwear leaves are:
 *   Sneakers · Slides · Sandals · Flip flops · Slippers · Brogues · Oxfords
 *   Loafers · Boots · Boat shoes · Espadrilles · Ballet shoes · Clogs · Pumps
 *
 * Flock's own CATEGORIES vocabulary is mapped too. It wasn't: of the thirteen
 * canonical categories only "Trousers" appeared here, so a category matched
 * only when the TITLE happened to contain a word from this table.
 */
const DEPOP_CATEGORY = {
  // Flock's canonical categories (lib/inference.ts CATEGORIES)
  denim: ["Jeans"],
  knitwear: ["Jumpers", "Cardigans"],
  shirts: ["Shirts"],
  sweats: ["Sweatshirts", "Hoodies"],
  fleece: ["Sweatshirts"],
  trousers: ["Trousers"],
  dresses: ["Dresses"],
  outerwear: ["Coats", "Jackets"],
  // "Footwear", "Tops", "Activewear", "Accessories" and "Other" are families,
  // not leaves — they need a word from the title to land on a real category.

  // Tops
  tshirt: ["T-shirts"], "t-shirt": ["T-shirts"], tee: ["T-shirts"], tees: ["T-shirts"],
  shirt: ["Shirts"], blouse: ["Blouses"], polo: ["Polo shirts"],
  hoodie: ["Hoodies"], hoodies: ["Hoodies"],
  sweatshirt: ["Sweatshirts"], crewneck: ["Sweatshirts"], pullover: ["Sweatshirts", "Jumpers"],
  jumper: ["Jumpers"], sweater: ["Jumpers"], knit: ["Jumpers"], cardigan: ["Cardigans"],
  tank: ["Tank tops"], vest: ["Tank tops"],

  // Outerwear
  jacket: ["Jackets"], coat: ["Coats"], parka: ["Coats"], puffer: ["Jackets"],

  // Bottoms
  jeans: ["Jeans"], pants: ["Trousers"], chinos: ["Trousers"],
  shorts: ["Shorts"], skirt: ["Skirts"], dress: ["Dresses"],

  // Footwear — verified leaf names
  loafer: ["Loafers"], loafers: ["Loafers"],
  sneaker: ["Sneakers"], sneakers: ["Sneakers"], trainers: ["Sneakers"],
  boot: ["Boots"], boots: ["Boots"],
  sandal: ["Sandals"], sandals: ["Sandals"],
  slides: ["Slides"], slippers: ["Slippers"], "flip-flops": ["Flip flops"],
  brogue: ["Brogues"], brogues: ["Brogues"], oxford: ["Oxfords"], oxfords: ["Oxfords"],
  espadrilles: ["Espadrilles"], clogs: ["Clogs"], pumps: ["Pumps"], heels: ["Pumps"],
  mule: ["Loafers"], mules: ["Loafers"],

  // Accessories
  hat: ["Hats"], cap: ["Hats"], bag: ["Bags"], belt: ["Belts"],
};

/** Our department -> the prefix Depop puts on the option's path. */
const DEPOP_DEPARTMENT = { men: "MEN", mens: "MEN", women: "WOMEN", womens: "WOMEN", kids: "KIDS" };

/**
 * Pick a category leaf IN THE RIGHT DEPARTMENT.
 *
 * Typing "Loafer" offers three options whose visible text is identical —
 * "Loafers", "Loafers", "Loafers". They are not the same category. The
 * department lives on a sibling <p> in the option's wrapper:
 *
 *   ul._optionList
 *     div
 *       p    "MEN > FOOTWEAR"     <- the only thing telling them apart
 *       li[role=option]  "Loafers"
 *
 * Matching on option text alone takes the first, which is how a men's shoe
 * gets filed under Womenswear — the same failure that once published a men's
 * XL tee as a Crop-top. Read the path, match the department, or take nothing.
 */
async function pickCategory(leaf, department) {
  const input = document.getElementById(FIELD.category);
  if (!input || !leaf) return null;

  input.focus();
  setNativeValue(input, String(leaf));
  await wait(1000);

  const menu = document.getElementById(input.getAttribute("aria-controls") ?? "");
  const options = [...(menu ?? document).querySelectorAll("[role=option]")];
  if (options.length === 0) return null;

  const want = String(leaf).trim().toLowerCase();
  const wantDept = DEPOP_DEPARTMENT[String(department ?? "").trim().toLowerCase()] ?? null;
  const pathOf = (o) => (o.parentElement?.querySelector("p")?.textContent ?? "").trim().toUpperCase();

  const exact = options.filter((o) => o.textContent.trim().toLowerCase() === want);
  if (exact.length === 0) return null;

  let target;
  if (exact.length === 1) {
    target = exact[0];
  } else if (wantDept) {
    target = exact.find((o) => pathOf(o).startsWith(wantDept)) ?? null;
  } else {
    // Several departments offer this leaf and we don't know which the garment
    // is. Guessing puts menswear in the womenswear listings; leave it.
    target = null;
  }

  if (!target) {
    input.blur();
    return null;
  }

  const path = pathOf(target);
  target.click();
  await wait(500);
  return path ? `${path} > ${leaf}` : leaf;
}

function depopCategoryCandidates(item, title) {
  const words = `${title ?? ""} ${item.category ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);

  const out = [];
  for (const w of words) for (const c of DEPOP_CATEGORY[w] ?? []) if (!out.includes(c)) out.push(c);
  return out;
}
async function combo(id, wanted, { acceptFirst = true, exact = false } = {}) {
  const input = document.getElementById(id);
  if (!input || !wanted) return false;

  input.focus();
  setNativeValue(input, String(wanted));
  await wait(800); // the menu is populated async

  const menu = document.getElementById(input.getAttribute("aria-controls") ?? "");
  const options = [...(menu ?? input.parentElement ?? document).querySelectorAll("[role=option]")];
  if (options.length === 0) return false;

  const want = String(wanted).trim().toLowerCase();
  const text = (o) => o.textContent.trim().toLowerCase();

  // `exact` exists because loose matching put "Aloye" on a live Alo listing:
  // "alo" prefix-matches "aloye", and a wrong brand is worse than a blank one.
  // For identity fields, no match must mean no selection.
  const target = exact
    ? options.find((o) => text(o) === want) ?? null
    : options.find((o) => text(o) === want) ??
      options.find((o) => text(o).startsWith(want)) ??
      options.find((o) => text(o).includes(want)) ??
      (acceptFirst ? options[0] : null);

  if (!target) {
    input.blur();
    return false;
  }

  target.click();
  await wait(350);
  return true;
}

/**
 * Size and quantity appear only after a category is chosen, and their ids vary
 * by category (Depop uses a different size scale for tops, shoes, and so on).
 * So these search by id pattern and by accessible label rather than assuming
 * one fixed id, and report what they actually found for the diagnostic.
 */
function findControl(patterns) {
  const inputs = [...document.querySelectorAll("input, select")].filter(
    (el) => el.offsetParent !== null && !el.disabled
  );

  for (const pattern of patterns) {
    const hit = inputs.find((el) => {
      const id = (el.id || "").toLowerCase();
      const name = (el.name || "").toLowerCase();
      const label = (
        document.querySelector(`label[for="${el.id}"]`)?.textContent ??
        el.getAttribute("aria-label") ??
        ""
      ).toLowerCase();
      return pattern.test(id) || pattern.test(name) || pattern.test(label);
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * EU shoe sizes onto the US scale Depop actually offers.
 *
 * With a footwear category chosen, Depop's size list is "US 3" ... "US 16"
 * plus "One size" and "Other". A garment recorded as size 42 — which is how
 * the label on an Italian shoe reads — matches none of them, so the field
 * stayed empty and the listing was blocked on "Please insert at least one
 * size".
 *
 * These conversions are standard and APPROXIMATE: half a size of disagreement
 * between brands is normal and Italian makers run their own. So the fill
 * converts and then SAYS it converted, showing both numbers, because the
 * seller is the one who knows whether their 42s fit like a 9.
 */
const EU_TO_US_SHOE = {
  men: {
    39: "6.5", 40: "7", 41: "8", 42: "8.5", 43: "9.5", 44: "10",
    45: "11", 46: "12", 47: "13", 48: "14",
  },
  women: {
    35: "5", 36: "5.5", 37: "6.5", 38: "7.5", 39: "8.5", 40: "9.5",
    41: "10.5", 42: "11.5",
  },
};

/** Set when a conversion was applied, so the banner can show its working. */
let sizeNote = null;

function usShoeSize(size, department) {
  const raw = String(size == null ? "" : size).trim();
  // Already a US size, or a letter size — leave it alone.
  if (!/^[0-9]{2}$/.test(raw)) return null;
  const eu = Number(raw);
  if (eu < 34 || eu > 50) return null;

  const dept = String(department == null ? "" : department).trim().toLowerCase();
  const womens = dept.indexOf("wom") === 0;
  const us = (womens ? EU_TO_US_SHOE.women : EU_TO_US_SHOE.men)[eu];
  if (!us) return null;

  sizeNote = "EU " + eu + " to US " + us + " (" + (womens ? "women's" : "men's") + ") — check it";
  return "US " + us;
}

async function fillSize(size, opts) {
  if (!size) return false;
  const department = opts && opts.department;
  const footwear = opts && opts.footwear;
  const el = document.getElementById(FIELD.size) || findControl([/^size/, /size-input/, /\bsize\b/]);
  if (!el) return false;

  // Only convert for shoes. "42" on a pair of trousers is a waist measurement,
  // and turning that into "US 8.5" would be nonsense.
  if (footwear) {
    const converted = usShoeSize(size, department);
    if (converted && (await combo(el.id, converted, { exact: true, acceptFirst: false }))) return true;
  }

  if (el.tagName === "SELECT") {
    const want = String(size).trim().toLowerCase();
    const option = [...el.options].find(
      (o) => o.textContent.trim().toLowerCase() === want
    );
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return combo(el.id, size, { acceptFirst: false });
}

async function fillQuantity(qty) {
  const el = findControl([/quantity/, /^qty/]);
  if (!el) return false;
  if (el.tagName === "SELECT") {
    el.value = String(qty);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  setNativeValue(el, String(qty));
  return true;
}

/**
 * Every visible form control on the page, with everything needed to write a
 * selector for it. Depop's size and quantity ids change per category, so rather
 * than guessing again this reports the actual DOM and the banner offers to copy
 * it — one paste ends the round-trip.
 */
function formInventory() {
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => el.offsetParent !== null && el.type !== "hidden")
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      role: el.getAttribute("role") || null,
      controls: el.getAttribute("aria-controls") || null,
      label:
        document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ??
        el.getAttribute("aria-label") ??
        el.placeholder ??
        null,
      value: el.type === "file" ? `${el.files?.length ?? 0} file(s)` : el.value || "",
      required: el.required || el.getAttribute("aria-required") === "true",
    }));
}

/**
 * Every visible, empty, required-looking control — so a run that still lands in
 * Incomplete tells us exactly which selector to write next, instead of leaving
 * us guessing from a screenshot of the drafts list.
 */
function unfilledControls() {
  return [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => {
      if (el.offsetParent === null || el.disabled || el.type === "file") return false;
      if (el.value && el.value.trim() !== "") return false;
      return el.required || el.getAttribute("aria-required") === "true";
    })
    .map((el) => {
      const label =
        document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ??
        el.getAttribute("aria-label") ??
        "";
      return `${label || el.name || "?"}#${el.id || "no-id"}`;
    })
    .slice(0, 8);
}

/**
 * Attach photos, whatever shape Depop's uploader is in today.
 *
 * It used to be one multi-file input. The form now shows named slots — Cover
 * photo, Front, Back, Side, Label, Detail, Flaw — so a single DataTransfer
 * assigned to one input can leave the rest empty, and 'no photos' is fatal:
 * Depop refuses the listing and RESETS the form, which looks to the seller
 * like the fill worked and then undid itself.
 *
 * So: load the files once, try the multi-file input, and if that doesn't take,
 * fall back to one file per input like Grailed.
 */
/**
 * Depop accepts EIGHT. Send it eleven and it keeps none.
 *
 * This is what failed on a real Maison Margiela listing: the form showed
 * "Please insert at least one image" and "You can upload a maximum of 8 photos"
 * side by side, which reads like a contradiction until you notice they're the
 * same event — the batch was over the cap, so the whole batch was discarded and
 * the listing had zero. Sending fewer than the seller has is a compromise;
 * sending more is a silent total failure.
 */
const MAX_PHOTOS = 8;

async function attachPhotos(all) {
  if (!all || all.length === 0) return 0;

  // First N by sort_order — the cover shot and the angles the seller put first.
  const urls = all.slice(0, MAX_PHOTOS);

  const files = [];
  for (const [i, url] of urls.entries()) {
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

  const inputs = [...document.querySelectorAll('input[type="file"]')].filter(
    (el) => !el.disabled
  );
  if (inputs.length === 0) return 0;

  // Multi-file input: everything in one go.
  const multi = inputs.find((el) => el.multiple);
  if (multi) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    multi.files = transfer.files;
    multi.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(3000); // uploads must finish before Depop accepts Continue
    if (multi.files.length > 0 || document.querySelector('img[src^="blob:"]')) {
      return files.length;
    }
  }

  // One slot per photo.
  let attached = 0;
  for (let i = 0; i < files.length && i < inputs.length; i += 1) {
    const transfer = new DataTransfer();
    transfer.items.add(files[i]);
    inputs[i].files = transfer.files;
    inputs[i].dispatchEvent(new Event("change", { bubbles: true }));
    attached += 1;
    await wait(1500);
  }
  return attached;
}

/**
 * Only rendered text. An earlier version walked every element and matched
 * Depop's bundled translation JSON inside a <script>, putting ten kilobytes of
 * their i18n file into the banner.
 */
function validationErrors() {
  const seen = new Set();
  return [...document.querySelectorAll("p, span, div, label")]
    .filter((el) => {
      if (el.children.length > 0) return false;
      if (el.closest("script, style, noscript, template")) return false;
      const text = el.textContent?.trim() ?? "";
      if (!text || text.length > 80) return false;
      if (!/required|invalid|please (fill|enter|select)/i.test(text)) return false;
      return el.offsetParent !== null;
    })
    .map((el) => el.textContent.trim())
    .filter((t) => !seen.has(t) && seen.add(t))
    .slice(0, 4);
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
      ${blocked.length ? `Depop wants: ${blocked.join(" · ")}.` : ""}
    </span>
    <button id="threader-close" style="margin-left:auto;background:none;border:1px solid #5C635E;
      color:inherit;padding:6px 11px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;
  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
}


/**
 * What the form looks like now, in its own words.
 *
 * This is the end of the screenshot loop. Every fill bug so far — "Brand new
 * with tags" against a menu that says "Brand new", eleven photos against an
 * eight-photo cap, "42" against a US-only size scale — was found by a person
 * photographing a red message and describing it. The page will say all of it
 * if asked: the label of every control, whether it holds anything, and the
 * validation text sitting next to it.
 *
 * Read-only. It changes nothing and submits nothing; it just looks.
 */
function formReport() {
  const controls = [];
  const errors = new Set();

  const labelFor = (el) => {
    const byFor = el.id && document.querySelector('label[for="' + el.id + '"]');
    const text =
      (byFor && byFor.textContent) ||
      el.getAttribute("aria-label") ||
      (el.closest("label") && el.closest("label").textContent) ||
      el.placeholder ||
      "";
    return text.trim().split("\n")[0].slice(0, 60);
  };

  // Validation text is rendered as a sibling, not on the element, so find it by
  // proximity rather than by a class name that will change next release.
  const errorNear = (el) => {
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      for (const child of node.children) {
        if (child === el || child.contains(el)) continue;
        const t = (child.textContent || "").trim();
        if (!t || t.length > 120) continue;
        if (/required|please|must|invalid|at least|maximum|cannot|too (long|short|many)/i.test(t)) {
          return t;
        }
      }
    }
    return "";
  };

  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.type === "hidden" || el.offsetParent === null) continue;
    const label = labelFor(el);
    const error = errorNear(el);
    if (error) errors.add(error);
    controls.push({
      id: el.id || undefined,
      label: label || undefined,
      kind: el.tagName === "SELECT" ? "select" : el.type || "text",
      value: String(el.value || "").slice(0, 60),
      required: el.required || el.getAttribute("aria-required") === "true" || undefined,
      error: error || undefined,
    });
  }

  // Page-level messages that aren't attached to any one control.
  for (const el of document.querySelectorAll('[role="alert"], [aria-live]')) {
    const t = (el.textContent || "").trim();
    if (t && t.length < 200) errors.add(t);
  }

  return { controls, errors: [...errors], url: location.href };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;

  (async () => {
    const p = message.payload;
    const item = p.item ?? {};
    const autoSubmit = Boolean(message.autoSubmit);
    const filled = [];
    const missing = [];
    let photoCount = 0;

    // Photos first: uploads take time, and Continue won't accept without them.
    try {
      const offered = (p.photos || []).length;
      photoCount = await attachPhotos(p.photos || []);
      if (photoCount > 0) {
        filled.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
        if (offered > MAX_PHOTOS) {
          // Say it rather than quietly dropping three photos the seller shot.
          missing.push(`only the first ${MAX_PHOTOS} of ${offered} photos — Depop's limit`);
        }
      } else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    if (setText(FIELD.description, p.description)) filled.push("description");
    else missing.push("description");

    if (setText(FIELD.price, p.price)) filled.push("price");
    else missing.push("price");

    // Category has no value from us yet, so let Depop's own filtering decide
    // from the garment type rather than forcing a guess.
    // Exact only, and no fallback to whatever happened to be first: Depop
    // titles the listing after the category, so a loose match publishes a
    // garment under the wrong name.
    const categoryOptions = item.depop_category
      ? [item.depop_category]
      : depopCategoryCandidates(item, p.title);

    let categorySet = null;
    for (const candidate of categoryOptions) {
      const chosen = await pickCategory(candidate, item.department);
      if (chosen) {
        categorySet = chosen;
        break;
      }
    }

    if (categorySet) filled.push(`category (${categorySet})`);
    else missing.push("category — pick it yourself, Depop names the listing after it");

    // Size and quantity don't exist in the DOM until a category is chosen —
    // Depop renders a different size scale per category. This is why earlier
    // runs landed in Incomplete: the fields were queried before they existed.
    await wait(1200);

    // categorySet carries Depop's own path, e.g. "MEN > FOOTWEAR > Loafers".
    const isFootwear = /FOOTWEAR/i.test(categorySet || "");
    if (await fillSize(item.size, { department: item.department, footwear: isFootwear })) {
      filled.push(sizeNote ? "size (" + sizeNote + ")" : "size");
    } else {
      missing.push(
        isFootwear
          ? 'size — "' + item.size + '" is not on Depop\'s US scale and no conversion matched'
          : "size"
      );
    }

    if (await fillQuantity(1)) filled.push("quantity");
    else missing.push("quantity");

    if (await combo(FIELD.condition, CONDITION[item.condition], { acceptFirst: false }))
      filled.push("condition");
    else missing.push("condition");

    if (item.brand && (await combo(FIELD.brand, item.brand, { exact: true }))) filled.push("brand");
    else if (item.brand) missing.push(`brand (no exact match for "${item.brand}" — set it by hand)`);

    if (item.color && (await combo(FIELD.colour, item.color))) filled.push("colour");

    // Optional attributes, best-effort. Exact match only: these are buyer-facing
    // facets and a wrong one is a listing that describes the wrong thing. Silent
    // when absent — most categories don't render them at all, so a miss here is
    // not worth telling the seller about.
    const material = item.material_primary || item.material;
    if (material && document.getElementById(FIELD.attrMaterial)) {
      if (await combo(FIELD.attrMaterial, material, { exact: true, acceptFirst: false })) {
        filled.push(`material (${material})`);
      }
    }

    // acceptFirst is OFF here, unlike when this was written. Package size picks
    // the SHIPPING option the buyer pays for, so it is buyer-visible and falls
    // under the exact-match rule — "take the first option" was quietly setting
    // a postage tier nobody chose whenever our label didn't match Depop's.
    if (await combo(FIELD.packageSize, item.package_size, { acceptFirst: false }))
      filled.push("package size");
    else missing.push(`package size (no Depop match for "${item.package_size ?? "—"}")`);

    await wait(700);
    let blocked = validationErrors();

    // Depop saves an unfinished listing as an Incomplete draft rather than
    // refusing it, so a silent success is indistinguishable from a failure
    // unless we name what's still empty.
    const stillEmpty = unfilledControls();
    if (stillEmpty.length > 0) blocked = [...blocked, ...stillEmpty];

    if (!autoSubmit) missing.push("auto-submit off — tick it in the popup");

    // No photos, no submit. `blocked` is built from required inputs, and a
    // type=file input is explicitly skipped by that check — so a listing
    // with zero images looked complete, Post was clicked, and Depop
    // rejected it and reset the whole form. The seller watches every field
    // fill and then empty itself, which reads as Flock undoing its own work.
    if (autoSubmit && photoCount === 0) {
      missing.push("not submitted — no photos attached");
    } else if (autoSubmit && blocked.length === 0) {
      for (let step = 0; step < 4; step += 1) {
        const advance = [...document.querySelectorAll("button")].find(
          (b) =>
            /^(continue|next|publish|list it|post)$/i.test(b.textContent?.trim() ?? "") &&
            !b.disabled &&
            b.offsetParent !== null
        );
        if (!advance) break;

        const label = advance.textContent.trim();
        advance.click();
        filled.push(`clicked ${label}`);

        await wait(2500);
        blocked = validationErrors();
        if (blocked.length > 0) break;
      }
    }

    banner(filled, missing, blocked);
    // Ship the form's own account of itself alongside ours. Ours says what we
    // meant to do; the report says what the page thinks is still wrong.
    sendResponse({ filled, missing, blocked, report: formReport() });
  })().catch((error) => {
    // A filler that dies without responding leaves the page stuck on
    // "Filling…" forever — the seller can't tell a crash from a slow form.
    // Report the crash as the result instead.
    console.error('[threader] fill crashed:', error);
    sendResponse({ error: error.message });
  });

  return true;
});
