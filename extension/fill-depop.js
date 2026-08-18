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
  colour: "colour-input",
  packageSize: "shippingMethods-input",
};

/** Depop's wording, not ours. Case matters — these are matched exactly first. */
const CONDITION = {
  nwt: "Brand new with tags",
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

async function fillSize(size) {
  if (!size) return false;
  const el = findControl([/^size/, /size-input/, /\bsize\b/]);
  if (!el) return false;

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
async function attachPhotos(urls) {
  if (!urls || urls.length === 0) return 0;

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
      photoCount = await attachPhotos(p.photos || []);
      if (photoCount > 0) filled.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    if (setText(FIELD.description, p.description)) filled.push("description");
    else missing.push("description");

    if (setText(FIELD.price, p.price)) filled.push("price");
    else missing.push("price");

    // Category has no value from us yet, so let Depop's own filtering decide
    // from the garment type rather than forcing a guess.
    const categoryGuess = item.depop_category || item.category;
    if (await combo(FIELD.category, categoryGuess)) filled.push("category");
    else missing.push("category");

    // Size and quantity don't exist in the DOM until a category is chosen —
    // Depop renders a different size scale per category. This is why earlier
    // runs landed in Incomplete: the fields were queried before they existed.
    await wait(1200);

    if (await fillSize(item.size)) filled.push("size");
    else missing.push("size");

    if (await fillQuantity(1)) filled.push("quantity");
    else missing.push("quantity");

    if (await combo(FIELD.condition, CONDITION[item.condition], { acceptFirst: false }))
      filled.push("condition");
    else missing.push("condition");

    if (item.brand && (await combo(FIELD.brand, item.brand, { exact: true }))) filled.push("brand");
    else if (item.brand) missing.push(`brand (no exact match for "${item.brand}" — set it by hand)`);

    if (item.color && (await combo(FIELD.colour, item.color))) filled.push("colour");

    if (await combo(FIELD.packageSize, item.package_size)) filled.push("package size");
    else missing.push("package size");

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
    sendResponse({ filled, missing, blocked });
  })().catch((error) => {
    // A filler that dies without responding leaves the page stuck on
    // "Filling…" forever — the seller can't tell a crash from a slow form.
    // Report the crash as the result instead.
    console.error('[threader] fill crashed:', error);
    sendResponse({ error: error.message });
  });

  return true;
});
