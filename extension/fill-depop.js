/**
 * Fills Depop's sell form, then stops.
 *
 * SELECTORS ARE THE FRAGILE PART. Depop is a React app and ships new class names
 * regularly, so everything DOM-specific lives in the map below — when a field
 * stops filling, fix it there and nowhere else. The script reports which fields
 * it couldn't find rather than failing silently, so a broken selector shows up
 * as "couldn't fill: price" instead of a mysteriously half-empty form.
 *
 * Verify against the live page before trusting these.
 */

const SELECTORS = {
  photos: 'input[type="file"]',
  description: 'textarea[name="description"], textarea[id*="description" i], textarea',
  price: 'input[name="price"], input[id*="price" i]',
  // Depop's category, size, and condition are custom dropdowns rather than
  // <select>, so they're left to the user deliberately — see the banner text.
};

/** React tracks input state internally; a plain value assignment gets overwritten. */
function setNativeValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  ).set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function attachPhotos(urls) {
  const input = document.querySelector(SELECTORS.photos);
  if (!input || urls.length === 0) return false;

  const transfer = new DataTransfer();
  for (const [index, url] of urls.entries()) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const blob = await response.blob();
    transfer.items.add(new File([blob], `photo-${index + 1}.jpg`, { type: blob.type || "image/jpeg" }));
  }

  if (transfer.files.length === 0) return false;
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function banner(filled, missing, payload) {
  document.getElementById("threader-banner")?.remove();

  const el = document.createElement("div");
  el.id = "threader-banner";
  el.style.cssText = `
    position:fixed; top:0; left:0; right:0; z-index:2147483647;
    background:#1A1F1D; color:#EFF0EC; font:14px/1.5 system-ui,sans-serif;
    padding:14px 18px; display:flex; gap:16px; align-items:center;
    box-shadow:0 2px 12px rgba(0,0,0,.3);`;

  const tags = (payload.tags || []).join(" ");
  el.innerHTML = `
    <strong style="font-weight:650">Threader filled ${filled.length} field${filled.length === 1 ? "" : "s"}.</strong>
    <span style="opacity:.75">
      ${missing.length ? `Couldn't fill: ${missing.join(", ")}. ` : ""}
      Set category, size, and condition yourself, then review everything and hit Depop's own publish button.
    </span>
    ${tags ? `<button id="threader-tags" style="margin-left:auto;background:#3A5570;color:#fff;border:0;padding:7px 12px;border-radius:3px;cursor:pointer;font:inherit">Copy tags</button>` : ""}
    <button id="threader-close" style="background:none;border:1px solid #5C635E;color:inherit;padding:7px 12px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;

  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
  document.getElementById("threader-tags")?.addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(tags);
    event.target.textContent = "Copied";
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;

  (async () => {
    const payload = message.payload;
    const filled = [];
    const missing = [];

    const description = document.querySelector(SELECTORS.description);
    if (description) {
      setNativeValue(description, payload.description || "");
      filled.push("description");
    } else {
      missing.push("description");
    }

    const price = document.querySelector(SELECTORS.price);
    if (price) {
      setNativeValue(price, String(payload.price ?? ""));
      filled.push("price");
    } else {
      missing.push("price");
    }

    try {
      if (await attachPhotos(payload.photos || [])) filled.push("photos");
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    banner(filled, missing, payload);
    sendResponse({ filled, missing });
  })();

  return true;
});
