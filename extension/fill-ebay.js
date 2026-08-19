/**
 * Fills eBay. Selectors read off the live signed-in flow on 19 Aug 2026 —
 * see SELECTORS.md.
 *
 * eBay is four screens, not one:
 *
 *   /sl/prelist/identify   1. category  2. find a match  3. condition
 *   /lstng?draftId=...     the actual listing form
 *
 * So this script answers on both, and background.js runs it twice — once to
 * get through the prelist, once to fill the form it lands on.
 *
 * IDS ARE USELESS HERE. eBay's React ids look like
 * "s0-1-1-24-10-@prelist-radix-body-2-20-@side-pane-1-@dialog-16-..." and are
 * regenerated per render. Everything below keys off `name` or `aria-label`.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const byName = (name) => document.querySelector('[name="' + name + '"]');

/** The visible text of a row, for controls whose label lives on an ancestor. */
function rowText(el) {
  let node = el;
  for (let i = 0; i < 5 && node; i++) {
    node = node.parentElement;
    const text = (node && node.innerText ? node.innerText : "").trim();
    if (text && text.length < 160) return text;
  }
  return "";
}

/* ------------------------------------------------------------------ prelist */

/**
 * eBay's category search returns FULL PATHS, and the department is in them:
 *
 *   Clothing, Shoes & Accessories > Women > Women's Shoes > Flats
 *   Clothing, Shoes & Accessories > Men   > Men's Shoes   > Dress Shoes
 *
 * Taking the first match files a men's shoe under Womenswear. This is the same
 * trap as Depop's three identical "Loafers", and the rule is the same: match
 * the department or select nothing.
 */
const EBAY_DEPARTMENT = { men: "Men", mens: "Men", women: "Women", womens: "Women", kids: "Kids" };

/**
 * What to type into eBay's category search for one of our categories. A search
 * TERM, not a category name — eBay resolves it to real leaves and we pick from
 * those by exact path.
 */
const EBAY_SEARCH_TERM = {
  footwear: "Loafers",
  denim: "Jeans",
  tops: "T-Shirts",
  shirts: "Casual Shirts",
  knitwear: "Sweaters",
  sweats: "Sweatshirts & Hoodies",
  fleece: "Sweatshirts & Hoodies",
  outerwear: "Coats & Jackets",
  trousers: "Pants",
  dresses: "Dresses",
  activewear: "Activewear",
  accessories: "Accessories",
};

/**
 * eBay's condition names are CATEGORY-DEPENDENT — footwear says "New with
 * box", not "New with tags". So try the likely names in order and take the
 * first that actually exists, rather than asserting one vocabulary across
 * every category the way the Depop table did until this morning.
 */
const EBAY_CONDITION = {
  nwt: ["New with box", "New with tags", "New without tags", "New"],
  excellent: ["Pre-owned - Excellent", "Pre-owned", "Used"],
  good: ["Pre-owned - Good", "Pre-owned", "Used"],
  fair: ["Pre-owned - Fair", "Pre-owned", "Used"],
};

async function drivePrelist(item) {
  const steps = [];
  const notes = [];

  const catBox = document.querySelector('input[aria-label="Enter a category value"]');
  if (catBox) {
    const term = EBAY_SEARCH_TERM[String(item.category == null ? "" : item.category).trim().toLowerCase()];
    if (!term) {
      notes.push('category — no eBay search term for "' + item.category + '"');
    } else {
      catBox.focus();
      setNativeValue(catBox, term);
      await wait(2200);

      const wantDept = EBAY_DEPARTMENT[String(item.department == null ? "" : item.department).trim().toLowerCase()];
      const paths = [...document.querySelectorAll('input[type="radio"]')].map((r) => ({
        radio: r,
        path: rowText(r),
      }));

      const match = wantDept
        ? paths.find((p) => new RegExp(">\\s*" + wantDept + "\\s*>").test(p.path))
        : null;

      if (!match) {
        notes.push(
          wantDept
            ? 'category — nothing under "' + wantDept + '" for "' + term + '"; pick it yourself'
            : "category — no department on this garment, so the right one can't be told apart"
        );
      } else {
        match.radio.click();
        await wait(700);
        const done = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Done");
        if (done) done.click();
        steps.push("category (" + match.path.split(">").pop().trim() + ")");
        await wait(3000);
      }
    }
  }

  // Always decline the catalog match. Matching a secondhand garment to a
  // product record staples someone else's specifications onto it — the same
  // reason StockX's catalog is dangerous rather than helpful here.
  const skip = [...document.querySelectorAll("button")].find((b) =>
    /continue without match/i.test(b.innerText)
  );
  if (skip) {
    skip.click();
    steps.push("skipped the catalog match");
    await wait(3500);
  }

  const wanted = EBAY_CONDITION[String(item.condition == null ? "" : item.condition).trim().toLowerCase()] || [];
  const cards = [...document.querySelectorAll('button, [role="radio"], label, div[role="button"]')];
  let chose = null;
  for (const name of wanted) {
    const card = cards.find((c) => c.innerText.trim().split("\n")[0].trim() === name);
    if (card) {
      card.click();
      chose = name;
      break;
    }
  }

  if (chose) {
    steps.push("condition (" + chose + ")");
    await wait(800);
    const cont = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Continue");
    if (cont) cont.click();
    await wait(1000);
  } else if (wanted.length) {
    notes.push("condition — none of " + wanted.join(" / ") + " on this category's list");
  }

  return { stage: "prelist", steps, notes };
}

