import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, judgeOffer } from "./negotiate";
import { scoreOffer, type MessageRow, type ScoredOffer } from "./offers";
import { CHANNELS, askForNet, projectedNet } from "./fees";

/**
 * judgeOffer's whole thesis is "inspectable arithmetic" — the seller reads the
 * working and checks it rather than trusting it. That only holds if the
 * arithmetic is right, and none of it was covered.
 *
 * The invariant that matters most: never advise a move that nets less than the
 * floor the seller set, and never counter below your own floor — which is
 * negotiating against yourself.
 */

const offerOf = (
  amount: number,
  { floor = 60, ask = 90, cost = 12, channel = "depop" as const } = {}
): ScoredOffer =>
  scoreOffer({
    id: "m1", channel, sender: "b", body: null, kind: "offer", direction: "incoming",
    offer_amount: amount, received_at: "2026-08-20T10:00:00Z", read_at: null,
    item_id: "i1", thread_id: "t1",
    items: {
      id: "i1", sku: "CL-0001", title: "Jacket", brand: null,
      floor_price: floor, list_price: ask, cost_basis: cost,
    },
  } as MessageRow)!;

describe("judgeOffer", () => {
  it("asks for a floor rather than inventing one", () => {
    const v = judgeOffer(offerOf(50, { floor: null as unknown as number }));
    expect(v.move).toBe("ask");
    expect(v.counterAt).toBeNull();
  });

  it("accepts an offer that clears the floor in net terms", () => {
    const v = judgeOffer(offerOf(95));
    expect(v.move).toBe("accept");
  });

  it("declines or counters anything meaningfully under the floor — never accepts", () => {
    for (const channel of CHANNELS) {
      const v = judgeOffer(offerOf(20, { channel }));
      expect(v.move, `${channel}`).not.toBe("accept");
    }
  });

  it("never counters below the seller's own floor", () => {
    for (const channel of CHANNELS) {
      for (const amount of [5, 15, 30, 45, 58]) {
        const v = judgeOffer(offerOf(amount, { channel }));
        if (v.move !== "counter") continue;
        expect(v.counterAt!, `${channel} @ ${amount}`).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("never counters above the asking price — that reads as bad faith", () => {
    for (const amount of [5, 30, 55, 80]) {
      const v = judgeOffer(offerOf(amount, { ask: 90 }));
      if (v.counterAt !== null) expect(v.counterAt).toBeLessThanOrEqual(90);
    }
  });

  it("a counter is always above the offer it answers", () => {
    for (const amount of [10, 40, 70]) {
      const v = judgeOffer(offerOf(amount));
      if (v.move === "counter") expect(v.counterAt!).toBeGreaterThan(amount);
    }
  });

  it("netIfTaken is the net of the move actually advised", () => {
    for (const amount of [20, 60, 88, 120]) {
      const v = judgeOffer(offerOf(amount));
      const expected =
        v.move === "counter" ? projectedNet("depop", v.counterAt!) : projectedNet("depop", amount);
      expect(v.netIfTaken).toBeCloseTo(expected, 2);
    }
  });

  it("accept means cleared the floor, or short by no more than the stated tolerance", () => {
    // The property, not a hand-picked number: my first attempt compared a
    // GROSS offer against a NET tolerance and failed for the same reason the
    // gross-vs-net bug existed in the first place. Sweep instead, and assert
    // the rule the policy actually states.
    for (const channel of CHANNELS) {
      const floorNet = projectedNet(channel, 60);
      for (let amount = 1; amount <= 120; amount += 0.5) {
        const v = judgeOffer(offerOf(amount, { channel }));
        if (v.move !== "accept") continue;
        const net = projectedNet(channel, amount);
        const shortfall = floorNet - net;
        expect(
          shortfall <= floorNet * DEFAULT_POLICY.acceptWithinPercentOfFloor + 0.005,
          `${channel} accepted $${amount}: nets $${net.toFixed(2)} vs floor net $${floorNet.toFixed(2)}`
        ).toBe(true);
      }
    }
  });

  it("there is a real tolerance band — something just under the floor is accepted", () => {
    const floorNet = projectedNet("depop", 60);
    // 1% short of the floor net, inverted back into an offer amount.
    const amount = askForNet("depop", floorNet * 0.99)!;
    expect(judgeOffer(offerOf(amount)).move).toBe("accept");
  });
  it("every verdict shows its working and defers to a human", () => {
    for (const amount of [5, 60, 200]) {
      const v = judgeOffer(offerOf(amount));
      expect(v.working.length).toBeGreaterThan(1);
      expect(v.because.length).toBeGreaterThan(0);
      // Nothing here is ever auto-applied.
      expect(v.needsSeller).toBe(true);
    }
  });
});

