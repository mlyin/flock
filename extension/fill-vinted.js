/**
 * Fills Vinted's sell form. Selectors read off the live page — see SELECTORS.md.
 *
 *   input[data-testid="add-photos-input"]   Photos (file, multiple)
 *   #title                                  Title
 *   #description                            Description
 *   #category                               Category (dropdown)
 *   #price                                  Price
 *
 * Brand, size and condition don't exist until a category is chosen — the same
 * shape as Depop. Querying them up front finds nothing, which is what made
 * earlier Depop runs land in Incomplete drafts.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Real pointer events, not HTMLElement.click().
 *
 * Vinted's category rows and Grailed's whole cascade are built on menus that
 * listen for pointerdown/pointerup. A plain .click() dispatches a click nothing
 * is listening for, so the menu never responds and the field is reported as
 * skipped — which is exactly what was happening on every run.
 */
function pointerClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 })
    );
  }
}

const FIELD = {
  photos: 'input[data-testid="add-photos-input"]',
  title: "#title",
  description: "#description",
  category: "#category",
  price: "#price",
  submit: 'button[data-testid="upload-form-save-button"]',
};

/** React tracks input state internally; a plain assignment gets overwritten. */
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

/**
 * Type into a dropdown and pick from the list it opens.
 * `exact` exists because loose matching once put the brand "Aloye" on an Alo
 * listing — for identity fields, no match must mean no selection.
 */
async function pick(selector, wanted, { exact = false, acceptFirst = false } = {}) {
  const input = document.querySelector(selector);
  if (!input || !wanted) return false;

  input.focus();
  input.click();
  setNativeValue(input, String(wanted));
  await wait(900);

  const menuId = input.getAttribute("aria-controls");
  const scope = (menuId && document.getElementById(menuId)) || document;
  const options = [...scope.querySelectorAll('[role="option"], li[data-testid], [role="menuitem"]')].filter(
    (o) => o.offsetParent !== null
  );
  if (options.length === 0) return false;

  const want = String(wanted).trim().toLowerCase();
  const text = (o) => o.textContent.trim().toLowerCase();

  const target = exact
    ? options.find((o) => text(o) === want) ?? null
    : options.find((o) => text(o) === want) ??
      options.find((o) => text(o).startsWith(want)) ??
      (acceptFirst ? options[0] : null);

  if (!target) {
    input.blur();
    return false;
  }

  target.click();
  await wait(500);
  return true;
}

