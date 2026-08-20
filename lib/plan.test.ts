import { describe, expect, it } from "vitest";
import { PLANS } from "./plan";

/**
 * The pricing page is generated from PLANS, so these are really tests of what
 * the public page claims. The invariant that matters most: nothing unbuilt may
 * be listed as though it works — the `soon` flag is load-bearing honesty.
 */

describe("PLANS", () => {
  it("tiers ascend in both price and cap, free tier first", () => {
    expect(PLANS[0].monthly).toBe(0);
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].monthly).toBeGreaterThan(PLANS[i - 1].monthly);
      const prev = PLANS[i - 1].activeListings;
      const cur = PLANS[i].activeListings;
      // null = unlimited, which only ever appears above a numbered cap.
      if (cur !== null && prev !== null) expect(cur).toBeGreaterThan(prev);
      if (prev === null) expect(cur).toBeNull();
    }
  });

  it("every plan has copy for every surface the page renders", () => {
    for (const plan of PLANS) {
      for (const field of ["label", "headline", "forWhom", "cta", "fine"] as const) {
        expect(plan[field].length, `${plan.id}.${field}`).toBeGreaterThan(0);
      }
      expect(plan.features.length, `${plan.id} features`).toBeGreaterThan(2);
    }
  });

  it("free tier never says 'soon' — you can't owe features to people paying nothing", () => {
    // A paid tier may honestly advertise what's in build; the free tier
    // listing unbuilt features would just be bait.
    const lamb = PLANS.find((p) => p.id === "lamb")!;
    expect(lamb.features.every((f) => !f.soon)).toBe(true);
  });
});
