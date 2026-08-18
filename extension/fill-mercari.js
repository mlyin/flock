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
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
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

    // Category is a button opening a modal picker, and shipping depends on it.
    // Both are left to the seller — see the banner.
    missing.push("category (picker)", "shipping");

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
