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
    <strong style="font-weight:650;white-space:nowrap">Threader filled ${filled.length}</strong>
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
    if (await pick(FIELD.category, item.category, { acceptFirst: false })) filled.push("category");
    else missing.push("category");

    await wait(1400);

    const brandEl = item.brand && findByLabel([/brand/]);
    if (brandEl && (await pick(`#${brandEl.id}`, item.brand, { exact: true }))) filled.push("brand");
    else if (item.brand) missing.push(`brand (no exact match for "${item.brand}")`);

    const sizeEl = item.size && findByLabel([/\bsize\b/]);
    if (sizeEl && (await pick(`#${sizeEl.id}`, item.size, { exact: true }))) filled.push("size");
    else if (item.size) missing.push("size");

    const conditionEl = findByLabel([/condition/]);
    if (conditionEl && (await pick(`#${conditionEl.id}`, item.condition))) filled.push("condition");
    else missing.push("condition");

    await wait(700);
    const blocked = unfilledControls();

    banner(filled, missing, blocked);
    sendResponse({ filled, missing, blocked });
  })();

  return true;
});
