/**
 * Tying a scraped marketplace listing back to a Flock item.
 *
 * The rule that governs this file: a wrong match silently corrupts the
 * net-proceeds maths and shows a buyer's message against the wrong garment.
 * So this matches only when it's certain, and returns nothing otherwise — an
 * unmatched listing is visible and fixable, a mismatched one is neither.
 *
 * Depop's product slug carries the title and brand:
 *   yumseller21-ivory-soho-pullover-brand-alo-ab33
 * which is enough to identify an item without loading the product page.
 */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface MatchableItem {
  id: string;
  title: string;
  brand: string | null;
}

export interface MatchResult {
  itemId: string | null;
  confidence: "exact" | "strong" | "none";
  reason: string;
}

/**
 * Match a listing slug to exactly one item.
 *
 * "strong" requires the item's full slugified title to appear in the listing
 * slug. Brand agreement upgrades it to "exact". Ambiguity — two items whose
 * titles both appear — resolves to none, deliberately: picking the longer match
 * would be a guess, and this is the one place guessing is expensive.
 */
export function matchListingToItem(slug: string, items: MatchableItem[]): MatchResult {
  const haystack = slugify(slug);
  if (!haystack) return { itemId: null, confidence: "none", reason: "Empty slug." };

  const hits = items.filter((item) => {
    const title = slugify(item.title);
    return title.length >= 4 && haystack.includes(title);
  });

  if (hits.length === 0) {
    return { itemId: null, confidence: "none", reason: "No item's title appears in the listing slug." };
  }

  if (hits.length > 1) {
    return {
      itemId: null,
      confidence: "none",
      reason: `${hits.length} items match that slug — matched by hand rather than guessed.`,
    };
  }

  const item = hits[0];
  const brand = item.brand ? slugify(item.brand) : null;
  const brandAgrees = brand ? haystack.includes(brand) : false;

  return {
    itemId: item.id,
    confidence: brandAgrees ? "exact" : "strong",
    reason: brandAgrees
      ? `Title and brand "${item.brand}" both appear in the slug.`
      : `Title "${item.title}" appears in the slug; brand not confirmed.`,
  };
}
