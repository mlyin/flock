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
  | "stockx"
  | "vestiaire";

export const CHANNELS: Channel[] = [
  "ebay",
  "poshmark",
  "depop",
  "mercari",
  "vinted",
  "grailed",
  "facebook",
  "stockx",
  "vestiaire",
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
  vestiaire: "Vestiaire Collective",
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
  vestiaire: "VC",
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
  // Was "api" — the developer account was rejected, and the sell form fills
  // perfectly well from the seller's own browser in the meantime.
  ebay: "extension",
  poshmark: "extension",
  depop: "extension",
  mercari: "extension",
  grailed: "extension",
  vinted: "extension",
  facebook: "extension",
  stockx: "extension",
  vestiaire: "extension",
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
 * be written to; this says what is built. A channel listed here with no filler
 * behind it is a Fill button whose only possible outcome is an error — the
 * mistake The RealReal already taught us.
 *
 * Add a channel here the moment its filler lands, and not before.
 * Facebook joined 21 Aug 2026, after its form was read off the live page.
 *
 * Still absent, all for the same reason — nobody has read their form signed in:
 * Poshmark, Vestiaire, StockX.
 */
export const FILLABLE: Channel[] = [
  "depop",
  "mercari",
  "vinted",
  "grailed",
  "therealreal",
  "ebay",
  "facebook",
];

export const canFill = (channel: Channel) => FILLABLE.includes(channel);

export const CONSIGNMENT: Channel[] = ["therealreal"];

export const isConsignment = (channel: Channel) => CONSIGNMENT.includes(channel);

type Basis = "item" | "item_plus_shipping";
export type FeeKind = "commission" | "payment" | "shipping" | "promo";

type Rule =
  | {
      kind: FeeKind;
      label: string;
      type: "percent";
      rate: number;
      basis: Basis;
      /** Vestiaire: 12% but never less than $10 and never more than $2,000. */
      min?: number;
      max?: number;
    }
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
    }
  // The RealReal's shape: a whole ladder of price bands, each with its own
  // rate, applied to the item's own price. Not two tiers with a threshold —
  // nine bands, and the edges are hard steps, so a $99 sale and a $100 sale
  // are ten points apart.
  | {
      kind: FeeKind;
      label: string;
      type: "bands";
      basis: Basis;
      /** Ascending by `from`. The first must be 0; the last has no upper edge. */
      bands: Array<{ from: number; rate: number }>;
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
    verifiedOn: "2026-08-20",
    note:
      "10% per transaction with a $0.80 minimum, on item + shipping + TAX. The 5%/$0.40 figure that saturates " +
      "blogs is dead twice over: it was the old Marketplace rate, and the Shops page it now redirects to retired " +
      "onsite checkout in Sept 2025 — using it understates the fee by half. The basis is the trap here: shipping " +
      "and sales tax are usually buyer-paid money the seller never receives, yet both inflate the commission, so " +
      "10% of the item price alone is systematically too low. Local pickup is free — cash changes hands and Meta " +
      "is not involved — so the same listing settles two ways and this models the worse one. The $0.80 floor is " +
      "per TRANSACTION (goods shipped together count once) per the legal page; the help centre says per item, and " +
      "on a multi-item sub-$8 shipment those differ. Not modelled: the $20 chargeback fee, and payouts held once " +
      "sales pass an unstated limit without a tax ID. Whether the 10% is credited back on an ordinary refund is " +
      "not documented on any official page. Source: facebook.com/legal/merchant_policies and " +
      "facebook.com/help/376859780413203 (\"applied to the total cost, including tax and shipping\").",
    rules: [
      {
        kind: "commission",
        label: "Selling fee (shipped orders)",
        type: "percent",
        rate: 0.1,
        basis: "item_plus_shipping",
        min: 0.8,
      },
    ],
  },
  stockx: {
    verifiedOn: "2026-08-20",
    note:
      "CATALOG-MATCHED — you place an ask against a product already in StockX's catalog, keyed by style code; " +
      "there is no listing to write. Modelled as Level 1, the level every new seller starts at: 9% transaction " +
      "fee on the final sale price, plus 3% payment processing, plus $5 US seller shipping (raised from $4 on " +
      "1 March 2026). Levels 2-5 pay 8.5/8/7.5/7% at 12 sales or $1,500 / 40 or $5,000 / 200 or $25,000 / 800 or " +
      "$100,000 in a calendar quarter, held for that quarter and the next — so this OVERSTATES fees for a " +
      "high-volume seller, which is the safe direction. Not modelled: Flex sales pay 2 points MORE at every level " +
      "(Level 1 Flex = 11%) since 1 March 2026; the $15 flat penalty for shipping late, failing condition " +
      "guidelines, or mismatching the listing; the Level 3-5 penalty for missing ship deadlines on 5%+ of orders; " +
      "non-US shipping, which runs to EUR 35 and $48 in some regions against the $5 modelled here. StockX does " +
      "not say whether the $5 regional minimum seller fee applies to the transaction fee alone or to both fees " +
      "together — a genuine gap in their own documentation. " +
      "READ LIVE 19 Aug 2026: the ask flow is a URL, /sell/{slug}?defaultAsk=true, not a modal — but it " +
      "REDIRECTS to /selling/onboarding until the seller account has a payment method and verified identity, " +
      "so the ask form itself has never been read and no filler exists. See extension/SELECTORS.md. " +
      "Sources: stockx.com/help/en_US/sell/fees-and-payouts and stockx.com/news/updates-to-the-stockx-seller-program",
    rules: [
      { kind: "commission", label: "Transaction fee (Level 1)", type: "percent", rate: 0.09, basis: "item" },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.03, basis: "item" },
      { kind: "shipping", label: "Seller shipping (US)", type: "flat", amount: 5 },
    ],
  },
  vestiaire: {
    verifiedOn: "2026-08-19",
    note:
      "MARKETPLACE, not consignment — the SELLER sets the price (Seller T&Cs, updated 9 Mar 2026: Vestiaire may " +
      "suggest a price but it 'shall only become effective upon acceptance by the Seller'). Selling fee is a flat " +
      "12% of the item price with a $10 floor (items under $83) and a $2,000 cap (items over $16,667) — the " +
      "five-band 25/20/18/15/12 schedule that circulates on blogs is NOT Vestiaire's and is contradicted by their " +
      "own page. Seller also pays 3% payment processing, minimum $3. " +
      "BUYER-paid and therefore NOT deducted here: the Buyer Service Fee (5-28%, min $5, capped $300) and the $15 " +
      "authentication fee — they inflate what the buyer pays, which suppresses sell-through at a given ask, but " +
      "they never touch the seller's net. Minimum listing price $18. Seller T&Cs also cap total seller fees at " +
      "30% of the price, which only binds on cheap items where the $10 + $3 minimums exceed it — not modelled, " +
      "and Vestiaire don't explain how the cap interacts with the floors. " +
      "Outbound shipping is on a Vestiaire-issued prepaid label; whether US sellers are ever charged for it is " +
      "NOT confirmed from an official page, so no shipping deduction is modelled. Effective for USD from " +
      "18 Jul 2025. Sources: faq.vestiairecollective.com/hc/en-us/articles/24659638721425-Seller-Selling-Fees " +
      "and .../8982306039313-Seller-Terms-Conditions",
    rules: [
      {
        kind: "commission",
        label: "Selling fee",
        type: "percent",
        rate: 0.12,
        basis: "item",
        min: 10,
        max: 2000,
      },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.03, basis: "item", min: 3 },
    ],
  },
  therealreal: {
    verifiedOn: "2026-08-20",
    note:
      "CONSIGNMENT — The RealReal sets the sale price, not you, and pays a commission on whatever it eventually " +
      "sells for. There is no single rate: five category tables of price bands, and the band is set by THAT " +
      "item's own net selling price, not a blended account rate. Modelled below is Clothing & More — women's and " +
      "men's clothing, shoes, accessories, unbranded jewellery — which is what a resale closet actually consigns. " +
      "Band edges are hard steps, so a $99 sale keeps 20% and a $100 sale keeps 30%. The old flat 45% placeholder " +
      "was wrong in both directions: far too generous under $200 and far too harsh above $750. " +
      "Other categories are better and are NOT modelled: handbags reach 80% over $7,500, watches 85%, men's " +
      "sneakers 85% from just $1,000, and branded fine jewellery skips the 60% band entirely (55% to 65% at $300). " +
      "Also not modelled: the RealReal Rewards bonus, which adds 1/2/5 points for $1,500/$5,000/$10,000 of " +
      "trailing sales but ONLY on items at $200 and over; the $12.50 fee on their DEFAULT payout method, a mailed " +
      "check; $20 per item ($100 for fine art or oversized) to pull an unsold item back inside 365 days, waived " +
      "for VIP consignors; and the 5% uplift for taking site credit instead of cash, which multiplies the " +
      "commission rather than adding points. Basis is net selling price — after discounts, before tax and " +
      "shipping. Sources: therealreal.com/seller/commissions, /consignor_terms, /faq/consign, /returns",
    rules: [
      {
        kind: "commission",
        label: "Consignment commission (clothing & accessories)",
        type: "bands",
        basis: "item",
        // TRR's chart states the SELLER's share; these are its complement,
        // what they keep. 20% payout is an 80% commission.
        bands: [
          { from: 0, rate: 0.8 },
          { from: 100, rate: 0.7 },
          { from: 150, rate: 0.55 },
          { from: 200, rate: 0.45 },
          { from: 300, rate: 0.4 },
          { from: 750, rate: 0.35 },
          { from: 5000, rate: 0.3 },
        ],
      },
    ],
  },
};

