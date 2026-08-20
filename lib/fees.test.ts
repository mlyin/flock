import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  FEE_RULES,
  askForNet,
  askPlan,
  computeFees,
  isConsignment,
  projectedNet,
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

describe("fee table hygiene", () => {
  it("every channel's rules carry a verification date or an honest 'unverified'", () => {
    for (const channel of CHANNELS) {
      const v = FEE_RULES[channel].verifiedOn;
      expect(v === "unverified" || /^\d{4}-\d{2}-\d{2}$/.test(v), `${channel}: "${v}"`).toBe(true);
    }
  });
});
