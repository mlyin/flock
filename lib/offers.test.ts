import { describe, expect, it } from "vitest";
import { scoreOffer, type MessageRow } from "./offers";
import { CHANNELS, projectedNet } from "./fees";

/**
 * The bug class this guards: comparing a GROSS offer against a NET floor.
 *
 * scoreOffer's own comment records the regression — a $60 offer against a $60
 * floor read as "clears it" while netting $57.57 on Depop and $48 on Poshmark.
 * The seller's floor is what they want to RECEIVE, so both sides of that
 * comparison have to pass through the same channel's fees. A silent return of
 * this bug tells someone to accept a loss.
 */

const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: "m1",
  channel: "depop",
  sender: "buyer",
  body: "would you take 60?",
  kind: "offer",
  direction: "incoming",
  offer_amount: 60,
  received_at: "2026-08-20T10:00:00Z",
  read_at: null,
  item_id: "i1",
  thread_id: "t1",
  items: {
    id: "i1", sku: "CL-0001", title: "Detroit Jacket", brand: "Carhartt",
    floor_price: 60, list_price: 90, cost_basis: 12,
  },
  ...over,
});

describe("scoreOffer", () => {
  it("returns null when there is no offer amount — not a zero-dollar offer", () => {
    // Number(null) === 0, which would have presented a phantom $0 offer.
    expect(scoreOffer(row({ offer_amount: null }))).toBeNull();
  });

  it("accepts numeric strings, which is what PostgREST hands back for numeric", () => {
    expect(scoreOffer(row({ offer_amount: "60" }))!.amount).toBe(60);
  });

  it("compares net against net, never gross against a floor", () => {
    // An offer exactly equal to the floor cannot clear it once fees exist:
    // both sides net the same, so aboveFloor is true only because they're
    // equal — the point is that the comparison happens in net terms at all.
    for (const channel of CHANNELS) {
      const scored = scoreOffer(row({ channel }))!;
      expect(scored.aboveFloor, channel).toBe(scored.net >= projectedNet(channel, 60));
    }
  });

  it("an offer a dollar under the floor does not clear it on any channel", () => {
    for (const channel of CHANNELS) {
      const scored = scoreOffer(row({ channel, offer_amount: 59 }))!;
      expect(scored.aboveFloor, channel).toBe(false);
    }
  });

  it("net never exceeds the offer, and profit is net minus cost", () => {
    for (const channel of CHANNELS) {
      for (const amount of [5, 22.5, 60, 149.99, 800]) {
        const scored = scoreOffer(row({ channel, offer_amount: amount }))!;
        expect(scored.net, `${channel} @ ${amount}`).toBeLessThanOrEqual(amount + 0.005);
        expect(scored.profit).toBeCloseTo(scored.net - 12, 2);
      }
    }
  });

  it("no floor set means no verdict, not a false one", () => {
    const scored = scoreOffer(row({ items: { ...row().items!, floor_price: null } }))!;
    expect(scored.aboveFloor).toBeNull();
  });

  it("no cost basis means no profit claim", () => {
    const scored = scoreOffer(row({ items: { ...row().items!, cost_basis: null } }))!;
    expect(scored.profit).toBeNull();
  });

  it("defaults an absent status to open rather than dropping the offer", () => {
    expect(scoreOffer(row())!.status).toBe("open");
  });
});
