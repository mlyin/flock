/**
 * Fee rules are DATA, not code. Rates drift constantly — a change should be an
 * edit to this table, not a rewrite of a calculation.
 *
 * VERIFY THESE. Every number below is a starting point pulled from public fee
 * pages and will go stale. `verifiedOn` is there to shame you into rechecking.
 */

export type Channel =
  | "ebay"
  | "poshmark"
  | "depop"
  | "mercari"
  | "vinted"
  | "grailed"
  | "therealreal"
  | "facebook"
  | "stockx";

export const CHANNELS: Channel[] = [
  "ebay",
  "poshmark",
  "depop",
  "mercari",
  "vinted",
  "grailed",
  "facebook",
  "stockx",
  "therealreal",
];

export const CHANNEL_LABEL: Record<Channel, string> = {
  ebay: "eBay",
  poshmark: "Poshmark",
  depop: "Depop",
  mercari: "Mercari",
  grailed: "Grailed",
  vinted: "Vinted",
  facebook: "Facebook Marketplace",
  stockx: "StockX",
  therealreal: "The RealReal",
};

/** Short form for the channel matrix, where horizontal space is scarce. */
export const CHANNEL_ABBR: Record<Channel, string> = {
  ebay: "EB",
  poshmark: "PM",
  depop: "DP",
  mercari: "MC",
  grailed: "GR",
  vinted: "VT",
  facebook: "FB",
  stockx: "SX",
  therealreal: "TRR",
};

/**
 * How each channel can be written to.
 *
 * `manual` is not "we haven't got to it yet" — it means automation is the wrong
 * tool for that channel.
 *
 * CORRECTION, 19 Aug 2026: The RealReal was listed here as `manual` on the
 * grounds that it "has no per-item listing form". That was wrong, and it was
 * wrong because I stopped reading the funnel one screen early. Sell → Ship to
 * Us → START lands on /sell-trr/packing-list, which is a real per-item form:
 * Category, Designer, Item Type, Add Item, repeated for every piece in the box.
 * It loads fine in an automated tab. (The separate note about the seller
 * DASHBOARD refusing automated tabs still stands — different page.)
 *
 * It's still consignment, so it still isn't a listing: no price, no photos, no
 * copy, because they do all of that. What Flock fills is the manifest.
 *
 * Flock still earns its keep on a manual channel: it tracks custody, projects
 * the payout, and writes the intake condition report. It just doesn't pretend
 * to click through a form that doesn't exist.
 */
export const CHANNEL_ACCESS: Record<Channel, "api" | "extension" | "manual"> = {
  ebay: "api",
  poshmark: "extension",
  depop: "extension",
  mercari: "extension",
  grailed: "extension",
  vinted: "extension",
  facebook: "extension",
  stockx: "extension",
  therealreal: "extension",
};

/**
 * Channels that take physical custody of the item.
 *
 * You ship the garment to them; they authenticate, photograph, price and sell
 * it. Two consequences the rest of the app has to respect:
 *
 * 1. **Consigning is exclusive.** While they hold it you cannot fulfil a sale
 *    anywhere else, so a consigned item must not be offered for listing on
 *    another channel. See `items.custody`.
 * 2. **You don't set the price.** Every other channel's net is "what I clear at
 *    my ask". Here the consignor prices it, so the honest projection is a
 *    payout band against an *estimated* sale price, not a number.
 */
/**
 * Channels a filler actually exists for, today.
 *
 * Separate from CHANNEL_ACCESS on purpose. Access says how a channel COULD
 * be written to; this says what is built. Facebook Marketplace is an
 * extension channel with no fill-facebook.js behind it, so offering a Fill
 * button there is a button whose only possible outcome is an error — the
 * same mistake The RealReal already taught us.
 *
 * Add a channel here the moment its filler lands, and not before.
 */
export const FILLABLE: Channel[] = ["depop", "mercari", "vinted", "grailed", "therealreal"];

export const canFill = (channel: Channel) => FILLABLE.includes(channel);

export const CONSIGNMENT: Channel[] = ["therealreal"];

export const isConsignment = (channel: Channel) => CONSIGNMENT.includes(channel);

type Basis = "item" | "item_plus_shipping";
export type FeeKind = "commission" | "payment" | "shipping" | "promo";