/** Fields that only exist after a category is chosen, found by label. */
function findByLabel(patterns) {
  const controls = [...document.querySelectorAll("input, select")].filter(
    (el) => el.offsetParent !== null && !el.disabled
  );
  for (const pattern of patterns) {
    const hit = controls.find((el) => {
      const haystack = [
        el.id,
        el.name,
        el.getAttribute("data-testid"),
        document.querySelector(`label[for="${el.id}"]`)?.textContent,
        el.getAttribute("aria-label"),
        el.placeholder,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return pattern.test(haystack);
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * The post-category fields are read-only inputs that OPEN A PANEL, exactly
 * like #category. Typing into them does nothing, which is why brand, size and
 * condition were never filled. Each panel was read live on 18 Aug 2026:
 *
 *   #brand      -> #brand-search-input, rows are input[id^="brand-radio-"]
 *   #size       -> grid of labels reading "L / US 12"
 *   #condition  -> list of five rows titled New with tags / New without tags /
 *                  Very good / Good / Satisfactory
 */
async function openPanel(fieldSel, choose) {
  const field = document.querySelector(fieldSel);
  if (!field) return false;
  pointerClick(field);
  await wait(800);
  const ok = await choose(field);
  if (!ok) {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(300);
  }
  return ok;
}

async function setVintedBrand(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const ok = await openPanel("#brand", async (field) => {
      const search = document.querySelector("#brand-search-input");
      if (!search) return false;
      setNativeValue(search, String(candidate));
      await wait(1200);
      const want = String(candidate).trim().toLowerCase();
      // Exact and unambiguous, or nothing: the Aloye incident rule.
      const rows = [...document.querySelectorAll('input[id^="brand-radio-"]')]
        .map((radio) => ({ radio, holder: radio.closest("li, [class*=item], [class*=cell]") }))
        .filter((r) => r.holder && r.holder.innerText.trim().toLowerCase() === want);
      if (rows.length !== 1) return false;
      pointerClick(rows[0].holder.querySelector("label") ?? rows[0].radio);
      await wait(900);
      return field.value.trim().toLowerCase() === want;
    });
    if (ok) return candidate;
  }
  return null;
}

async function setVintedSize(size) {
  if (!size) return false;
  return openPanel("#size", async (field) => {
    const want = String(size).trim().toLowerCase();
    // Options read "L / US 12" — the leading segment is the size itself.
    const target = [...document.querySelectorAll("label, [role=option], li")]
      .filter((e) => e.offsetParent !== null)
      .find((e) => e.innerText.trim().split("/")[0].trim().toLowerCase() === want);
    if (!target) return false;
    pointerClick(target);
    await wait(800);
    return Boolean(field.value);
  });
}

/**
 * Flock's condition -> Vinted's label. nwt/excellent/good/fair on one side,
 * five fixed rows on the other. excellent maps to "Very good" because
 * Vinted's "New without tags" asserts the item is UNUSED — a claim we can't
 * make for a worn-but-clean garment.
 */
const VINTED_CONDITION = {
  nwt: "New with tags",
  excellent: "Very good",
  good: "Good",
  fair: "Satisfactory",
};

async function setVintedCondition(condition) {
  const label = VINTED_CONDITION[condition];
  if (!label) return false;
  return openPanel("#condition", async (field) => {
    const want = label.toLowerCase();
    const target = [...document.querySelectorAll("label, [role=option], li")]
      .filter((e) => e.offsetParent !== null)
      .find((e) => (e.innerText.trim().split("\n")[0] ?? "").trim().toLowerCase() === want);
    if (!target) return false;
    pointerClick(target);
    await wait(800);
    return Boolean(field.value);
  });
}
async function attachPhotos(urls) {
  const input = document.querySelector(FIELD.photos);
  if (!input || urls.length === 0) return false;

  const transfer = new DataTransfer();
  for (const [i, url] of urls.entries()) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const blob = await response.blob();
    transfer.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || "image/jpeg" }));
  }
  if (transfer.files.length === 0) return false;

  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(3000); // uploads must finish before the form will submit
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
      ${blocked.length ? `Vinted wants: ${blocked.join(" · ")}.` : "Review it, then hit Vinted's own upload button."}
    </span>
    <button id="threader-close" style="margin-left:auto;background:none;border:1px solid #5C635E;
      color:inherit;padding:6px 11px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;
  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
}


/* --------------------------------------------------------------------------
   Category.

   #category is a READ-ONLY input, which is why setNativeValue never touched it
   and every fill skipped the field. Clicking it opens a dropdown carrying its
   own "Find a category" search box; typing there returns flat leaf results that
   each spell out their full path, e.g.

     Hoodies & sweatshirts / Women > Clothing > Jumpers & sweaters
     Hoodies & sweatshirts / Men   > Clothing > Sweaters & sweatshirts

   Searching beats walking the tree: the tree is four levels deep and its shape
   differs per department, while the search results hand us the department in
   the text — which is exactly what makes the choice safe.

   Read off the live form 18 Aug 2026. The clickable target is a
   div[role="button"] inside the li, not the li itself; clicking the li does
   nothing at all.
   -------------------------------------------------------------------------- */

const GARMENT_SYNONYMS = {
  pullover: ["sweatshirt", "sweater", "jumper"],
  sweatshirt: ["sweatshirt"],
  hoodie: ["hoodie"],
  jumper: ["jumper", "sweater"],
  sweater: ["sweater", "jumper"],
  tee: ["t-shirt"],
  tshirt: ["t-shirt"],
  shirt: ["shirt"],
  jeans: ["jeans"],
  jacket: ["jacket"],
  coat: ["coat"],
  dress: ["dress"],
  skirt: ["skirt"],
  leggings: ["leggings"],
  shorts: ["shorts"],
  boots: ["boots"],
  sneakers: ["sneakers", "trainers"],
  bag: ["bag"],
};

/** Search terms to try, most specific first. */
function categoryQueries(listing) {
  const words = String(listing.title || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const queries = [];
  for (const w of words) {
    for (const syn of GARMENT_SYNONYMS[w] ?? []) {
      if (!queries.includes(syn)) queries.push(syn);
    }
  }
  if (listing.category && listing.category.toLowerCase() !== "other") {
    queries.push(String(listing.category).toLowerCase());
  }
  return queries;
}

function departmentOfPath(path) {
  if (/\bkids\b|\bgirls\b|\bboys\b/i.test(path)) return "kids";
  if (/\bunisex\b/i.test(path)) return "unisex";
  if (/\bwomen\b/i.test(path)) return "women";
  if (/\bmen\b/i.test(path)) return "men";
  return null;
}

/** Leaf result rows currently on screen: "Leaf / Dept > A > B". */
function categoryRows() {
  return [...document.querySelectorAll("li")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ el, text: el.innerText.trim().replace(/\n+/g, " / ") }))
    .filter((r) => r.text.includes(">") && r.text.split(" / ").length === 2);
}

