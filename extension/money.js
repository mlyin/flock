/**
 * Parse a price string off a marketplace page.
 *
 * Injected before any reader that needs it, so there is one copy rather than a
 * regex per file drifting apart. `lib/money.test.ts` evaluates THIS file, so
 * the tests cover the code that actually ships.
 *
 * This exists because a naive `\d+(?:\.\d{2})?` read "$1,250.00" as $1. That
 * number is not obviously wrong anywhere downstream: it passes the `> 0` check
 * on import, lands in `market_price`, and appears at the top of the
 * price-drift queue — which sorts by size of disagreement — as a one-click
 * "Use $1.00" that rewrites the garment and every listing on it.
 *
 * The European case is worse, because it stays plausible: "€1.250,00" parsed
 * as 1.25 looks like a real price rather than a failed read.
 */

/**
 * @param {string} raw digits with whatever separators the page used
 * @returns {number|null} null when there is no sensible number in it
 */
function parseMoney(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  // Keep only digits and separators; drop currency symbols, spaces, NBSPs.
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalised;

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes LAST is the decimal separator.
    // "1,250.00" -> dot decimal.   "1.250,00" -> comma decimal.
    const decimalAt = Math.max(lastComma, lastDot);
    const groupChar = decimalAt === lastComma ? "." : ",";
    normalised =
      cleaned.slice(0, decimalAt).split(groupChar).join("") +
      "." +
      cleaned.slice(decimalAt + 1);
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sepAt = lastComma !== -1 ? lastComma : lastDot;
    const sep = lastComma !== -1 ? "," : ".";
    const after = cleaned.length - sepAt - 1;
    const occurrences = cleaned.split(sep).length - 1;

    // Exactly three digits after a single separator is ambiguous — "1,250"
    // and "1.250" are both a thousand-something in some locale and 1.25 in
    // none. Group separator is the only reading that makes sense for a price.
    if (after === 3 || occurrences > 1) {
      normalised = cleaned.split(sep).join("");
    } else {
      // One or two digits after: a decimal. "29,99" and "29.99" both mean the
      // same thing.
      normalised = cleaned.slice(0, sepAt) + "." + cleaned.slice(sepAt + 1);
    }
  } else {
    normalised = cleaned;
  }

  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// Content scripts share the page's global scope, so a plain declaration is
// enough for the readers injected after this one. The export is for the tests.
if (typeof module !== "undefined" && module.exports) module.exports = { parseMoney };