/* --------------------------------------------------------------------- form */

/**
 * The description is a rich text editor in an iframe, not a textarea. Writing
 * into the iframe's own document is the only thing that takes.
 */
function setDescription(text) {
  const frame = document.getElementById("se-rte-frame__summary");
  const doc = frame && frame.contentDocument;
  if (!doc || !doc.body) return false;

  doc.body.innerHTML = String(text)
    .split("\n")
    .map((line) => (line.trim() ? "<p>" + line + "</p>" : "<p><br></p>"))
    .join("");
  doc.body.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

/**
 * Item specifics are input[name^="search-box-attributes"], where the suffix is
 * the aspect name — punctuated inconsistently ("attributesBrand" but
 * "attributes.US Shoe Size"). Normalise both sides rather than guessing which
 * form a given aspect takes.
 */
function findAspect() {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const inputs = [...document.querySelectorAll('input[name^="search-box-attributes"]')];
  for (const want of arguments) {
    const target = inputs.find(
      (el) => norm(el.name.replace(/^search-box-attributes\.?/, "")) === norm(want)
    );
    if (target) return target;
  }
  return null;
}

/** Type into an aspect box and take an exact match from what it offers. */
async function setAspect(input, value) {
  if (!input || !value) return false;

  input.focus();
  setNativeValue(input, String(value));
  await wait(1200);

  const want = String(value).trim().toLowerCase();

  // Aspect suggestions are [role="menuitemradio"] inside a [role="menu"] —
  // NOT [role="option"], which on this page belongs to unrelated controls
  // (Buy It Now, the handling-time picker). Searching the document for
  // role=option found six of those and none of these.
  //
  // Scoped to the aspect's own container as well, because two aspects open at
  // once would otherwise let one steal the other's answer.
  let scope = input;
  for (let i = 0; i < 6 && scope.parentElement; i++) scope = scope.parentElement;

  // NOT filtered on offsetParent. eBay renders the suggestion menu positioned
  // fixed, and offsetParent is null for fixed elements — so the usual
  // visible-only filter threw away every real suggestion and left only the
  // unrelated role=option controls elsewhere on the page. Same trap as the
  // hidden file input, one floor up.
  const options = [...scope.querySelectorAll('[role="menuitemradio"], [role="option"]')];
  const exact = options.find((o) => o.textContent.trim().toLowerCase() === want);

  if (exact) {
    exact.click();
    await wait(400);
    return true;
  }

  // Several aspects are labelled "Search or enter your own". Keeping the typed
  // text there is honest: it is the seller's own word for their own garment,
  // not a guess at eBay's vocabulary.
  const label = input.getAttribute("aria-label") || "";
  if (/enter your own/i.test(label)) {
    input.blur();
    return true;
  }

  setNativeValue(input, "");
  input.blur();
  return false;
}

/**
 * EU shoe sizes onto the US scale, same table as the Depop filler.
 *
 * Approximate on purpose and reported as such: brands disagree by half a size
 * and Italian makers run their own.
 */
const EU_TO_US_SHOE = {
  men: { 39: "6.5", 40: "7", 41: "8", 42: "8.5", 43: "9.5", 44: "10", 45: "11", 46: "12", 47: "13", 48: "14" },
  women: { 35: "5", 36: "5.5", 37: "6.5", 38: "7.5", 39: "8.5", 40: "9.5", 41: "10.5", 42: "11.5" },
};

function usShoeSize(size, department) {
  const raw = String(size == null ? "" : size).trim();
  if (!/^[0-9]{2}$/.test(raw)) return null;
  const eu = Number(raw);
  if (eu < 34 || eu > 50) return null;
  const womens = String(department == null ? "" : department).trim().toLowerCase().indexOf("wom") === 0;
  return (womens ? EU_TO_US_SHOE.women : EU_TO_US_SHOE.men)[eu] || null;
}

async function attachPhotos(urls) {
  if (!urls || urls.length === 0) return 0;

  // NOT filtered on visibility: eBay's file input sits behind its own drop
  // zone, so offsetParent is null and the usual visible-only filter finds
  // nothing at all.
  const input = document.querySelector('input[type="file"][multiple]');
  if (!input) return 0;

  const files = [];
  for (const [i, url] of urls.slice(0, 24).entries()) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      files.push(new File([blob], "photo-" + (i + 1) + ".jpg", { type: blob.type || "image/jpeg" }));
    } catch (error) {
      // One unreachable signed URL shouldn't lose the rest.
    }
  }
  if (files.length === 0) return 0;

  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(4000);
  return files.length;
}

