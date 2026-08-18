/**
 * Reads Depop's message pages. Two modes, because the data is split across two
 * views and neither has all of it:
 *
 *   list   — /messages/ gives every thread's id, the buyer's handle, and the
 *            last message preview.
 *   thread — /messages/<hash>/ is the only place the product link appears, and
 *            that link is what ties a conversation to a garment.
 *
 * Fetching the HTML doesn't work: Depop renders conversations client-side, so a
 * fetch returns a 215KB shell with none of the text in it. The background script
 * therefore navigates a real tab to each thread and calls this.
 *
 * Selectors read off the live page — see SELECTORS.md.
 */

/** Product links, minus Depop's own create/edit chrome. */
function productLink() {
  const link = [...document.querySelectorAll('a[href^="/products/"]')]
    .map((a) => a.getAttribute("href"))
    .find((href) => href && !/^\/products\/(create|edit)\b/.test(href));

  return link ? new URL(link, location.origin).toString() : null;
}

function readList() {
  const threads = [];

  for (const anchor of document.querySelectorAll('a[href^="/messages/"]')) {
    const href = anchor.getAttribute("href") ?? "";
    const id = (href.match(/^\/messages\/([a-f0-9]{32,})\//i) || [])[1];
    if (!id || threads.some((t) => t.id === id)) continue;

    // The row renders as: handle, preview, relative time. Splitting the text is
    // uglier than a selector but survives their class names changing.
    const lines = anchor.innerText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    threads.push({
      id,
      url: new URL(href, location.origin).toString(),
      sender: lines[0] ?? null,
      preview: lines[1] ?? null,
      when: lines[2] ?? null,
    });
  }

  return threads;
}

function readThread() {
  // Bubbles are the leaf nodes inside the conversation pane. Depop's own safety
  // notice sits among them, so it's filtered by content rather than position.
  const noise = /keep it on depop|never share personal info|welcome to depop|we'll only ever message/i;

  const bubbles = [...document.querySelectorAll("div, p, span")]
    .filter((el) => {
      if (el.children.length > 0) return false;
      if (el.closest("nav, header, a")) return false;
      const text = el.textContent?.trim() ?? "";
      if (!text || text.length > 500) return false;
      if (noise.test(text)) return false;
      return el.offsetParent !== null;
    })
    .map((el) => el.textContent.trim());

  return { product_url: productLink(), bubbles: [...new Set(bubbles)] };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "depop-read-list") {
    sendResponse({ threads: readList() });
    return true;
  }
  if (message.type === "depop-read-thread") {
    sendResponse(readThread());
    return true;
  }
});
