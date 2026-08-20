import { describe, expect, it } from "vitest";
import { EMPTY_DEFAULTS, applyDefaults, parseDefaults, type ListingDefaults } from "./defaults";

/**
 * Standing text lands verbatim on public listings, so the failures here are
 * storefront-visible: a footer above the garment's details, both a global and a
 * channel footer stacked, or an override the seller cleared coming back.
 */

const D = (over: Partial<ListingDefaults> = {}): ListingDefaults => ({
  ...EMPTY_DEFAULTS,
  ...over,
});

describe("applyDefaults", () => {
  it("puts the garment first and the terms after", () => {
    const out = applyDefaults("Ivory Soho Pullover\nSize M", D({ footer: "Ships next day." }), "depop");
    expect(out.indexOf("Ivory")).toBeLessThan(out.indexOf("Ships next day"));
  });

  it("preamble leads, footer trails", () => {
    const out = applyDefaults("BODY", D({ preamble: "TOP", footer: "END" }), "depop");
    expect(out).toBe("TOP\n\nBODY\n\nEND");
  });

  it("returns the description untouched when nothing is set", () => {
    expect(applyDefaults("BODY", EMPTY_DEFAULTS, "depop")).toBe("BODY");
  });

  it("a channel override replaces the global rather than stacking with it", () => {
    const out = applyDefaults(
      "BODY",
      D({ footer: "GLOBAL", per_channel: { depop: { footer: "DEPOP" } } }),
      "depop"
    );
    expect(out).toContain("DEPOP");
    expect(out).not.toContain("GLOBAL");
  });

  it("other channels still get the global", () => {
    const out = applyDefaults(
      "BODY",
      D({ footer: "GLOBAL", per_channel: { depop: { footer: "DEPOP" } } }),
      "ebay"
    );
    expect(out).toContain("GLOBAL");
  });

  it("an override cleared to empty means no footer on that channel, not the global", () => {
    const out = applyDefaults(
      "BODY",
      D({ footer: "GLOBAL", per_channel: { depop: { footer: "" } } }),
      "depop"
    );
    expect(out).toBe("BODY");
  });

  it("whitespace-only text is treated as unset", () => {
    expect(applyDefaults("BODY", D({ footer: "   \n  " }), "depop")).toBe("BODY");
  });
});

describe("parseDefaults", () => {
  it("survives null, junk, and an array where an object belongs", () => {
    expect(parseDefaults(null)).toEqual(EMPTY_DEFAULTS);
    expect(parseDefaults("nonsense")).toEqual(EMPTY_DEFAULTS);
    expect(parseDefaults({ per_channel: ["not", "an", "object"] }).per_channel).toEqual({});
  });

  it("blank strings normalise to null so they never render as empty paragraphs", () => {
    expect(parseDefaults({ footer: "   " }).footer).toBeNull();
  });
});