async function setCategory(listing) {
  const field = document.querySelector(FIELD.category);
  if (!field) return { ok: false, why: "no category field" };

  // Without a department every gendered option is a coin flip, and Vinted
  // returns mostly Men rows for a query like "sweatshirt". Refuse instead.
  const department = listing.department || null;
  if (!department) {
    return { ok: false, why: "no department recorded on the item" };
  }

  pointerClick(field);
  await wait(700);

  const search = [...document.querySelectorAll("input")].find(
    (i) => i.offsetParent !== null && i.placeholder === "Find a category"
  );
  if (!search) return { ok: false, why: "category search box didn't open" };

  for (const query of categoryQueries(listing)) {
    setNativeValue(search, query);
    await wait(1200);

    const eligible = categoryRows().filter((r) => {
      const d = departmentOfPath(r.text);
      return d === null || d === "unisex" || department === "unisex" || d === department;
    });
    if (eligible.length === 0) continue;

    // Prefer a leaf whose own name contains the query over a distant cousin.
    const scored = eligible
      .map((r) => {
        const leaf = r.text.split(" / ")[0].toLowerCase();
        return { r, score: leaf.includes(query) ? 2 : 1 };
      })
      .sort((a, b) => b.score - a.score);

    const chosen = scored[0].r;
    const target = chosen.el.querySelector('[role="button"]') || chosen.el;
    pointerClick(target);
    await wait(1000);

    if (field.value) return { ok: true, chose: chosen.text };
    // Value didn't take; try the next query rather than leaving it half-open.
  }

  return { ok: false, why: "no category matched this item's department" };
}


/**
 * Click Upload — only when the form is actually complete.
 *
 * Gated on `blocked`, the required fields still empty. Submitting a form with
 * holes in it doesn't publish a listing, it produces a rejected or half-made
 * one that then has to be found and cleaned up. Off unless the seller ticks
 * "Submit automatically" in the popup.
 */
async function submitListing() {
  const button = document.querySelector('[data-testid="upload-form-save-button"]');
  if (!button || button.disabled) return null;
  button.click();
  await wait(3000);
  return "Upload";
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

    if (setText(FIELD.title, p.title)) filled.push("title");
    else missing.push("title");

    if (setText(FIELD.description, p.description)) filled.push("description");
    else missing.push("description");

    if (setText(FIELD.price, p.price)) filled.push("price");
    else missing.push("price");

    // Category first — brand, size and condition are rendered off the back of it.
    //
    // #category is read-only, so the old pick() could never set it; the field
    // was skipped on every run. setCategory drives Vinted's own category search
    // instead, and refuses when the item has no department, because Vinted
    // returns mostly Men rows for a query like "sweatshirt" and choosing blind
    // is how a women's garment lands under Men's.
    const categoryResult = await setCategory({
      title: p.title ?? item.title,
      category: item.category,
      department: item.department,
    });
    if (categoryResult.ok) filled.push("category");
    else missing.push(`category (${categoryResult.why})`);

    await wait(1400);

    // Try the brand as recorded, then any name the same company is listed
    // under here — Vinted has "Alo Yoga" and no bare "Alo", so a correctly
    // labelled item was getting no brand at all. Still exact equality on each
    // candidate: an alias is a statement that two names are the same company,
    // not a licence to prefix-match, which is what once put "Aloye" on a live
    // Alo listing.
    const candidates = item.brandCandidates?.length ? item.brandCandidates : [item.brand];
    const brandSet = item.brand ? await setVintedBrand(candidates) : null;
    if (brandSet) {
      filled.push(brandSet === item.brand ? "brand" : `brand (as "${brandSet}")`);
    } else if (item.brand) {
      missing.push(`brand (no exact match for "${item.brand}")`);
    }

    if (await setVintedSize(item.size)) filled.push("size");
    else if (item.size) missing.push("size");

    if (await setVintedCondition(item.condition)) filled.push(`condition (${VINTED_CONDITION[item.condition]})`);
    else missing.push("condition");

    await wait(700);
    const blocked = unfilledControls();

    if (Boolean(message.autoSubmit) && blocked.length === 0) {
      const clicked = await submitListing();
      if (clicked) filled.push(`clicked ${clicked}`);
    } else if (!message.autoSubmit) {
      missing.push("auto-submit off — tick it in the popup");
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
