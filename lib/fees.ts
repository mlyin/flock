/**
 * Fee rules are DATA, not code. Rates drift constantly — a change should be an
 * edit to this table, not a rewrite of a calculation.
 *
 * VERIFY THESE. Every number below is a starting point pulled from public fee
 * pages and will go stale. `verifiedOn` is there to shame you into rechecking.
 */

export type Channel = "ebay" | "poshmark" | "depop" | "mercari" | "vinted" | "grailed";

export const CHANNELS: Channel[] = ["ebay", "poshmark", "depop", "mercari", "vinted", "grailed"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  ebay: "eBay",
  poshmark: "Poshmark",
  depop: "Depop",
  mercari: "Mercari",
  grailed: "Grailed",
  vinted: "Vinted",
};

/** Short form for the channel matrix, where horizontal space is scarce. */
export const CHANNEL_ABBR: Record<Channel, string> = {
  ebay: "EB",
  poshmark: "PM",
  depop: "DP",
  mercari: "MC",
  grailed: "GR",
  vinted: "VT",
};

/** How each channel can be written to. Drives what stage 03 can automate. */
export const CHANNEL_ACCESS: Record<Channel, "api" | "extension"> = {
  ebay: "api",
  poshmark: "extension",
  depop: "extension",
  mercari: "extension",
  grailed: "extension",
  vinted: "extension",
};

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
 * What you'd clear on this item, on this channel, at this price — before cost basis.
 * Use it to answer "where should I list this?" rather than guessing at headline rates.
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