type Rule =
  | { kind: FeeKind; label: string; type: "percent"; rate: number; basis: Basis }
  | { kind: FeeKind; label: string; type: "flat"; amount: number }
  | {
      kind: FeeKind;
      label: string;
      type: "tiered";
      threshold: number;
      below: { amount: number };
      atOrAbove: { rate: number; basis: Basis };
    }
  // Grailed's shape: a lower percentage under the threshold, with a floor.
  | {
      kind: FeeKind;
      label: string;
      type: "tiered_percent";
      threshold: number;
      below: { rate: number; basis: Basis; min?: number };
      atOrAbove: { rate: number; basis: Basis };
    }
  // eBay's per-order fee: one flat under the threshold, another at or above.
  | {
      kind: FeeKind;
      label: string;
      type: "flat_tiered";
      threshold: number;
      below: { amount: number };
      atOrAbove: { amount: number };
    };

export type ChannelFees = {
  verifiedOn: string;
  note: string;
  rules: Rule[];
};

/**
 * Verified against each marketplace's OWN fee pages on 2026-08-19. Source
 * URLs are in each note, because a rate without a source decays back into
 * folklore the first time someone edits it.
 *
 * The two headline corrections, because they change routing answers:
 * Depop removed its 10% US selling fee in July 2024 — this table was showing
 * Depop as one of the worst channels when it is close to the best. And
 * Mercari charges sellers no payment processing at all; that fee was always
 * buyer-paid.
 */
