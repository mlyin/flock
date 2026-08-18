/**
 * Reports the structure of whatever sell form it's injected into.
 *
 * This exists because reading a marketplace's DOM used to mean pointing browser
 * automation at it, and that is itself detectable: Poshmark refused a request
 * outright while a debugger was attached, and Mercari and Facebook serve
 * automated tabs a stripped or logged-out page. The extension is already a
 * normal part of the seller's browser, so a probe running here sees the real
 * form and produces no signal a marketplace could object to.
 *
 * It only reads. No value is set, nothing is clicked, nothing is submitted.
 *
 * Deliberately reports SHAPE, not just names: whether a control is a plain
 * input, a read-only panel opener, or a role-bearing div. Vinted cost two full
 * rounds of failed fills because size was div[role="checkbox"] and condition was
 * div[role="radio"] while the filler searched for label/option/li — a name-only
 * dump would have hidden exactly that.
 */

const text = (el) => (el?.innerText ?? el?.textContent ?? "").trim().replace(/\s+/g, " ");

function labelFor(el) {
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l) return text(l).slice(0, 40);
  }
  const wrap = el.closest("label");
  if (wrap) return text(wrap).slice(0, 40);
  return (el.getAttribute("aria-label") ?? el.placeholder ?? "").slice(0, 40);
}

const visible = (el) => el.offsetParent !== null || el.type === "file";

function fields() {
  return [...document.querySelectorAll("input, textarea, select")].filter(visible).map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || null,
    id: el.id || null,
    name: el.name || null,
    testid: el.getAttribute("data-testid"),
    label: labelFor(el),
    // The distinction that matters: a readonly input is a panel opener, and no
    // amount of setNativeValue will ever fill it.
    readOnly: el.readOnly || null,
    disabled: el.disabled || null,
    value: el.value ? String(el.value).slice(0, 30) : null,
  }));
}

/** Role-bearing elements are how three of Vinted's four panels are built. */
function roles() {
  const counts = {};
  for (const el of document.querySelectorAll("[role]")) {
    if (!visible(el)) continue;
    const role = el.getAttribute("role");
    if (!/checkbox|radio|option|menuitem|combobox|listbox|button|dialog|tab/.test(role)) continue;
    counts[role] ??= { count: 0, samples: [] };
    counts[role].count += 1;
    if (counts[role].samples.length < 4) {
      const t = text(el).split("\n")[0].slice(0, 30);
      if (t) counts[role].samples.push(t);
    }
  }
  return counts;
}

function buttons() {
  return [...document.querySelectorAll("button, [role=button]")]
    .filter(visible)
    .map((b) => ({ text: text(b).slice(0, 28), testid: b.getAttribute("data-testid"), disabled: b.disabled || null }))
    .filter((b) => b.text || b.testid)
    .slice(0, 25);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "probe") return;

  sendResponse({
    url: location.href,
    title: document.title.slice(0, 60),
    // A logged-out page is the single most common reason a probe looks broken,
    // and it's invisible in a field dump — so say it outright.
    looksSignedOut: /log in|sign up|create account/i.test(document.body.innerText.slice(0, 400)),
    bodyLength: document.body.innerText.length,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
    fields: fields().slice(0, 45),
    roles: roles(),
    buttons: buttons(),
  });

  return true;
});
