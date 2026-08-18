import { describe, expect, it } from "vitest";
import { departmentOf, pickBrand, pickCategory, pickCondition } from "./matching";

// Exactly what Mercari suggested for the Alo Ivory Soho Pullover, 18 Aug 2026.
const MERCARI_SUGGESTED = [
  "Women > Sweaters > Crewneck",
  "Women > Athletic apparel > Athletic Leggings",
  "Women > Athletic apparel > Athletic Sweatshirts",
  "Men > Sweats & hoodies > Sweatshirt, pullover",
  "Women > Women's handbags > Shoulder Bags",
];

const ALO = {
  title: "Ivory Soho Pullover",
  brand: "Alo",
  category: "Other",
  material: "Cotton",
};

describe("departmentOf", () => {
  it("reads the department off a category path", () => {
    expect(departmentOf("Women > Sweaters > Crewneck")).toBe("women");
    expect(departmentOf("Men > Sweats & hoodies > Sweatshirt, pullover")).toBe("men");
    expect(departmentOf("Kids > Girls > Tops")).toBe("kids");
    expect(departmentOf("Unisex > Accessories")).toBe("unisex");
  });

  it("prefers kids over the gender inside it", () => {
    expect(departmentOf("Kids > Girls > Dresses")).toBe("kids");
    expect(departmentOf("Kids > Boys > Shorts")).toBe("kids");
  });

  it("returns null for an ungendered path", () => {
    expect(departmentOf("Home > Kitchen")).toBeNull();
  });
});

describe("pickCategory — the Men's/Women's trap", () => {
  it("never picks a men's category for a women's item", () => {
    const choice = pickCategory({ ...ALO, department: "women" }, MERCARI_SUGGESTED);
    expect(choice.value).not.toBeNull();
    expect(departmentOf(choice.value!)).toBe("women");
    expect(choice.value).not.toBe("Men > Sweats & hoodies > Sweatshirt, pullover");
  });

  it("refuses to choose when the department is unknown", () => {
    const choice = pickCategory({ ...ALO, department: null }, MERCARI_SUGGESTED);
    expect(choice.value).toBeNull();
    expect(choice.reason).toMatch(/department/i);
  });

  it("picks the men's option for a men's item", () => {
    const choice = pickCategory(
      { title: "Nike pullover sweatshirt", department: "men" },
      MERCARI_SUGGESTED
    );
    expect(choice.value).toBe("Men > Sweats & hoodies > Sweatshirt, pullover");
  });

  it("matches on the leaf, not the root", () => {
    const choice = pickCategory(
      { title: "Ribbed crewneck sweater", department: "women" },
      MERCARI_SUGGESTED
    );
    expect(choice.value).toBe("Women > Sweaters > Crewneck");
  });

  it("returns nothing when the title matches nothing on offer", () => {
    const choice = pickCategory(
      { title: "Cast iron skillet", department: "women" },
      MERCARI_SUGGESTED
    );
    expect(choice.value).toBeNull();
    expect(choice.score).toBe(0);
  });

  it("lets a unisex item into a gendered category", () => {
    const choice = pickCategory(
      { title: "Crewneck sweater", department: "unisex" },
      MERCARI_SUGGESTED
    );
    expect(choice.value).toBe("Women > Sweaters > Crewneck");
  });

  it("handles an empty option list without throwing", () => {
    expect(pickCategory({ ...ALO, department: "women" }, []).value).toBeNull();
  });
});

describe("pickBrand — exact or nothing", () => {
  it("does not let Alo select Aloye", () => {
    // The real incident: loose matching put "Aloye" on a live Alo listing.
    const choice = pickBrand("Alo", ["Aloye", "Alo Yoga", "Alpha Industries"]);
    expect(choice.value).toBeNull();
    expect(choice.exact).toBe(false);
    expect(choice.reason).toMatch(/Aloye/);
  });

  it("takes the exact match when it exists alongside a near miss", () => {
    const choice = pickBrand("Alo", ["Aloye", "Alo", "Alo Yoga"]);
    expect(choice.value).toBe("Alo");
    expect(choice.exact).toBe(true);
  });

  it("ignores case and punctuation", () => {
    expect(pickBrand("levis", ["Levi's"]).value).toBe("Levi's");
    expect(pickBrand("The North Face", ["the north face"]).value).toBe("the north face");
  });

  it("returns nothing when no brand is recorded", () => {
    expect(pickBrand(null, ["Alo"]).value).toBeNull();
    expect(pickBrand("   ", ["Alo"]).value).toBeNull();
  });

  it("returns nothing when the list is empty", () => {
    expect(pickBrand("Alo", []).value).toBeNull();
  });
});

describe("pickCondition", () => {
  it("maps to each marketplace's own words", () => {
    expect(pickCondition("mercari", "good")).toBe("Good");
    expect(pickCondition("grailed", "good")).toBe("Used");
    expect(pickCondition("vinted", "excellent")).toBe("Very good");
    expect(pickCondition("depop", "new_with_tags")).toBe("Brand new");
  });

  it("returns null for an unknown channel or condition", () => {
    expect(pickCondition("poshmark", "good")).toBeNull();
    expect(pickCondition("mercari", "pristine")).toBeNull();
  });
});
