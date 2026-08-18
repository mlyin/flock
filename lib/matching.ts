/**
 * Choosing a marketplace category and brand for an item.
 *
 * Kept as pure functions, separate from any filler, for two reasons: the
 * decision is the hard part and deserves tests, and the same logic has to serve
 * Depop, Mercari, Vinted and Grailed, whose option lists differ in shape but not
 * in kind.
 *
 * The governing rule is from experience, not taste: a wrong identity value is
 * worse than a blank one. Loose brand matching once put "Aloye" on a live Alo
 * listing because "alo" prefix-matches "aloye". Loose category matching put a
 * women's pullover under Men's. Both are silent, and both are seen by buyers.
 */

export type Department = "women" | "men" | "unisex" | "kids";

const DEPARTMENT_WORDS: Record<Department, RegExp> = {
  women: /\b(women'?s?|womens|ladies|female|girls?)\b/i,
  men: /\b(men'?s?|mens|male|boys?)\b/i,
  kids: /\b(kids?|children'?s?|baby|toddler|youth)\b/i,
  unisex: /\b(unisex)\b/i,
};

/** The department a category path is rooted at, if any. */
export function departmentOf(path: string): Department | null {
  // Check kids before women/men: "Kids > Girls" would otherwise read as women.
  if (DEPARTMENT_WORDS.kids.test(path)) return "kids";
  if (DEPARTMENT_WORDS.unisex.test(path)) return "unisex";
  if (DEPARTMENT_WORDS.women.test(path)) return "women";
  if (DEPARTMENT_WORDS.men.test(path)) return "men";
  return null;
}

export interface CategoryChoice {
  /** The chosen option, or null when nothing was safe to choose. */
  value: string | null;
  /** Why — shown to the seller, and worth logging. */
  reason: string;
  /** How confident, 0–1. Below ~0.5 the UI should make the seller confirm. */
  score: number;
}

export interface ItemForMatching {
  title: string;
  brand?: string | null;
  category?: string | null;
  department?: Department | null;
  material?: string | null;
}

const STOP = new Set(["the", "a", "an", "and", "or", "with", "for", "in", "of", "to", "size"]);

/**
 * Garment vocabulary.
 *
 * Marketplaces and sellers name the same object differently: a seller writes
 * "pullover", Mercari files it under "Athletic Sweatshirts", Depop calls it a
 * "Jumper". Without this the matcher refuses on almost every real title, which
 * is safe but useless — the Alo "Ivory Soho Pullover" shares no word with any
 * women's option Mercari offered for it.
 *
 * Deliberately small and one-directional per line; expand it from real misses
 * rather than from imagination.
 */
const SYNONYMS: Record<string, string[]> = {
  pullover: ["sweatshirt", "sweater", "jumper", "crewneck"],
  sweatshirt: ["pullover", "jumper", "crewneck"],
  jumper: ["sweater", "pullover", "sweatshirt"],
  hoodie: ["hooded", "sweatshirt"],
  tee: ["shirt", "tshirt"],
  tshirt: ["tee", "shirt"],
  jeans: ["denim", "pants", "trousers"],
  denim: ["jeans"],
  trousers: ["pants"],
  pants: ["trousers"],
  sneakers: ["shoes", "trainers"],
  trainers: ["sneakers", "shoes"],
  coat: ["jacket", "outerwear"],
  jacket: ["coat", "outerwear"],
  cardigan: ["sweater", "knitwear"],
  sweater: ["knitwear", "jumper", "pullover"],
  leggings: ["legging", "tights"],
  bag: ["handbag", "purse", "tote"],
  handbag: ["bag", "purse"],
};

/** Crude singular form — enough to match "Sweatshirts" against "sweatshirt". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(singular);
}

/** The item's words plus anything they're known by elsewhere. */
function expand(base: string[]): Set<string> {
  const out = new Set(base);
  for (const w of base) {
    for (const syn of SYNONYMS[w] ?? []) out.add(singular(syn));
  }
  return out;
}

/**
 * Pick a category from a marketplace's option list.
 *
 * Refuses rather than guesses in the two cases that actually bite:
 *  - the item's department is unknown and the options are gendered
 *  - the best option is gendered differently from the item
 */
export function pickCategory(item: ItemForMatching, options: string[]): CategoryChoice {
  if (options.length === 0) {
    return { value: null, reason: "No categories offered.", score: 0 };
  }

  const gendered = options.filter((o) => departmentOf(o) !== null);

  if (!item.department && gendered.length > 0) {
    return {
      value: null,
      reason:
        "These categories are split by department and this item doesn't record one. " +
        "Set the department to let Threader choose.",
      score: 0,
    };
  }

  const haystack = expand(
    words([item.title, item.category, item.material].filter(Boolean).join(" "))
  );

  let best: { option: string; score: number } | null = null;

  for (const option of options) {
    const optionDept = departmentOf(option);

    // A department mismatch is disqualifying, not a penalty. Unisex options
    // suit anyone; an item marked unisex may go anywhere.
    if (
      optionDept &&
      optionDept !== "unisex" &&
      item.department &&
      item.department !== "unisex" &&
      optionDept !== item.department
    ) {
      continue;
    }

    // Score on the leaf, which carries the garment type, and give the rest of
    // the path a smaller voice.
    const parts = option.split(">").map((p) => p.trim());
    const leaf = words(parts[parts.length - 1] ?? "");
    const rest = words(parts.slice(0, -1).join(" "));

    let score = 0;
    for (const w of leaf) if (haystack.has(w)) score += 2;
    for (const w of rest) if (haystack.has(w)) score += 0.5;

    // Normalise so a long path can't win on length alone.
    const possible = leaf.length * 2 + rest.length * 0.5 || 1;
    const normalised = score / possible;

    if (!best || normalised > best.score) best = { option, score: normalised };
  }

  if (!best || best.score === 0) {
    return {
      value: null,
      reason: "Nothing in the item's title matched any category on offer.",
      score: 0,
    };
  }

  return {
    value: best.option,
    reason: `Matched "${best.option}" on the item's title.`,
    score: Math.min(1, best.score),
  };
}

export interface BrandChoice {
  value: string | null;
  reason: string;
  exact: boolean;
}

/**
 * Brands whose marketplace name differs from what a seller writes.
 *
 * Exact-or-nothing is the right rule — it's what stops "Alo" selecting "Aloye"
 * — but on its own it fails honest cases: Vinted lists "Alo Yoga" and has no
 * bare "Alo", so a correctly-labelled item got no brand at all.
 *
 * The fix is a curated table, not looser matching. Each entry is a deliberate
 * statement that these two names are the same company; a prefix rule would let
 * Aloye back in. Add entries from real misses — the filler reports them.
 */
const BRAND_ALIASES: Record<string, string[]> = {
  alo: ["Alo Yoga"],
  "alo yoga": ["Alo"],
  "north face": ["The North Face"],
  "the north face": ["North Face"],
  levis: ["Levi's", "Levi Strauss"],
  "levi s": ["Levi's"],
  carhartt: ["Carhartt WIP"],
  "carhartt wip": ["Carhartt"],
  patagonia: ["Patagonia"],
  "urban outfitters": ["UO", "Urban Outfitters"],
  uo: ["Urban Outfitters"],
  "lululemon athletica": ["Lululemon"],
  lululemon: ["Lululemon Athletica"],
  "abercrombie": ["Abercrombie & Fitch", "Abercrombie and Fitch"],
  "american eagle": ["American Eagle Outfitters", "AE"],
  "brandy melville": ["Brandy Melville"],
  nike: ["Nike"],
  adidas: ["Adidas", "adidas Originals"],
};

/**
 * Pick a brand from a typeahead's options.
 *
 * Exact, case-insensitive, punctuation-insensitive — or nothing. This is the
 * rule that stops "Alo" selecting "Aloye". There is deliberately no fuzzy
 * fallback: an unbranded listing is recoverable, a mislabelled one is not.
 */
export function pickBrand(brand: string | null | undefined, options: string[]): BrandChoice {
  if (!brand || !brand.trim()) {
    return { value: null, reason: "No brand recorded on the item.", exact: false };
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(brand);

  const exact = options.find((o) => norm(o) === target);
  if (exact) {
    return { value: exact, reason: `Exact match for "${brand}".`, exact: true };
  }

  // Then the alias table, still on exact equality — "Alo" finds "Alo Yoga"
  // because we said those are the same company, not because one is a prefix.
  const aliases = BRAND_ALIASES[brand.trim().toLowerCase()] ?? [];
  for (const alias of aliases) {
    const hit = options.find((o) => norm(o) === norm(alias));
    if (hit) {
      return {
        value: hit,
        reason: `"${brand}" is listed as "${hit}" here.`,
        exact: true,
      };
    }
  }

  const near = options.filter((o) => norm(o).startsWith(target)).slice(0, 3);
  return {
    value: null,
    reason: near.length
      ? `No exact match for "${brand}". Closest were ${near.join(", ")} — left blank rather than risk the wrong label.`
      : `No exact match for "${brand}".`,
    exact: false,
  };
}

/** Marketplace condition vocabularies, keyed by ours. */
export const CONDITION_MAP: Record<string, Record<string, string>> = {
  mercari: {
    new_with_tags: "New",
    new_without_tags: "Like new",
    excellent: "Like new",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  },
  depop: {
    new_with_tags: "Brand new",
    new_without_tags: "Like new",
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
  },
  vinted: {
    new_with_tags: "New with tags",
    new_without_tags: "New without tags",
    excellent: "Very good",
    good: "Good",
    fair: "Satisfactory",
    poor: "Satisfactory",
  },
  grailed: {
    new_with_tags: "New with tags",
    new_without_tags: "New without tags",
    excellent: "Gently used",
    good: "Used",
    fair: "Very worn",
    poor: "Very worn",
  },
};

export function pickCondition(channel: string, condition: string): string | null {
  return CONDITION_MAP[channel]?.[condition] ?? null;
}

/**
 * Every name this brand might be listed under, most canonical first.
 *
 * Sent to the extension in the listing payload, because the extension is the
 * only thing that can see a marketplace's actual brand list — the server can
 * offer candidates, but only the browser can check them against the options.
 */
export function brandCandidates(brand: string | null | undefined): string[] {
  if (!brand || !brand.trim()) return [];
  const key = brand.trim().toLowerCase();
  return [brand.trim(), ...(BRAND_ALIASES[key] ?? [])];
}
