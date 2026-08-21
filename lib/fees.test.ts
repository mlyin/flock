import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  FEE_RULES,
  askForNet,
  askPlan,
  computeFees,
  describeRule,
  isConsignment,
  projectedNet,
  unverifiedChannels,
} from "./fees";

/**
 * The money math. A silent bug here doesn't crash anything — it prints a wrong
 * number a seller then prices a real garment by, which is the most expensive
 * kind of bug this codebase can have. Hence property sweeps, not spot checks:
 * the fee curves are piecewise and their edges are exactly where hand-picked
 * examples never land.
 */

const PRICES = (() => {
  // Dense near zero and the tier boundaries, sparse into the tail.
  const points: number[] = [];
  for (let p = 0.5; p <= 30; p += 0.5) points.push(p);
  for (let p = 31; p <= 200; p += 1) points.push(p);
  for (let p = 210; p <= 2000; p += 10) points.push(p);
  return points;
})();

describe("computeFees", () => {
  it("never returns a negative fee on any channel at any price", () => {
    for (const channel of CHANNELS) {
      for (const price of PRICES) {
        for (const fee of computeFees(channel, { soldPrice: price, shippingCollected: 0 })) {
          expect(fee.amount, `${channel} at $${price}: ${fee.label}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("returns amounts rounded to the cent", () => {
    for (const channel of CHANNELS) {
      for (const price of [9.99, 15, 15.01, 33.33, 149.5]) {
        for (const fee of computeFees(channel, { soldPrice: price, shippingCollected: 7.77 })) {
          expect(fee.amount, `${channel} at $${price}: ${fee.label}`).toBeCloseTo(
            Math.round(fee.amount * 100) / 100,
            10
          );
        }
      }
    }
  });
});

describe("projectedNet", () => {
  it("never exceeds what the buyer actually paid", () => {
    for (const channel of CHANNELS) {
      for (const price of PRICES) {
        const net = projectedNet(channel, price, { shippingCollected: 5, shippingCost: 5 });
        expect(net, `${channel} at $${price}`).toBeLessThanOrEqual(price + 5 + 0.005);
      }
    }
  });

  it("a $0 sale never projects a positive net", () => {
    for (const channel of CHANNELS) {
      expect(projectedNet(channel, 0), channel).toBeLessThanOrEqual(0.005);
    }
  });
});

describe("askForNet round-trip", () => {
  // The contract on the tin: list at the returned ask and you clear the target.
  // Swept across targets INCLUDING awkward cents, on every non-consignment
  // channel — this is the sweep that catches a tier boundary handled wrong.
  const TARGETS = (() => {
    const t: number[] = [];
    for (let n = 1; n <= 60; n += 0.97) t.push(Math.round(n * 100) / 100);
    for (let n = 65; n <= 500; n += 7.13) t.push(Math.round(n * 100) / 100);
    return t;
  })();

  for (const channel of CHANNELS.filter((c) => !isConsignment(c))) {
    it(`${channel}: net at the returned ask always covers the target`, () => {
      for (const target of TARGETS) {
        const ask = askForNet(channel, target);
        if (ask === null) continue; // fees outran the price — allowed, just not wrong
        const net = projectedNet(channel, ask);
        expect(net, `target $${target} → ask $${ask} → net $${net}`).toBeGreaterThanOrEqual(
          target - 0.005
        );
      }
    });

    it(`${channel}: the ask is not wastefully high — a dime less would miss the target`, () => {
      for (const target of TARGETS) {
        const ask = askForNet(channel, target);
        if (ask === null || ask <= 0.11) continue;
        const cheaper = Math.round((ask - 0.1) * 100) / 100;
        const netCheaper = projectedNet(channel, cheaper);
        // Not strictly minimal (rounding guards exist), but within a dime.
        expect(netCheaper, `target $${target}: ask $${ask} vs $${cheaper}`).toBeLessThan(target);
      }
    });
  }

  it("consignment channels refuse — the seller doesn't set the price", () => {
    expect(askForNet("therealreal", 50)).toBeNull();
  });

  it("shipping the seller pays raises the ask by at least that much on flat-fee channels", () => {
    for (const channel of CHANNELS.filter((c) => !isConsignment(c))) {
      const bare = askForNet(channel, 40);
      const withLabel = askForNet(channel, 40, { shippingCost: 8 });
      if (bare === null || withLabel === null) continue;
      expect(withLabel, channel).toBeGreaterThan(bare);
    }
  });

  it("survives garbage without throwing", () => {
    expect(askForNet("depop", NaN)).toBeNull();
    expect(askForNet("depop", Infinity)).toBeNull();
    expect(askForNet("depop", -20)).not.toBeUndefined(); // negative target: any answer but a crash
  });
});

describe("askPlan", () => {
  it("orders channels cheapest ask first, nulls last", () => {
    const plan = askPlan([...CHANNELS], { costBasis: 12, targetProfit: 25 });
    const asks = plan.map((p) => p.ask);
    const firstNull = asks.indexOf(null);
    const numeric = (firstNull === -1 ? asks : asks.slice(0, firstNull)) as number[];
    for (let i = 1; i < numeric.length; i++) {
      expect(numeric[i]).toBeGreaterThanOrEqual(numeric[i - 1]);
    }
    if (firstNull !== -1) {
      expect(asks.slice(firstNull).every((a) => a === null)).toBe(true);
    }
  });

  it("profit on every row is net minus cost basis", () => {
    const plan = askPlan([...CHANNELS], { costBasis: 10, targetProfit: 15 });
    for (const row of plan) {
      if (row.ask === null) continue;
      expect(row.profit).toBeCloseTo(row.net - 10, 2);
    }
  });
});

/**
 * The three schedules verified on 2026-08-20, pinned.
 *
 * Each of these was wrong in the table before that audit, and each was wrong
 * in a way that produced a plausible number rather than an obvious error —
 * which is exactly the kind that survives review and reaches a seller.
 */
describe("rates verified 2026-08-20", () => {
  const feeOf = (channel: Parameters<typeof computeFees>[0], price: number, shipping = 0) =>
    computeFees(channel, { soldPrice: price, shippingCollected: shipping }).reduce(
      (sum, f) => sum + f.amount,
      0
    );

  it("Facebook charges 10%, not the 5% the blogs still print", () => {
    expect(feeOf("facebook", 100)).toBeCloseTo(10, 2);
  });

  it("Facebook's fee basis includes shipping the buyer paid", () => {
    // The trap: shipping is usually money the seller never receives, yet it
    // inflates the commission. 10% of the item alone would be $10.
    expect(feeOf("facebook", 100, 8)).toBeCloseTo(10.8, 2);
  });

  it("Facebook's $0.80 floor binds below an $8 basis", () => {
    expect(feeOf("facebook", 5)).toBeCloseTo(0.8, 2);
    expect(feeOf("facebook", 8)).toBeCloseTo(0.8, 2);
    // And stops binding the moment 10% clears it.
    expect(feeOf("facebook", 20)).toBeCloseTo(2, 2);
  });

  it("StockX Level 1 is 12% plus $5 shipping", () => {
    // 9% transaction + 3% processing, and the $5 US label — raised from $4 on
    // 1 March 2026, which the previous table predated and did not carry at all.
    expect(feeOf("stockx", 200)).toBeCloseTo(29, 2);
  });

  it("The RealReal steps hard at every band edge", () => {
    // A dollar more on the sale price moves the consignor from 20% to 30% of
    // it. Modelling this as one average rate is what the old flat 45% did.
    const keeps = (price: number) => price - feeOf("therealreal", price);
    expect(keeps(99)).toBeCloseTo(99 * 0.2, 2);
    expect(keeps(100)).toBeCloseTo(100 * 0.3, 2);
    expect(keeps(199)).toBeCloseTo(199 * 0.45, 2);
    expect(keeps(200)).toBeCloseTo(200 * 0.55, 2);
    expect(keeps(5000)).toBeCloseTo(5000 * 0.7, 2);
  });

  it("The RealReal's ladder never pays a consignor less for a higher sale", () => {
    // Band edges are steps, so the payout curve jumps — but it must never dip.
    // A schedule where selling for more nets less would be a real finding, and
    // encoding one by mistake is easy with nine hand-typed bands.
    let previous = -Infinity;
    for (let price = 1; price <= 6000; price += 1) {
      const keeps = price - feeOf("therealreal", price);
      expect(keeps + 0.005).toBeGreaterThanOrEqual(previous);
      previous = keeps;
    }
  });

  it("the three formerly-unverified channels are no longer unverified", () => {
    expect(unverifiedChannels()).toEqual([]);
  });
});

describe("describeRule", () => {
  it("describes every rule in the table without leaving a hole", () => {
    // A new rule shape that this cannot render shows the seller a blank cell
    // on the one page whose whole job is saying what a channel takes.
    for (const channel of CHANNELS) {
      for (const rule of FEE_RULES[channel].rules) {
        const text = describeRule(rule);
        expect(text, `${channel} / ${rule.label}`).toBeTruthy();
        expect(text).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });

  it("shows the floors and caps the old nested ternary dropped", () => {
    // Vestiaire's 12% is floored at $10 and capped at $2,000; those two numbers
    // distort its take more than the rate does, and they were invisible.
    const vestiaire = FEE_RULES.vestiaire.rules.map(describeRule).join(" ");
    expect(vestiaire).toContain("min $10.00");
    expect(vestiaire).toContain("max $2,000.00");
  });
});

describe("fee table hygiene", () => {
  it("every channel's rules carry a verification date or an honest 'unverified'", () => {
    for (const channel of CHANNELS) {
      const v = FEE_RULES[channel].verifiedOn;
      expect(v === "unverified" || /^\d{4}-\d{2}-\d{2}$/.test(v), `${channel}: "${v}"`).toBe(true);
    }
  });

  it("every banded rule starts at zero and ascends", () => {
    // A ladder with a gap at the bottom silently charges the first band's rate
    // to everything below it; one out of order makes a whole band unreachable.
    for (const channel of CHANNELS) {
      for (const rule of FEE_RULES[channel].rules) {
        if (rule.type !== "bands") continue;
        expect(rule.bands[0].from, channel).toBe(0);
        for (let i = 1; i < rule.bands.length; i++) {
          expect(rule.bands[i].from, `${channel} band ${i}`).toBeGreaterThan(rule.bands[i - 1].from);
        }
      }
    }
  });
});
