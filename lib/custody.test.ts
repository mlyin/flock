import { describe, expect, it } from "vitest";
import { CHANNELS, type Channel } from "./fees";
import { canList, inHand, listableChannels, transition, type Custody } from "./custody";

const item = (custody: Custody, consigned_to: Channel | null = null) => ({ custody, consigned_to });

describe("canList", () => {
  it("allows every channel for something in your closet", () => {
    for (const channel of CHANNELS) {
      expect(canList(item("hand"), channel).allowed, channel).toBe(true);
      expect(canList(item("returned"), channel).allowed, channel).toBe(true);
    }
  });

  it("blocks every ordinary channel while a consignor holds it", () => {
    const consigned = item("consigned", "therealreal");
    for (const channel of CHANNELS) {
      if (channel === "therealreal") continue;
      const verdict = canList(consigned, channel);
      expect(verdict.allowed, channel).toBe(false);
      // The reason has to name the holder — "not allowed" tells a seller
      // nothing about what to do next.
      if (!verdict.allowed) expect(verdict.reason).toContain("therealreal");
    }
  });

  it("allows the consignor that already holds it", () => {
    // That listing IS the consignment; blocking it would make a consigned item
    // unsellable anywhere.
    expect(canList(item("consigned", "therealreal"), "therealreal").allowed).toBe(true);
  });

  it("blocks a second consignor", () => {
    const verdict = canList(item("consigned", "therealreal"), "vestiaire");
    expect(verdict.allowed).toBe(false);
  });

  it("still blocks when we've lost track of which consignor has it", () => {
    // consigned_to null with custody consigned is a broken row, and the safe
    // reading of a broken row is that the item is not here.
    const verdict = canList(item("consigned", null), "depop");
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBeTruthy();
  });
});

describe("listableChannels", () => {
  it("narrows to just the holder while consigned", () => {
    expect(listableChannels(item("consigned", "therealreal"), [...CHANNELS])).toEqual([
      "therealreal",
    ]);
  });

  it("leaves everything alone otherwise", () => {
    expect(listableChannels(item("hand"), [...CHANNELS])).toEqual([...CHANNELS]);
  });
});

describe("inHand", () => {
  it("is true for anything physically in the closet", () => {
    expect(inHand("hand")).toBe(true);
    // Returned means it came back. It is as available as anything else.
    expect(inHand("returned")).toBe(true);
    expect(inHand("consigned")).toBe(false);
  });
});

describe("transition", () => {
  it("sends an in-hand item to a consignor", () => {
    expect(transition("hand", "consigned", "therealreal")).toEqual({
      ok: true,
      custody: "consigned",
    });
  });

  it("refuses to consign something already consigned", () => {
    const result = transition("consigned", "consigned", "therealreal");
    expect(result.ok).toBe(false);
  });

  it("refuses a consignor that doesn't take custody", () => {
    // Depop never holds the garment, so "consigned to Depop" describes nothing.
    const result = transition("hand", "consigned", "depop");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("depop");
  });

  it("insists on knowing where it went", () => {
    expect(transition("hand", "consigned").ok).toBe(false);
  });

  it("only lets back something that actually left", () => {
    expect(transition("consigned", "returned")).toEqual({ ok: true, custody: "returned" });
    expect(transition("hand", "returned").ok).toBe(false);
    expect(transition("returned", "returned").ok).toBe(false);
  });
});
