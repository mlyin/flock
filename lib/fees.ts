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
  | "facebook";

export const CHANNELS: Channel[] = [
  "ebay",
  "poshmark",
  "depop",
  "mercari",
  "vinted",
  "grailed",
  "facebook",
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
  therealreal: "TRR",
};

/**
 * How each channel can be written to.
 *
 * `manual` is not "we haven't got to it yet" — it means automation is the wrong
 * tool. The RealReal has no per-item listing form to fill: its Sell flow is a
 * lead capture (name, email, phone, postcode) that starts a consignment
 * conversation, after which you ship the item and *they* photograph, price and
 * list it. Its dashboard also returns "Access to this page has been denied" to
 * an automated tab, so it actively blocks this kind of driving. Read live,
 * 18 Aug 2026.
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
  therealreal: "manual",
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
export const FILLABLE: Channel[] = ["depop", "mercari", "vinted", "grailed"];

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
    };

export type ChannelFees = {
  verifiedOn: string;
  note: string;
  rules: Rule[];
};

export const FEE_RULES: Record<Channel, ChannelFees> = {
  ebay: {
    verifiedOn: "unverified",
    note: "Category-dependent. Clothing sits near 13.25%; store subscriptions lower it.",
    rules: [
      { kind: "commission", label: "Final value fee", type: "percent", rate: 0.1325, basis: "item_plus_shipping" },
      { kind: "payment", label: "Per-order fee", type: "flat", amount: 0.3 },
    ],
  },
  poshmark: {
    verifiedOn: "unverified",
    note: "Flat fee under the threshold, straight percentage above it. No separate payment fee.",
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
    verifiedOn: "unverified",
    note: "Selling fee plus payment processing. Processing rate varies by payment provider and region.",
    rules: [
      { kind: "commission", label: "Depop fee", type: "percent", rate: 0.1, basis: "item_plus_shipping" },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.033, basis: "item_plus_shipping" },
      { kind: "payment", label: "Processing flat", type: "flat", amount: 0.45 },
    ],
  },
  mercari: {
    verifiedOn: "unverified",
    note: "Selling fee plus processing. Mercari has restructured fees more than once — recheck.",
    rules: [
      { kind: "commission", label: "Selling fee", type: "percent", rate: 0.1, basis: "item" },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.029, basis: "item_plus_shipping" },
      { kind: "payment", label: "Processing flat", type: "flat", amount: 0.5 },
    ],
  },
  grailed: {
    verifiedOn: "unverified",
    note: "Commission plus payment processing. Grailed has changed its fee split more than once — recheck before trusting any net figure here.",
    rules: [
      { kind: "commission", label: "Grailed fee", type: "percent", rate: 0.09, basis: "item" },
      { kind: "payment", label: "Payment processing", type: "percent", rate: 0.0349, basis: "item_plus_shipping" },
      { kind: "payment", label: "Processing flat", type: "flat", amount: 0.49 },
    ],
  },
  vinted: {
    verifiedOn: "unverified",
    note: "No seller-side fee — the buyer pays the protection fee. This is why Vinted nets highest per sale.",
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
