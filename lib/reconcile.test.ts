import { describe, expect, it } from "vitest";
import { matchListingToItem, slugify } from "./reconcile";

// The real slug, read off the live shop on 18 Aug 2026.
const SLUG = "yumseller21-ivory-soho-pullover-brand-alo-ab33";

const ALO = { id: "item-1", title: "Ivory Soho Pullover", brand: "Alo" };
const OTHER = { id: "item-2", title: "Detroit Jacket", brand: "Carhartt WIP" };

describe("slugify", () => {
  it("normalises to the shape marketplaces use", () => {
    expect(slugify("Ivory Soho Pullover")).toBe("ivory-soho-pullover");
    expect(slugify("Levi's 501  32x30")).toBe("levi-s-501-32x30");
  });
});

describe("matchListingToItem", () => {
  it("matches the real Depop slug to the right item, with brand confirmation", () => {
    const r = matchListingToItem(SLUG, [ALO, OTHER]);
    expect(r.itemId).toBe("item-1");
    expect(r.confidence).toBe("exact");
  });

  it("still matches without the brand, at lower confidence", () => {
    const r = matchListingToItem(SLUG, [{ ...ALO, brand: null }]);
    expect(r.itemId).toBe("item-1");
    expect(r.confidence).toBe("strong");
  });

  it("refuses when two items could both be it", () => {
    const twin = { id: "item-3", title: "Soho Pullover", brand: "Alo" };
    const r = matchListingToItem(SLUG, [ALO, twin]);
    expect(r.itemId).toBeNull();
    expect(r.reason).toMatch(/2 items/);
  });

  it("returns nothing when no title appears", () => {
    expect(matchListingToItem(SLUG, [OTHER]).itemId).toBeNull();
  });

  it("ignores titles too short to be evidence", () => {
    expect(matchListingToItem(SLUG, [{ id: "x", title: "Alo", brand: "Alo" }]).itemId).toBeNull();
  });

  it("handles an empty slug or empty inventory", () => {
    expect(matchListingToItem("", [ALO]).itemId).toBeNull();
    expect(matchListingToItem(SLUG, []).itemId).toBeNull();
  });
});
