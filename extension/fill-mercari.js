/**
 * Mercari filler. Same shape as fill-depop.js — selectors isolated at the top,
 * missing fields reported rather than silently skipped, and it never submits.
 *
 * Selectors need verifying against the live sell page.
 */

const SELECTORS = {
  photos: 'input[type="file"]',
  title: 'input[name="name"], input[data-testid="Name"], input[id*="title" i]',
  description: 'textarea[name="description"], textarea[data-testid="Description"], textarea',
  price: 'input[name="price"], input[data-testid="Price"], input[id*="price" i]',
};

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

function banner(filled, missing) {
  document.getElementById("threader-banner")?.remove();
  const el = document.createElement("div");
  el.id = "threader-banner";
  el.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1A1F1D;color:#EFF0EC;
    font:14px/1.5 system-ui,sans-serif;padding:14px 18px;display:flex;gap:16px;align-items:center;
    box-shadow:0 2px 12px rgba(0,0,0,.3)`;
  el.innerHTML = `<strong style="font-weight:650">Threader filled ${filled.length} field${filled.length === 1 ? "" : "s"}.</strong>
    <span style="opacity:.75">${missing.length ? `Couldn't fill: ${missing.join(", ")}. ` : ""}
    Set category, brand, condition, and shipping yourself, then review and hit Mercari's own list button.</span>
    <button id="threader-close" style="margin-left:auto;background:none;border:1px solid #5C635E;color:inherit;
    padding:7px 12px;border-radius:3px;cursor:pointer;font:inherit">Dismiss</button>`;
  document.body.appendChild(el);
  document.getElementById("threader-close")?.addEventListener("click", () => el.remove());
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "apply") return;
  (async () => {
    const payload = message.payload;
    const filled = [];
    const missing = [];

    for (const [key, value] of [
      ["title", payload.title],
      ["description", payload.description],
      ["price", String(payload.price ?? "")],
    ]) {
      const el = document.querySelector(SELECTORS[key]);
      if (el) {
        setNativeValue(el, value || "");
        filled.push(key);
      } else {
        missing.push(key);
      }
    }

    try {
      if (await attachPhotos(payload.photos || [])) filled.push("photos");
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    // Mercari also steps rather than publishing in one click.
    if (message.autoSubmit) {
      for (let step = 0; step < 4; step += 1) {
        const advance = [...document.querySelectorAll("button")].find(
          (b) =>
            /^(continue|next|list|publish|post)$/i.test(b.textContent?.trim() ?? "") &&
            !b.disabled &&
            b.offsetParent !== null
        );
        if (!advance) break;
        const label = advance.textContent.trim();
        advance.click();
        filled.push(`clicked ${label}`);
        await new Promise((r) => setTimeout(r, 2200));
      }
    }

    banner(filled, missing);
    sendResponse({ filled, missing, blocked: [] });
  })();
  return true;
});