export type ComputedFee = { kind: FeeKind; label: string; amount: number };

/** Round to cents once, at the point of producing a fee — never mid-calculation. */
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Channels whose rates nobody has checked against the marketplace's own page.
 *
 * Computed, never written down. The UI used to carry the sentence "every rate
 * is still unverified" in three places, and it stayed there after six of the
 * ten were verified -- so the product was understating its own honesty and the
 * warning had stopped meaning anything.
 */
export function unverifiedChannels(): Channel[] {
  return CHANNELS.filter((c) => FEE_RULES[c].verifiedOn === "unverified");
}

/**
 * One rule, in words, for the fee table page.
 *
 * Lives here rather than in the page because the shapes live here: a new rule
 * type should fail to compile until it can describe itself. The previous
 * version was a five-deep nested ternary in JSX that silently dropped the
 * min and max on percent rules — so Vestiaire's $10 floor and $2,000 cap, the
 * two numbers that most distort its take, were the ones you couldn't see.
 */
export function describeRule(rule: Rule): string {
  const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  switch (rule.type) {
    case "percent": {
      const bounds = [
        typeof rule.min === "number" ? `min ${money(rule.min)}` : null,
        typeof rule.max === "number" ? `max ${money(rule.max)}` : null,
      ].filter(Boolean);
      const on = rule.basis === "item_plus_shipping" ? " of item + shipping" : "";
      return `${pct(rule.rate)}${on}${bounds.length ? ` (${bounds.join(", ")})` : ""}`;
    }
    case "flat":
      return money(rule.amount);
    case "tiered":
      return `${money(rule.below.amount)} under ${money(rule.threshold)}, else ${pct(rule.atOrAbove.rate)}`;
    case "tiered_percent": {
      const floor = typeof rule.below.min === "number" ? ` (min ${money(rule.below.min)})` : "";
      return `${pct(rule.below.rate)}${floor} under ${money(rule.threshold)}, else ${pct(rule.atOrAbove.rate)}`;
    }
    case "flat_tiered":
      return `${money(rule.below.amount)} to ${money(rule.threshold)}, else ${money(rule.atOrAbove.amount)}`;
    case "bands":
      return rule.bands
        .map((b, i) => {
          const next = rule.bands[i + 1];
          const range = next ? `${money(b.from)}–${money(next.from - 0.01)}` : `${money(b.from)}+`;
          return `${range} ${pct(b.rate)}`;
        })
        .join(" · ");
  }
}

