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

    // Designer stays disabled until a category is picked, so this usually needs
    // a second pass after the seller sets the cascade.
    if (item.brand && (await pickDesigner(item.brand))) filled.push("designer");
    else if (item.brand) missing.push(`designer (set category first, then "${item.brand}")`);

    await wait(600);
    const blocked = unfilledControls();

    banner(filled, missing, blocked);
    sendResponse({ filled, missing, blocked });
  })();

  return true;
});
