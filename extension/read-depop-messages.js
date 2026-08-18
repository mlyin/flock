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

/** Row furniture that isn't part of the conversation. */
const ROW_CHROME = /^(conversation menu|menu|options|more)$/i;

function readList() {
  const threads = [];

  for (const anchor of document.querySelectorAll('a[href^="/messages/"]')) {
    const href = anchor.getAttribute("href") ?? "";
    const id = (href.match(/^\/messages\/([a-f0-9]{32,})\//i) || [])[1];
    if (!id || threads.some((t) => t.id === id)) continue;

    // The row renders as: [avatar initial?], handle, preview, relative time,
    // "Conversation Menu". Splitting the text is uglier than a selector but
    // survives their class names changing.
    let lines = anchor.innerText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !ROW_CHROME.test(l));

    // When a buyer has no avatar image, Depop renders their initial as its own
    // line. That shifted every field by one: read against a live inbox on
    // 18 Aug 2026, a thread came back as sender "M", preview "mrtt2" (the actual
    // handle) and when "yes" (the actual message). Depop handles are at least
    // three characters, so a one- or two-character first line is the initial.
    // Depop's own account has an avatar image and so never had the extra line,
    // which is why this parsed correctly in testing and wrongly in life.
    if (lines.length > 2 && lines[0].length <= 2) lines = lines.slice(1);

    threads.push({
      id,
      url: new URL(href, location.origin).toString(),
      sender: lines[0] ?? null,
      preview: lines[1] ?? null,
      // Taken from the end rather than index 2 — the preview is one line, but
      // anything that adds a line ahead of it would otherwise shift the time.
      when: lines.length > 2 ? lines[lines.length - 1] : null,
    });
  }

  return threads;
}

/**
 * Chrome that renders as leaf text inside the conversation pane.
 *
 * Read off a live thread on 18 Aug 2026: of 13 leaf nodes in a real
 * two-message conversation, only two were actual messages. The rest were
 * timestamps, the order summary, Depop's safety notice and the product card —
 * all of which would otherwise have been imported as buyer messages.
 */
const NOISE = /keep it on depop|never share personal info|welcome to depop|we'll only ever message|to report or block this user|shipping calculated at checkout/i;
const TIME_ONLY = /^(today|yesterday)?\s*\d{1,2}:\d{2}\s*(am|pm)?$/i;
const MONEY_ONLY = /^[$£€]\s?[\d,]+(\.\d{2})?$/;
const CHROME = /^(refresh|item\(s\)|total|active (today|now|yesterday)|delivery|buy now|make offer|sold)$/i;

function isMessageText(text) {
  if (!text) return false;
  if (NOISE.test(text)) return false;
  if (TIME_ONLY.test(text)) return false;
  if (MONEY_ONLY.test(text)) return false;
  if (CHROME.test(text)) return false;
  // The product card repeats the listing description inside the thread. Real
  // chat is a line or two; listing copy carries the Brand:/Size:/Condition:
  // scaffold across several.
  if ((text.match(/\n/g) || []).length >= 2) return false;
  return true;
}

function readThread() {
  // Bubbles are the leaf nodes inside the conversation pane. Depop's bubbles
  // have no stable hook, so this filters by content rather than position.
  const bubbles = [...document.querySelectorAll("div, p, span")]
    .filter((el) => {
      if (el.children.length > 0) return false;
      if (el.closest("nav, header, a")) return false;
      const text = el.textContent?.trim() ?? "";
      if (!text || text.length > 500) return false;
      return el.offsetParent !== null;
    })
    .map((el) => el.textContent.trim())
    .filter(isMessageText);

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