export const FEE_RULES: Record<Channel, ChannelFees> = {
  ebay: {
    verifiedOn: "2026-08-19",
    note:
      "Clothing final value fee 13.6% of item + shipping + tax, up to $7,500 per item (2.35% beyond, not modelled). " +
      "Per-order fee $0.30 up to $10, $0.40 above. First 250 listings/month free. Handbags 15%, jewellery 15% — category " +
      "exceptions not modelled. Source: ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822",
    rules: [
      { kind: "commission", label: "Final value fee", type: "percent", rate: 0.136, basis: "item_plus_shipping" },
      {
        kind: "payment",
        label: "Per-order fee",
        type: "flat_tiered",
        threshold: 10,
        below: { amount: 0.3 },
        atOrAbove: { amount: 0.4 },
      },
    ],
  },
  poshmark: {
    verifiedOn: "2026-08-19",
    note:
      "Flat $2.95 under $15, straight 20% at $15 or more. No separate payment fee. (Texas sellers carry an extra " +
      "state fee tax since Oct 2025 — not modelled.) Source: support.poshmark.com article 297755057",
    rules: [
      {
        kind: "commission",
        label: "Poshmark fee",
        type: "tiered",
        threshold: 15,
        below: { amount: 2.95 },
        atOrAbove: { rate: 0.2, basis: "item" },
      },
    ],
  },
  depop: {
    verifiedOn: "2026-08-19",
    note:
      "NO selling fee for US sellers — the 10% commission was removed July 2024 (it survives only outside UK/US/AUS). " +
      "Sellers pay payment processing only: 3.3% + $0.45 on item + shipping (+ tax, not modelled). The up-to-5% " +
      "marketplace fee is BUYER-paid. Optional 12% boosting fee applies only to boosted listings. " +
      "Source: depop.com/help/seller-fees-and-charges",
    rules: [
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.033, basis: "item_plus_shipping" },
      { kind: "payment", label: "Processing flat", type: "flat", amount: 0.45 },
    ],
  },
  mercari: {
    verifiedOn: "2026-08-19",
    note:
      "10% selling fee on item + buyer-paid shipping, for listings made or updated after 6 Jan 2025. Sellers pay NO " +
      "payment processing — the old 2.9% + $0.50 was buyer-paid and has been eliminated. Instant Pay $3 and " +
      "cancellation fees exist but are not per-sale. Source: mercari.com/us/help_center/article/169",
    rules: [
      { kind: "commission", label: "Selling fee", type: "percent", rate: 0.1, basis: "item_plus_shipping" },
    ],
  },
  grailed: {
    verifiedOn: "2026-08-19",
    note:
      "Commission is tiered since 20 May 2026: 6% (min $1.99) under $120, 9% at $120+. Basis includes buyer-paid " +
      "shipping unless a Grailed Label is used. Processing modelled as US-domestic Stripe-onboarded: 3.49% + $0.49 " +
      "(international 4.99%, non-onboarded +$0.50 — not modelled). Sources: support.grailed.com articles " +
      "30282580172045 and 30299544492301",
    rules: [
      {
        kind: "commission",
        label: "Grailed fee",
        type: "tiered_percent",
        threshold: 120,
        below: { rate: 0.06, basis: "item_plus_shipping", min: 1.99 },
        atOrAbove: { rate: 0.09, basis: "item_plus_shipping" },
      },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.0349, basis: "item_plus_shipping" },
      { kind: "payment", label: "Processing flat", type: "flat", amount: 0.49 },
    ],
  },
  vinted: {
    verifiedOn: "2026-08-19",
    note:
      "Confirmed: zero mandatory seller fees — the buyer pays the protection fee ($0.70 + 5% US). Bumps and " +
      "spotlight are optional. This is why Vinted nets highest at low prices. Source: vinted.co.uk/help/373",
    rules: [],
  },
  facebook: {
    verifiedOn: "unverified",
    note:
      "Local pickup is free — cash changes hands and Meta isn't involved. The fee only applies to shipped orders, " +
      "with a minimum on cheap items. Because the same listing can settle either way, a net figure here is a " +
      "guess about how it sells, not a property of the channel. Modelled as shipped, the worse case.",
    rules: [
      { kind: "commission", label: "Selling fee (shipped orders)", type: "percent", rate: 0.05, basis: "item" },
    ],
  },
  stockx: {
    verifiedOn: "unverified",
    note:
      "CATALOG-MATCHED — you place an ask against a product already in StockX's catalog, keyed by style code; " +
      "there is no listing to write. Fees are tiered by seller level and have changed repeatedly: modelled here " +
      "as the entry level, roughly 9% transaction + 3% payment processing. Sneakers-first; apparel coverage is " +
      "thinner, and an item not in the catalog cannot be sold at all. Verify against a real payout before " +
      "trusting any net. A failed authentication also carries a penalty not modelled here. " +
      "READ LIVE 19 Aug 2026: the ask flow is a URL, /sell/{slug}?defaultAsk=true, not a modal — but it " +
      "REDIRECTS to /selling/onboarding until the seller account has a payment method and verified identity, " +
      "so the ask form itself has never been read and no filler exists. See extension/SELECTORS.md.",
    rules: [
      { kind: "commission", label: "Transaction fee", type: "percent", rate: 0.09, basis: "item" },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.03, basis: "item" },
    ],
  },
  therealreal: {
    verifiedOn: "unverified",
    note:
      "CONSIGNMENT — read this before trusting any number. The RealReal sets the sale price, not you, and pays a " +
      "commission on whatever it eventually sells for. The rate is tiered by category and by your trailing annual " +
      "sales, so a single percentage is a simplification of a table that moves. Fine jewellery and watches are on " +
      "different terms again. The commission below is a placeholder standing in for the lowest ordinary tier: it " +
      "will understate what a high-volume consignor earns and may overstate a first-timer's. Verify against a real " +
      "payout statement before showing anyone a net.",
    rules: [
      { kind: "commission", label: "Consignment commission", type: "percent", rate: 0.45, basis: "item" },
    ],
  },
};

export type ComputedFee = { kind: FeeKind; label: string; amount: number };

/** Round to cents once, at the point of producing a fee — never mid-calculation. */
const cents = (n: number) => Math.round(n * 100) / 100;

export function computeFees(
  channel: Channel,
  sale: { soldPrice: number; shippingCollected: number }
): ComputedFee[] {
  const basisAmount = (basis: Basis) =>
    basis === "item" ? sale.soldPrice : sale.soldPrice + sale.shippingCollected;

  return FEE_RULES[channel].rules.map((rule): ComputedFee => {
    switch (rule.type) {
      case "percent":
        return { kind: rule.kind, label: rule.label, amount: cents(basisAmount(rule.basis) * rule.rate) };
      case "flat":
        return { kind: rule.kind, label: rule.label, amount: cents(rule.amount) };
      case "tiered":
        return sale.soldPrice < rule.threshold
          ? { kind: rule.kind, label: `${rule.label} (flat)`, amount: cents(rule.below.amount) }
          : {
              kind: rule.kind,
              label: rule.label,
              amount: cents(basisAmount(rule.atOrAbove.basis) * rule.atOrAbove.rate),
            };
      case "tiered_percent": {
        const tier = sale.soldPrice < rule.threshold ? rule.below : rule.atOrAbove;
        const raw = basisAmount(tier.basis) * tier.rate;
        const min = "min" in tier && typeof tier.min === "number" ? tier.min : 0;
        const floored = Math.max(raw, min);
        return { kind: rule.kind, label: rule.label, amount: cents(floored) };
      }
      case "flat_tiered": {
        const amount = basisAmount("item_plus_shipping") <= rule.threshold ? rule.below.amount : rule.atOrAbove.amount;
        return { kind: rule.kind, label: rule.label, amount: cents(amount) };
      }
    }
  });
}

