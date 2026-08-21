/**
 * What garments like this one actually sold for.
 *
 * Until now every price in Flock was a language model's opinion, and the
 * prompt admitted as much — "you have no sold-comp data, only the garment and
 * your own sense of the resale market". That is an honest guess but it is
 * still a guess, and a seller prices a real garment by it.
 *
 * eBay publishes completed sales on a public search page, no API and no
 * developer approval: `&LH_Sold=1&LH_Complete=1`. The extension reads it from
 * the seller's own browser, the same way it reads their Depop shop. That is
 * real evidence about the resale market, and it is the single biggest
 * available upgrade to the number.
 *
 * This module is the pure half: build the query, and turn a pile of prices
 * into a defensible band. No network, no DOM.
 */

export type CompStats = {
  /** How many sales the band is built from. */
  n: number;
  /** How many were discarded as outliers, and therefore not evidence. */
  discarded: number;
  /** The middle. Median, not mean — see below. */
  median: number;
  /** The middle half of the market: 25th and 75th percentile. */
  p25: number;
  p75: number;
  /** Cheapest and dearest of what survived trimming. */
  low: number;
  high: number;
};

/**
 * Below this, a "median" is an anecdote.
 *
 * Three sales of a common fleece tell you almost nothing about the fourth —
 * one dead-stock listing or one damaged item moves the middle by half. The
 * right answer at n=3 is to say so, not to print a confident number that
 * happens to be built from nothing.
 */
export const MIN_COMPS = 8;

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Turn sold prices into a band.
 *
 * Median rather than mean, and trimmed rather than raw, because resale price
 * distributions are not symmetric. A search for a $35 fleece returns a $150
 * one too — a different colourway, a collaboration, or a listing that bundled
 * three items. The mean chases that tail and the seller prices high and waits
 * forever.
 *
 * Trimming uses the standard 1.5×IQR fence. It is not tuned to flatter the
 * result: it is the same rule a box plot draws, so it can be explained to
 * someone who asks why their $150 comp was ignored.
 */
export function summarise(prices: number[]): CompStats | null {
  const clean = prices
    .filter((p) => Number.isFinite(p) && p > 0)
    // A $10,000 garment is real; a $10,000 comp on a fleece is a data error.
    // This only removes the absurd — the IQR fence does the real work.
    .filter((p) => p < 100_000)
    .sort((a, b) => a - b);

  if (clean.length === 0) return null;

  const q1 = quantile(clean, 0.25);
  const q3 = quantile(clean, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;

  const kept = clean.filter((p) => p >= lowFence && p <= highFence);
  // A fence that rejects everything means the distribution is stranger than
  // the fence assumes. Keep the raw set rather than reporting nothing.
  const used = kept.length > 0 ? kept : clean;

  return {
    n: used.length,
    discarded: clean.length - used.length,
    median: cents(quantile(used, 0.5)),
    p25: cents(quantile(used, 0.25)),
    p75: cents(quantile(used, 0.75)),
    low: cents(used[0]),
    high: cents(used[used.length - 1]),
  };
}

/** True when there is enough here to show a seller a number. */
export const trustworthy = (stats: CompStats | null): boolean =>
  stats !== null && stats.n >= MIN_COMPS;

export type CompQuery = { query: string; url: string; narrow: boolean };

/**
 * Strip the words that make a search worse.
 *
 * Flock's titles are written for buyers — "Vintage 90s Patagonia Better
 * Sweater Fleece, Gorgeous Condition". Searching that whole string on eBay
 * returns nothing, because every adjective is an AND term. What identifies the
 * garment is the brand, the model and the noun.
 */
const NOISE = new Set([
  "vintage",
  "rare",
  "gorgeous",
  "beautiful",
  "stunning",
  "amazing",
  "euc",
  "vguc",
  "nwt",
  "nwot",
  "condition",
  "excellent",
  "great",
  "good",
  "the",
  "a",
  "and",
  "with",
  "for",
  "in",
  "size",
  "sz",
]);

const words = (text: string | null | undefined): string[] =>
  String(text ?? "")
    .toLowerCase()
    // Keep alphanumerics and hyphens; drop the punctuation sellers write with.
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Build the eBay sold-listings search for one garment.
 *
 * `narrow` includes the size. Size genuinely moves resale price — a men's
 * small sells for less than a medium in most categories — but it also cuts the
 * result count hard, and below MIN_COMPS a precise band is worse than a
 * broader one. So the caller tries narrow first and falls back.
 */
export function compQuery(
  item: {
    brand?: string | null;
    title?: string | null;
    category?: string | null;
    department?: string | null;
    size?: string | null;
    style_code?: string | null;
  },
  opts: { narrow?: boolean } = {}
): CompQuery | null {
  const narrow = opts.narrow ?? false;

  // A style code is the strongest possible query: it names one exact product.
  // Nothing else needs to be in the search when we have one.
  const code = String(item.style_code ?? "").trim();
  if (code && code.length >= 4) {
    const query = code;
    return { query, url: soldUrl(query), narrow: false };
  }

  const seen = new Set<string>();
  const terms: string[] = [];
  const push = (source: string | null | undefined) => {
    for (const word of words(source)) {
      if (NOISE.has(word) || seen.has(word)) continue;
      seen.add(word);
      terms.push(word);
    }
  };

  push(item.brand);
  push(item.title);

  // Without a brand there is nothing to anchor the search to, and "black
  // fleece pullover" returns the whole of eBay. Better to say we can't.
  if (!String(item.brand ?? "").trim()) return null;

  push(item.department);
  if (narrow && item.size) push(item.size);

  // eBay's relevance falls apart past a handful of terms — every one is an
  // AND. Six is enough to name a garment and few enough to return results.
  const query = terms.slice(0, 6).join(" ");
  if (!query) return null;

  return { query, url: soldUrl(query), narrow };
}

export function soldUrl(query: string): string {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    // Newest first: a sale from last week describes today's market better than
    // one from three months ago, and eBay only keeps ~90 days anyway.
    _sop: "13",
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

/**
 * Turn a band into the three numbers the listing flow already speaks.
 *
 * `low` is the quick sale, `suggested` the middle, `high` what patience earns.
 * Mapped off the quartiles rather than the extremes: the cheapest single sale
 * is somebody's mistake, not a price.
 */
export function priceFromComps(stats: CompStats): {
  low: number;
  suggested: number;
  high: number;
  reasoning: string;
} {
  return {
    low: stats.p25,
    suggested: stats.median,
    high: stats.p75,
    reasoning:
      `${stats.n} completed eBay sales: half went between $${stats.p25.toFixed(2)} and ` +
      `$${stats.p75.toFixed(2)}, middle $${stats.median.toFixed(2)}` +
      (stats.discarded > 0
        ? `. ${stats.discarded} outlier${stats.discarded === 1 ? "" : "s"} ignored.`
        : ".") +
      " Sold prices, not asking prices.",
  };
}
