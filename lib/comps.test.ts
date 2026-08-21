import { describe, expect, it } from "vitest";
import { MIN_COMPS, compQuery, priceFromComps, soldUrl, summarise, trustworthy } from "./comps";

/**
 * The real distribution read off eBay on 21 Aug 2026 for
 * "patagonia better sweater mens medium" — 60 completed sales.
 *
 * Pinned as a fixture rather than invented, because the shape is the point:
 * a long right tail with a $150 sale hanging off a market whose middle is $35.
 * That tail is exactly what a mean would chase.
 */
const PATAGONIA = [
  9.72, 9.99, 12.6, 16.79, 18.05, 18.05, 19.04, 20, 20.99, 21, 21.99, 23.9, 24.99, 25.28, 25.49,
  27, 29.74, 29.99, 29.99, 29.99, 29.99, 30, 30, 30, 31.49, 34.8, 34.99, 35, 35.99, 38, 38.99, 39,
  39.95, 39.99, 41.99, 42.99, 43.5, 44, 44.88, 44.95, 44.99, 45, 45, 49, 49, 49.97, 49.99, 50, 50,
  50, 54.99, 59.95, 60, 63, 64.95, 65, 70, 96.99, 118.15, 150,
];

describe("summarise", () => {
  it("describes a real market sensibly", () => {
    const stats = summarise(PATAGONIA)!;
    expect(stats.median).toBeGreaterThan(30);
    expect(stats.median).toBeLessThan(42);
    expect(stats.p25).toBeLessThan(stats.median);
    expect(stats.p75).toBeGreaterThan(stats.median);
    expect(trustworthy(stats)).toBe(true);
  });

  it("ignores the tail a mean would chase", () => {
    const stats = summarise(PATAGONIA)!;
    const mean = PATAGONIA.reduce((a, b) => a + b, 0) / PATAGONIA.length;
    // The $150 and $118 sales pull the mean above the middle of the market.
    // Pricing there is how a garment sits unsold for three months.
    expect(stats.median).toBeLessThan(mean);
    expect(stats.discarded).toBeGreaterThan(0);
    expect(stats.high).toBeLessThan(150);
  });

  it("returns null for nothing", () => {
    expect(summarise([])).toBeNull();
    expect(summarise([0, -5, NaN])).toBeNull();
  });

  it("survives a set where every value is identical", () => {
    // IQR is zero, so the fence is a single point. Naive trimming would keep
    // nothing and report a band built from an empty array.
    const stats = summarise([30, 30, 30, 30, 30, 30, 30, 30, 30])!;
    expect(stats.n).toBe(9);
    expect(stats.median).toBe(30);
    expect(stats.p25).toBe(30);
    expect(stats.high).toBe(30);
  });

  it("never reports a band from an empty set after trimming", () => {
    // Whatever the distribution, low/high have to come from real numbers.
    for (const set of [[1, 1000], [5, 5, 5, 900], [2, 3, 4, 5, 6, 700, 800]]) {
      const stats = summarise(set)!;
      expect(stats.n).toBeGreaterThan(0);
      expect(stats.low).toBeGreaterThan(0);
      expect(stats.high).toBeGreaterThanOrEqual(stats.low);
    }
  });

  it("keeps the quartiles ordered no matter the input", () => {
    for (let size = 1; size <= 40; size++) {
      const set = Array.from({ length: size }, (_, i) => (i * 7) % 97 + 1);
      const stats = summarise(set)!;
      expect(stats.low).toBeLessThanOrEqual(stats.p25);
      expect(stats.p25).toBeLessThanOrEqual(stats.median);
      expect(stats.median).toBeLessThanOrEqual(stats.p75);
      expect(stats.p75).toBeLessThanOrEqual(stats.high);
    }
  });
});

describe("trustworthy", () => {
  it("refuses to call three sales a market", () => {
    expect(trustworthy(summarise([30, 35, 40]))).toBe(false);
    expect(trustworthy(null)).toBe(false);
  });

  it("accepts once there are enough", () => {
    const enough = Array.from({ length: MIN_COMPS }, (_, i) => 30 + i);
    expect(trustworthy(summarise(enough))).toBe(true);
  });
});

describe("compQuery", () => {
  const item = {
    brand: "Patagonia",
    title: "Vintage Better Sweater Fleece, gorgeous condition",
    department: "mens",
    size: "M",
    category: "knitwear",
  };

  it("strips the adjectives that make a search return nothing", () => {
    const q = compQuery(item)!;
    // Every word on eBay is an AND term, so "gorgeous" alone empties the page.
    expect(q.query).not.toContain("gorgeous");
    expect(q.query).not.toContain("vintage");
    expect(q.query).not.toContain("condition");
    expect(q.query).toContain("patagonia");
    expect(q.query).toContain("sweater");
  });

  it("includes size only when asked to narrow", () => {
    expect(compQuery(item, { narrow: false })!.query).not.toMatch(/\bm\b/);
    expect(compQuery(item, { narrow: true })!.query).toContain("m");
  });

  it("prefers a style code over everything", () => {
    // A style code names one exact product; nothing else improves on it.
    const q = compQuery({ ...item, style_code: "25528" })!;
    expect(q.query).toBe("25528");
  });

  it("refuses when there is no brand to anchor on", () => {
    // "black fleece pullover" is a search for the whole of eBay, and a band
    // built from it would be confident nonsense.
    expect(compQuery({ title: "black fleece pullover", department: "mens" })).toBeNull();
  });

  it("does not repeat a brand that is already in the title", () => {
    const q = compQuery({ brand: "Patagonia", title: "Patagonia Better Sweater" })!;
    expect(q.query.match(/patagonia/g)).toHaveLength(1);
  });

  it("keeps the query short enough to return results", () => {
    const q = compQuery({
      brand: "Patagonia",
      title: "Better Sweater Quarter Zip Fleece Pullover Jacket Oatmeal Heather Mens",
      department: "mens",
    })!;
    expect(q.query.split(" ").length).toBeLessThanOrEqual(6);
  });
});

describe("soldUrl", () => {
  it("asks for completed sales, newest first", () => {
    const url = soldUrl("patagonia better sweater");
    expect(url).toContain("LH_Sold=1");
    expect(url).toContain("LH_Complete=1");
    expect(url).toContain("_sop=13");
    expect(url).toContain("patagonia+better+sweater");
  });

  it("escapes what a seller might actually type", () => {
    const url = soldUrl("levi's 501 & 505");
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).searchParams.get("_nkw")).toBe("levi's 501 & 505");
  });
});

describe("priceFromComps", () => {
  it("prices off the quartiles, not the extremes", () => {
    const stats = summarise(PATAGONIA)!;
    const price = priceFromComps(stats);
    // The cheapest single sale is somebody's mistake, not a price.
    expect(price.low).toBe(stats.p25);
    expect(price.low).toBeGreaterThan(stats.low);
    expect(price.suggested).toBe(stats.median);
    expect(price.high).toBe(stats.p75);
  });

  it("says what the number is built from", () => {
    // The whole point is that this one is evidence, not judgement, and the
    // seller should be able to tell which they are looking at.
    const reasoning = priceFromComps(summarise(PATAGONIA)!).reasoning;
    expect(reasoning).toMatch(/completed eBay sales/);
    expect(reasoning).toMatch(/Sold prices, not asking prices/);
  });
});
