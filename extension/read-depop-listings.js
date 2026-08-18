/**
 * Reads a seller's own Depop shop — which listings are live, and where.
 *
 * This is what makes a channel chip clickable: Threader fills a form, the
 * seller publishes, and until now nothing came back with the URL the listing
 * landed at. Rather than ask them to paste it, read the shop.
 *
 * Selectors read off the live signed-in shop page on 18 Aug 2026 — see
 * SELECTORS.md. Depop renders the grid client-side, so the background script
 * navigates a real tab here and calls this rather than fetching the HTML.
 */

/**
 * Product cards, excluding Depop's own "Sell now" button which is also an
 * /products/ link. Real cards carry aria-label="item listed by <username>",
 * which is the only stable discriminator on the card itself — the anchor has
 * no text, the grid is images only.
 */
function readShop() {
  const listings = [];

  for (const anchor of document.querySelectorAll('a[href^="/products/"]')) {
    const href = anchor.getAttribute("href") ?? "";
    if (/^\/products\/(create|edit)\b/.test(href)) continue;
    if (!/item listed by/i.test(anchor.getAttribute("aria-label") ?? "")) continue;

    const slug = href.replace(/^\/products\//, "").replace(/\/$/, "");
    if (!slug || listings.some((l) => l.external_id === slug)) continue;

    // Price is not on the anchor. It sits a couple of levels up, alongside the
    // card, so walk outward until something looks like money and stop early —
    // going too far up reaches the whole grid and picks a neighbour's price.
    let price = null;
    let node = anchor.parentElement;
    for (let depth = 0; depth < 4 && node && price === null; depth++) {
      const match = (node.innerText || "").match(/[$£€]\s?(\d+(?:\.\d{2})?)/);
      if (match) price = Number(match[1]);
      node = node.parentElement;
    }

    // Depop marks sold items on the card; unverified — no sold item existed on
    // the shop when this was read. Treated as a hint, never as the last word.
    const surrounding = (anchor.closest("div")?.innerText || "").toLowerCase();
    const sold = /\bsold\b/.test(surrounding);

    listings.push({
      external_id: slug,
      url: new URL(href, location.origin).toString(),
      price,
      status: sold ? "sold" : "active",
      photo_url: anchor.querySelector("img")?.src ?? null,
    });
  }

  return listings;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "depop-read-shop") {
    sendResponse({ listings: readShop() });
    return true;
  }
});
