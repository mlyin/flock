import { describe, expect, it } from "vitest";
import { detectDrift, type PricedListing } from "./drift";

const listing = (over: Partial<PricedListing> = {}): PricedListing => ({
  id: "l1",
  item_id: "i1",
  channel: "depop",
  price: 48,
  market_price: 48,
  price_drift_ack: null,
  ...over,
});

describe("detectDrift", () => {
  it("says nothing when the two agree", () => {
    expect(detectDrift([listing()])).toEqual([]);
  });

  it("raises a disagreement in both directions", () => {
    const under = detectDrift([listing({ market_price: 60 })]);
    expect(under).toHaveLength(1);
    expect(under[0].delta).toBeCloseTo(12);

    const over = detectDrift([listing({ market_price: 40 })]);
    expect(over[0].delta).toBeCloseTo(-8);
  });

  it("ignores a cent of rounding", () => {
    // Marketplaces render "$48", "48.00" and "48.004"; the reader parses all
    // three to a float. Exact comparison would raise a question about nothing.
    expect(detectDrift([listing({ market_price: 48.01 })])).toEqual([]);
    expect(detectDrift([listing({ market_price: 47.995 })])).toEqual([]);
    expect(detectDrift([listing({ market_price: 48.02 })])).toHaveLength(1);
  });

  it("treats a missing price as no evidence, not as a disagreement", () => {
    expect(detectDrift([listing({ market_price: null })])).toEqual([]);
    expect(detectDrift([listing({ price: null })])).toEqual([]);
  });

  it("treats zero as a failed read, not as free", () => {
    // Depop renders a sold item's price node empty, which parses to 0. Without
    // this guard every sold listing would report a drift to $0.
    expect(detectDrift([listing({ market_price: 0 })])).toEqual([]);
    expect(detectDrift([listing({ price: 0 })])).toEqual([]);
  });

  it("stays quiet about a market price the seller already accepted", () => {
    expect(detectDrift([listing({ market_price: 60, price_drift_ack: 60 })])).toEqual([]);
  });

  it("asks again when the marketplace moves after an acknowledgement", () => {
    // A new number is a new fact. Acknowledging $60 should not buy silence
    // about $85.
    const found = detectDrift([listing({ market_price: 85, price_drift_ack: 60 })]);
    expect(found).toHaveLength(1);
    expect(found[0].theirs).toBe(85);
  });

  it("puts the costliest disagreement first", () => {
    const found = detectDrift([
      listing({ id: "small", market_price: 50 }),
      listing({ id: "big", market_price: 120 }),
      listing({ id: "medium", market_price: 30 }),
    ]);
    expect(found.map((d) => d.listing.id)).toEqual(["big", "medium", "small"]);
  });

  it("scales to a whole closet without raising anything spurious", () => {
    // The catastrophic version of this feature flags everything at once.
    const closet = Array.from({ length: 200 }, (_, i) =>
      listing({ id: `l${i}`, price: 20 + i, market_price: 20 + i })
    );
    expect(detectDrift(closet)).toEqual([]);
  });
});