/**
 * What a consignor would pay you if the item sold at this price.
 *
 * Separate from `projectedNet` because the input means something different. On
 * Depop, `price` is a decision you made and the net follows from it. Here it's
 * an assumption about what a stranger will price it at and what a buyer will
 * pay — so the honest presentation is a band and a label saying "if it sells
 * around this", never a figure sitting next to real ones as though it were the
 * same kind of fact.
 */
export function projectedPayout(
  channel: Channel,
  estimatedSalePrice: number
): { low: number; high: number } {
  const fees = computeFees(channel, { soldPrice: estimatedSalePrice, shippingCollected: 0 });
  const commission = fees.reduce((sum, f) => sum + f.amount, 0);
  const mid = estimatedSalePrice - commission;

  // ±20% around the point estimate. The commission tier alone moves the payout
  // by more than that, and pretending otherwise is how a guess starts looking
  // like a quote.
  return { low: cents(mid * 0.8), high: cents(mid * 1.2) };
}

/**
 * What you'd clear on this item, on this channel, at this price — before cost basis.
 * Use it to answer "where should I list this?" rather than guessing at headline rates.
 *
 * Not meaningful for consignment channels, where you don't set the price —
 * use `projectedPayout` for those.
 */
export function projectedNet(
  channel: Channel,
  price: number,
  opts: { shippingCollected?: number; shippingCost?: number } = {}
): number {
  const shippingCollected = opts.shippingCollected ?? 0;
  const shippingCost = opts.shippingCost ?? 0;
  const fees = computeFees(channel, { soldPrice: price, shippingCollected });
  const total = fees.reduce((sum, f) => sum + f.amount, 0);
  return cents(price + shippingCollected - total - shippingCost);
}

/**
 * The ask that clears a target net — `projectedNet` run backwards.
 *
 * "I paid $30 and want $40 out of it" is the question sellers actually have,
 * and answering it by hand means guessing a price, computing the fees,
 * discovering you're $3 short, and guessing again. Worse, the answer differs
 * per channel by more than people expect: Vinted takes nothing, Poshmark takes
 * a fifth, and the gap is the whole reason to cross-list.
 *
 * Not a bisection. Fee curves are piecewise linear but NOT monotonic — at
 * Poshmark's $15 boundary the net drops from $12.04 to $12.00, so a target
 * landing in that gap has a solution below the threshold and none just above
 * it, and a bisection would walk straight past it. Instead: cut the domain at
 * every breakpoint, invert the straight line inside each piece, and take the
 * cheapest ask that works.
 *
 * Returns null when no ask clears the target (fees outrun the price) and for
 * consignment channels, where the seller doesn't set the price at all.
 */