export function computeFees(
  channel: Channel,
  sale: { soldPrice: number; shippingCollected: number }
): ComputedFee[] {
  const basisAmount = (basis: Basis) =>
    basis === "item" ? sale.soldPrice : sale.soldPrice + sale.shippingCollected;

  return FEE_RULES[channel].rules.map((rule): ComputedFee => {
    switch (rule.type) {
      case "percent": {
        const raw = basisAmount(rule.basis) * rule.rate;
        const floored = typeof rule.min === "number" ? Math.max(raw, rule.min) : raw;
        const capped = typeof rule.max === "number" ? Math.min(floored, rule.max) : floored;
        return { kind: rule.kind, label: rule.label, amount: cents(capped) };
      }
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
      case "bands": {
        // The band is chosen by the item's own price even when the rate is
        // charged on a wider basis — The RealReal's ladder steps on the item.
        const band =
          [...rule.bands].reverse().find((b) => sale.soldPrice >= b.from) ?? rule.bands[0];
        return {
          kind: rule.kind,
          label: rule.label,
          amount: cents(basisAmount(rule.basis) * band.rate),
        };
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
    if (rule.type === "percent") {
      // A floor or cap turns a percentage into three pieces: flat at the
      // minimum, the percentage itself, flat at the maximum. Vestiaire is the
      // live case — 12% floored at $10 and capped at $2,000 — and without
      // these cuts the solver interpolates one line across all three pieces
      // and lands a $14 answer at $2,000. Found by the round-trip sweep.
      const offset = rule.basis === "item_plus_shipping" ? shippingCollected : 0;
      if (typeof rule.min === "number") breaks.add(rule.min / rule.rate - offset);
      if (typeof rule.max === "number") breaks.add(rule.max / rule.rate - offset);
    }
    if (rule.type === "flat_tiered") {
      // This threshold is measured on item + shipping, so it bites at a lower ask.
      breaks.add(rule.threshold - shippingCollected);
    }
    if (rule.type === "bands") {
      // Every band edge is a discontinuity. Only consignment uses this today,
      // and askForNet refuses consignment outright — but the solver must not
      // silently interpolate one line across a nine-step ladder the day some
      // non-consignment channel adopts the shape.
      for (const band of rule.bands) breaks.add(band.from);
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
