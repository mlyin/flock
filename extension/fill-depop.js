/**
 * Fills Depop's sell form.
 *
 * Fields are found by their visible label text, not by class name. Depop is a
 * React app that ships new hashed class names constantly; the words "Category"
 * and "Package size" change far less often than the markup around them. When
 * something stops filling, the label is the thing to check.
 *
 * Auto-submit is opt-in and only fires when nothing is left blank. Clicking
 * Continue on an incomplete form just trips Depop's own validation, so
 * "submitted" would mean "failed" — worse than stopping.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** React overwrites plain value assignment; go through the native setter. */
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Walk up from a label to the control it describes. */
function fieldByLabel(text) {
  const labels = [...document.querySelectorAll("label, span, div, p")].filter(
    (el) =>
      el.textContent?.trim().toLowerCase() === text.toLowerCase() &&
      el.children.length === 0
  );

  for (const label of labels) {
    const forId = label.getAttribute("for");
    if (forId) {
      const byId = document.getElementById(forId);
      if (byId) return byId;
    }
    // Otherwise the control is usually the next interactive thing after the label.
    let node = label.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      const control = node.querySelector("select, input:not([type=file]), [role=combobox], [role=button]");
      if (control) return control;
    }
  }
  return null;
}

/** Depop's dropdowns are custom widgets; open, then click the matching option. */
async function chooseOption(control, wanted) {
  if (!control || !wanted) return false;

  if (control.tagName === "SELECT") {
    const match = [...control.options].find(
      (o) => o.textContent.trim().toLowerCase() === String(wanted).toLowerCase()
    );
    if (!match) return false;
    control.value = match.value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  control.click();
  await wait(450);

  const option = [...document.querySelectorAll('[role=option], li, [role=menuitem]')].find(
    (el) => el.textContent?.trim().toLowerCase() === String(wanted).toLowerCase()
  );
  if (!option) {
    document.body.click(); // close the menu we opened
    return false;
  }
  option.click();
  await wait(250);
  return true;
}

/** Depop suggests categories as plain chips — cheapest reliable win on the page. */
function pickSuggestedCategory(preferred) {
  const chips = [...document.querySelectorAll("button")].filter((b) => /\s\/\s/.test(b.textContent ?? ""));
  if (chips.length === 0) return false;

  const chip = preferred
    ? chips.find((c) => c.textContent.trim().toLowerCase() === preferred.toLowerCase()) ?? chips[0]
    : chips[0];

  chip.click();
  return chip.textContent.trim();
}

async function attachPhotos(urls) {
  const input = document.querySelector('input[type="file"]');
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
  return true;
}

/**
 * Anything Depop is complaining about, in its own words.
 *
 * Must only read *rendered* text. An earlier version walked every element and
 * matched Depop's bundled translation JSON inside a <script> tag, which put ten
 * kilobytes of their i18n file into the banner.
 */
function validationErrors() {
  const seen = new Set();

  return [...document.querySelectorAll("p, span, div, label")]
    .filter((el) => {
      if (el.children.length > 0) return false; // leaf nodes only
      if (el.closest("script, style, noscript, template")) return false;
      const text = el.textContent?.trim() ?? "";
      if (text.length === 0 || text.length > 80) return false; // real messages are short
      if (!/required|invalid|please (fill|enter|select)/i.test(text)) return false;
      return el.offsetParent !== null; // and actually visible
    })
    .map((el) => el.textContent.trim())
    .filter((text) => !seen.has(text) && seen.add(text))
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
    <strong style="font-weight:650;white-space:nowrap">Threader filled ${filled.length}</strong>
    <span style="opacity:.8">
      ${missing.length ? `Couldn't fill: ${missing.join(", ")}. ` : ""}
      ${blocked.length ? `Depop still wants: ${blocked.join(" · ")}.` : "Looks complete — review it and publish."}
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
    const autoSubmit = Boolean(message.autoSubmit);
    const filled = [];
    const missing = [];

    const description = fieldByLabel("Description") ?? document.querySelector("textarea");
    if (description) {
      setNativeValue(description, p.description || "");
      filled.push("description");
    } else missing.push("description");

    const price =
      fieldByLabel("Item price") ?? document.querySelector('input[name="price"], input[id*="price" i]');
    if (price) {
      setNativeValue(price, String(p.price ?? ""));
      filled.push("price");
    } else missing.push("price");

    try {
      if (await attachPhotos(p.photos || [])) filled.push("photos");
      else missing.push("photos");
    } catch (error) {
      missing.push(`photos (${error.message})`);
    }

    const category = pickSuggestedCategory(p.item?.depop_category);
    if (category) filled.push(`category (${category})`);
    else missing.push("category");

    // Depop's condition wording differs from ours.
    const CONDITION = { nwt: "Brand new", excellent: "Like new", good: "Used - excellent", fair: "Used - fair" };
    if (await chooseOption(fieldByLabel("Condition"), CONDITION[p.item?.condition])) filled.push("condition");
    else missing.push("condition");

    if (p.item?.brand && (await chooseOption(fieldByLabel("Brand"), p.item.brand))) filled.push("brand");
    else if (p.item?.brand) missing.push("brand");

    if (p.item?.package_size && (await chooseOption(fieldByLabel("Package size"), p.item.package_size)))
      filled.push("package size");
    else missing.push("package size");

    await wait(600);
    const blocked = validationErrors();

    if (autoSubmit && blocked.length === 0) {
      const submit = [...document.querySelectorAll("button")].find((b) =>
        /^(continue|next|publish|list it)$/i.test(b.textContent?.trim() ?? "")
      );
      if (submit) {
        submit.click();
        filled.push("submitted");
      }
    }

    banner(filled, missing, blocked);
    sendResponse({ filled, missing, blocked });
  })();

  return true;
});