export function askForNet(
  channel: Channel,
  targetNet: number,
  opts: { shippingCollected?: number; shippingCost?: number } = {}
): number | null {
  if (isConsignment(channel)) return null;
  if (!Number.isFinite(targetNet)) return null;

  const shippingCollected = opts.shippingCollected ?? 0;
  const CEILING = 100_000;

  // Every price at which the fee formula changes shape. A segment between two
  // of these is a straight line, which is the only thing we can invert.
  const breaks = new Set<number>([0]);
  for (const rule of FEE_RULES[channel].rules) {
    if (rule.type === "tiered" || rule.type === "tiered_percent") {
      breaks.add(rule.threshold);
    }
    if (rule.type === "flat_tiered") {
      // This threshold is measured on item + shipping, so it bites at a lower ask.
      breaks.add(rule.threshold - shippingCollected);
    }
    if (rule.type === "tiered_percent" && typeof rule.below.min === "number") {
      // Below this ask the minimum fee applies as a flat, not as a percentage.
      const offset = rule.below.basis === "item_plus_shipping" ? shippingCollected : 0;
      breaks.add(rule.below.min / rule.below.rate - offset);
    }
  }

  const edges = [...breaks].filter((p) => p > 0 && p < CEILING).sort((a, b) => a - b);
  const bounds = [0, ...edges, CEILING];

  let best: number | null = null;

  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    if (hi - lo < 0.02) continue;

    // Two interior samples pin down the line without touching either edge,
    // where the rule that applies is exactly what's in question.
    const a = lo + (hi - lo) * 0.25;
    const b = lo + (hi - lo) * 0.75;
    const netA = projectedNet(channel, a, opts);
    const netB = projectedNet(channel, b, opts);

    const slope = (netB - netA) / (b - a);
    if (slope <= 0) continue; // Raising the price doesn't raise the net: no answer here.

    const solved = a + (targetNet - netA) / slope;
    if (solved < lo || solved > hi) continue;

    // Round the ask UP to the cent. Rounding down would show a price that
    // lands a penny short of the number the seller just typed.
    let ask = Math.ceil(solved * 100) / 100;
    // The rounding can cross the segment edge into a worse fee tier; a few
    // cents of correction is cheaper than special-casing it.
    for (let guard = 0; guard < 5 && projectedNet(channel, ask, opts) < targetNet; guard++) {
      ask = cents(ask + 0.01);
    }
    if (projectedNet(channel, ask, opts) < targetNet) continue;

    if (best === null || ask < best) best = ask;
  }

  return best;
}

export type AskPlan = {
  channel: Channel;
  /** What to list it at. Null when no price clears the target, or on consignment. */
  ask: number | null;
  /** Total fees at that ask. */
  fees: number;
  /** What lands in your account. */
  net: number;
  /** Net minus what you paid. */
  profit: number;
};

/**
 * The same question answered for every channel at once, cheapest ask first.
 *
 * Cheapest ask is the useful order: the channel that needs the lowest price to
 * hit your number is the one most likely to actually sell.
 */
export function askPlan(
  channels: Channel[],
  input: { costBasis: number; targetProfit: number; shippingCollected?: number; shippingCost?: number }
): AskPlan[] {
  const targetNet = input.costBasis + input.targetProfit;
  const opts = { shippingCollected: input.shippingCollected, shippingCost: input.shippingCost };

  return channels
    .map((channel): AskPlan => {
      const ask = askForNet(channel, targetNet, opts);
      if (ask === null) return { channel, ask: null, fees: 0, net: 0, profit: 0 };

      const fees = computeFees(channel, {
        soldPrice: ask,
        shippingCollected: input.shippingCollected ?? 0,
      }).reduce((sum, f) => sum + f.amount, 0);
      const net = projectedNet(channel, ask, opts);

      return { channel, ask, fees: cents(fees), net, profit: cents(net - input.costBasis) };
    })
    .sort((a, b) => {
      if (a.ask === null) return 1;
      if (b.ask === null) return -1;
      return a.ask - b.ask;
    });
}

/**
 * Where on StockX this garment might be, if it's there at all.
 *
 * StockX has no listing form — you place an Ask against a product already in
 * their catalog, and the join key is the manufacturer's style code (verified
 * 19 Aug 2026: product pages carry it as a `Style` trait and in the page title,
 * e.g. `S57WR0139 P3827 H8396`, and search accepts it).
 *
 * This returns a SEARCH, never a product. Searching that style code returned
 * eight results, the right one first and a near-duplicate sibling second — so
 * "resolve the code and take the top hit" is the Aloye trap with the worst
 * stakes on any channel: a wrong catalog match ships a real shoe to an
 * authenticator against another product's listing. The seller picks.
 */
export function stockxSearchUrl(item: {
  style_code?: string | null;
  brand?: string | null;
  title?: string | null;
}): string | null {
  // The style code is the only query that narrows meaningfully. Brand plus
  // title returned a thousand results on a real garment, which is not a lead.
  const query = item.style_code?.trim() || [item.brand, item.title].filter(Boolean).join(" ").trim();
  if (!query) return null;
  return `https://stockx.com/search?s=${encodeURIComponent(query)}`;
}