function banner(filled, missing) {
  const old = document.getElementById("flock-banner");
  if (old) old.remove();

  const el = document.createElement("div");
  el.id = "flock-banner";
  el.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:12px 14px;" +
    "background:#111;color:#fff;font:13px/1.45 system-ui;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3)";
  el.innerHTML =
    "<strong>Flock — eBay</strong><br>" +
    (filled.length ? "Filled: " + filled.join(", ") : "Nothing filled.") +
    (missing.length ? '<br><span style="color:#ffb4a2">Do by hand: ' + missing.join("; ") + "</span>" : "") +
    '<br><span style="opacity:.6">Check it, then list it yourself.</span>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 30000);
}

/** What the page thinks is still wrong. Ends the screenshot loop. */
function formReport() {
  const controls = [];
  const errors = new Set();

  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.type === "hidden") continue;
    const label = (el.getAttribute("aria-label") || el.name || "").trim().slice(0, 60);
    if (!label) continue;
    controls.push({
      id: el.name || undefined,
      label,
      kind: el.type || "text",
      value: String(el.value || "").slice(0, 60),
    });
  }

  for (const el of document.querySelectorAll('[role="alert"], [aria-live]')) {
    const text = (el.textContent || "").trim();
    if (text && text.length < 200) errors.add(text);
  }

  return { controls: controls.slice(0, 120), errors: [...errors], url: location.href };
}

async function fillForm(payload) {
  const item = payload.item || {};
  const filled = [];
  const missing = [];

  const photos = await attachPhotos(payload.photos || []);
  if (photos > 0) filled.push(photos + " photos");
  else missing.push("photos");

  const title = byName("title");
  if (title && payload.title) {
    setNativeValue(title, String(payload.title).slice(0, 80)); // eBay's limit
    filled.push("title");
  } else {
    missing.push("title");
  }

  if (payload.description && setDescription(payload.description)) filled.push("description");
  else missing.push("description");

  const price = byName("price");
  if (price && payload.price) {
    setNativeValue(price, String(payload.price));
    filled.push("price");
  } else {
    missing.push("price");
  }

  const quantity = byName("quantity");
  if (quantity) setNativeValue(quantity, "1");

  // Item specifics. Which of these exist depends on the category, so an absent
  // box is normal and only worth reporting when we had a value for it.
  const aspects = [
    ["Brand", item.brand],
    ["Color", item.color_primary || item.color],
    ["Department", item.department],
    ["UpperMaterial", item.material_primary || item.material],
    ["Style", item.category],
  ];

  for (const pair of aspects) {
    const name = pair[0];
    const value = pair[1];
    if (!value) continue;
    const input = findAspect(name);
    if (!input) continue;
    if (await setAspect(input, value)) filled.push(name.toLowerCase() + " (" + value + ")");
    else missing.push(name.toLowerCase() + ' — no eBay match for "' + value + '"');
  }

  // Size is its own problem: eBay splits it BY SCALE, and the US box will not
  // take "42" any more than Depop's would. Same conversion, same honesty —
  // the banner shows both numbers, because half a size of disagreement between
  // brands is normal and the seller is the one who knows.
  if (item.size) {
    const sizeInput = findAspect("US Shoe Size", "UK Shoe Size", "Size");
    if (sizeInput) {
      const usScale = /US/i.test(sizeInput.name);
      const converted = usScale ? usShoeSize(item.size, item.department) : null;
      const offer = converted ?? item.size;
      if (converted) filled.push("size converted from EU " + item.size + " — check it");

      if (await setAspect(sizeInput, offer)) {
        filled.push("size (" + offer + ")");
      } else {
        missing.push(
          'size — "' + offer + "\" isn't on eBay's " +
            (/US/i.test(sizeInput.name) ? "US" : "UK") +
            " scale for this category"
        );
      }
    }
  }

  // Never submitted. An eBay listing is public the moment it goes up and costs
  // money to end early.
  missing.push("not listed — review it and press List it yourself");

  banner(filled, missing);
  return { filled, missing, blocked: [], report: formReport() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Answers to both names: background.js sends "apply" for the fill, and
  // "fill" for the extra prelist round that only eBay needs.
  if (message.type !== "apply" && message.type !== "fill") return;

  (async () => {
    const payload = message.payload || {};
    // Which of eBay's four screens are we on?
    if (location.pathname.indexOf("/sl/prelist") === 0) {
      sendResponse(await drivePrelist(payload.item || {}));
      return;
    }
    sendResponse(await fillForm(payload));
  })().catch((error) => {
    console.error("[flock] eBay fill crashed:", error);
    sendResponse({ error: error.message });
  });

  return true;
});
