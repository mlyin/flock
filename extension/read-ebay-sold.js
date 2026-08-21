/**
 * Reads completed eBay sales off the public search page.
 *
 * eBay's sold-listings view needs no API key and no developer approval — the
 * one thing that has blocked real comps in this product since the start. The
 * page is public, so this does not act as the seller or touch their account;
 * it is the same page anyone gets by ticking "Sold items".
 *
 * Read off the live page on 21 Aug 2026. Two things there will silently ruin
 * the numbers if you skip them:
 *
 * 1. THE FIRST ROWS ARE NOT SALES. eBay seeds the results with its own
 *    promotional cards titled "Shop on eBay", priced $20.00. They carry no
 *    sold date. Counting them drags every median toward $20, and on a cheap
 *    garment that is invisible — the answer stays plausible and is wrong.
 *
 * 2. THE MARKUP HAS TWO GENERATIONS. Older results are `li.s-item` with
 *    `.s-item__price`; the current ones are `li.s-card` with `.s-card__price`.
 *    Both were present on the same page. Query both or lose most of the rows.
 */

/** Prices render as "$29.99", sometimes "$20.00 to $35.00" for a variation. */
function pricesIn(text) {
  const matches = String(text || "").match(/\$[\d,]+(?:\.\d{2})?/g);
  if (!matches) return [];
  return matches
    .map((m) => parseFloat(m.replace(/[$,]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function readSoldComps() {
  const cards = [...document.querySelectorAll("li.s-item, li.s-card")];
  const comps = [];
  let promos = 0;
  let unsold = 0;

  for (const card of cards) {
    const heading = card.querySelector(
      '.s-item__title, .s-card__title, [role="heading"]'
    );
    const title = (heading?.innerText || "")
      .replace(/\s*Opens in a new window.*$/i, "")
      .trim();

    // eBay's own filler card. Never a sale.
    if (/^shop on ebay$/i.test(title.split("\n")[0].trim())) {
      promos += 1;
      continue;
    }

    // The sold date is what makes a row evidence. A row without one is a
    // still-active listing that leaked into the results, and an asking price
    // is not a sale — using it is how competitors' "comps" run high.
    const caption = [
      ...card.querySelectorAll(
        ".s-item__caption, .s-card__caption, .s-item__title--tagblock, .POSITIVE"
      ),
    ]
      .map((el) => el.innerText.trim())
      .join(" ");

    const soldOn = caption.match(/Sold\s+([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i);
    if (!soldOn) {
      unsold += 1;
      continue;
    }

    const priceText =
      card.querySelector(".s-item__price, .s-card__price")?.innerText?.trim() ?? "";
    const found = pricesIn(priceText);
    if (found.length === 0) continue;

    // A range means one listing covered several variations at different
    // prices. Its midpoint is the honest single number for it.
    const price =
      found.length === 1 ? found[0] : (Math.min(...found) + Math.max(...found)) / 2;

    comps.push({
      title: title.split("\n")[0].slice(0, 140),
      price,
      soldOn: soldOn[1],
      // "Pre-owned" / "New with tags" when eBay shows it. Not always present,
      // so nothing downstream may depend on it.
      condition:
        card.querySelector(".SECONDARY_INFO, .s-item__subtitle")?.innerText?.trim() ?? null,
    });
  }

  return {
    comps,
    skipped: { promos, unsold },
    // eBay's own count for the search, which is usually far larger than one
    // page. Useful for saying "60 of 927" rather than implying we saw them all.
    reportedTotal:
      document
        .querySelector(".srp-controls__count-heading")
        ?.innerText?.match(/[\d,]+/)?.[0]
        ?.replace(/,/g, "") ?? null,
    // A search with no results renders this rather than an empty list, and
    // telling the two apart is the difference between "nothing sells" and
    // "the query was wrong".
    noResults: Boolean(
      document.querySelector(".srp-save-null-search__heading, .s-answer-region--null-search")
    ),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "ebay-read-sold") return;
  try {
    sendResponse(readSoldComps());
  } catch (error) {
    console.error("[flock] eBay comp read failed:", error);
    sendResponse({ comps: [], error: error.message });
  }
  return true;
});
