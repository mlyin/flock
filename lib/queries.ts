import { all, one } from "./db";
import { CHANNELS, type Channel } from "./fees";

export type Item = {
  id: number;
  sku: string;
  title: string;
  brand: string | null;
  category: string;
  size: string | null;
  color: string | null;
  swatch: string | null;
  material: string | null;
  condition: string;
  flaws: string | null;
  measurements: string | null;
  cost_basis: number;
  acquired_at: string | null;
  source: string | null;
  status: string;
  review_state: string;
  notes: string | null;
  created_at: string;
};

export type Listing = {
  id: number;
  item_id: number;
  channel: Channel;
  external_id: string | null;
  url: string | null;
  title: string | null;
  description: string | null;
  price: number;
  shipping_price: number;
  status: string;
  error: string | null;
  posted_at: string | null;
  last_synced_at: string | null;
};

export type Sale = {
  id: number;
  listing_id: number;
  sold_price: number;
  shipping_collected: number;
  shipping_cost: number;
  sold_at: string;
};

export type Fee = { id: number; sale_id: number; kind: string; label: string; amount: number };

export type ItemWithChannels = Item & {
  listings: Listing[];
  sale: (Sale & { channel: Channel; fees: Fee[]; feeTotal: number; net: number; profit: number }) | null;
  /** Lowest live asking price across channels — what a buyer would actually see. */
  askingPrice: number | null;
};

/* ------------------------------------------------------------------ */

export type ItemFilter = {
  status?: string;
  channel?: string;
  sort?: string;
};

export function getItems(filter: ItemFilter = {}): ItemWithChannels[] {
  const items = all<Item>(`SELECT * FROM items ORDER BY sku`);
  const listings = all<Listing>(`SELECT * FROM listings`);
  const sales = all<Sale>(`SELECT * FROM sales`);
  const fees = all<Fee>(`SELECT * FROM fees`);

  const feesBySale = new Map<number, Fee[]>();
  for (const f of fees) {
    const bucket = feesBySale.get(f.sale_id) ?? [];
    bucket.push(f);
    feesBySale.set(f.sale_id, bucket);
  }

  const listingById = new Map(listings.map((l) => [l.id, l]));
  const saleByItem = new Map<number, Sale & { channel: Channel }>();
  for (const s of sales) {
    const listing = listingById.get(s.listing_id);
    if (listing) saleByItem.set(listing.item_id, { ...s, channel: listing.channel });
  }

  let rows: ItemWithChannels[] = items.map((item) => {
    const own = listings.filter((l) => l.item_id === item.id);
    const raw = saleByItem.get(item.id);

    let sale: ItemWithChannels["sale"] = null;
    if (raw) {
      const saleFees = feesBySale.get(raw.id) ?? [];
      const feeTotal = round(saleFees.reduce((sum, f) => sum + f.amount, 0));
      const net = round(raw.sold_price + raw.shipping_collected - feeTotal - raw.shipping_cost);
      sale = { ...raw, fees: saleFees, feeTotal, net, profit: round(net - item.cost_basis) };
    }

    const live = own.filter((l) => l.status === "live").map((l) => l.price);

    return { ...item, listings: own, sale, askingPrice: live.length ? Math.min(...live) : null };
  });

  if (filter.status && filter.status !== "all") {
    rows = rows.filter((r) => r.status === filter.status);
  }
  if (filter.channel && filter.channel !== "all") {
    rows = rows.filter((r) => r.listings.some((l) => l.channel === filter.channel && l.status !== "draft"));
  }

  // Sorting by age is how you find stale stock, so anything already sold sinks —
  // its shelf time is history, not a problem to act on.
  const daysListed = (r: ItemWithChannels) => {
    if (r.sale) return -1;
    const posted = r.listings.map((l) => l.posted_at).filter(Boolean) as string[];
    if (!posted.length) return -1;
    const earliest = Math.min(...posted.map((p) => Date.parse(`${p}T00:00:00Z`)));
    return Math.floor((Date.now() - earliest) / 86_400_000);
  };

  switch (filter.sort) {
    case "aging":
      rows.sort((a, b) => daysListed(b) - daysListed(a));
      break;
    case "profit":
      rows.sort((a, b) => (b.sale?.profit ?? -Infinity) - (a.sale?.profit ?? -Infinity));
      break;
    case "price":
      rows.sort((a, b) => (b.askingPrice ?? 0) - (a.askingPrice ?? 0));
      break;
    default:
      break; // sku order, as queried
  }

  return rows;
}

export function getItem(id: number): ItemWithChannels | null {
  const found = getItems().find((i) => i.id === id);
  return found ?? null;
}

export function daysListedFor(item: ItemWithChannels): number | null {
  const posted = item.listings.map((l) => l.posted_at).filter(Boolean) as string[];
  if (!posted.length) return null;
  const earliest = Math.min(...posted.map((p) => Date.parse(`${p}T00:00:00Z`)));
  return Math.floor((Date.now() - earliest) / 86_400_000);
}

/* ------------------------------------------------------------------ */

export type Summary = {
  itemsTotal: number;
  byStatus: Record<string, number>;
  inventoryAtCost: number;
  grossRevenue: number;
  feesPaid: number;
  shippingPaid: number;
  netProceeds: number;
  profit: number;
  costOfGoodsSold: number;
  sellThrough: number;
  byChannel: {
    channel: Channel;
    live: number;
    sold: number;
    gross: number;
    fees: number;
    net: number;
    takeRate: number;
  }[];
};

export function getSummary(): Summary {
  const items = getItems();
  const sold = items.filter((i) => i.sale);

  const byStatus: Record<string, number> = {};
  for (const i of items) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;

  const grossRevenue = round(sum(sold.map((i) => i.sale!.sold_price + i.sale!.shipping_collected)));
  const feesPaid = round(sum(sold.map((i) => i.sale!.feeTotal)));
  const shippingPaid = round(sum(sold.map((i) => i.sale!.shipping_cost)));
  const netProceeds = round(grossRevenue - feesPaid - shippingPaid);
  const costOfGoodsSold = round(sum(sold.map((i) => i.cost_basis)));

  const inventoryAtCost = round(
    sum(items.filter((i) => i.status !== "sold" && i.status !== "donated").map((i) => i.cost_basis))
  );

  const listedOrSold = items.filter((i) => i.status === "listed" || i.status === "sold").length;

  const byChannel = CHANNELS.map((channel) => {
    const soldHere = sold.filter((i) => i.sale!.channel === channel);
    const gross = round(sum(soldHere.map((i) => i.sale!.sold_price + i.sale!.shipping_collected)));
    const fees = round(sum(soldHere.map((i) => i.sale!.feeTotal)));
    const net = round(sum(soldHere.map((i) => i.sale!.net)));
    return {
      channel,
      live: items.filter((i) => i.listings.some((l) => l.channel === channel && l.status === "live")).length,
      sold: soldHere.length,
      gross,
      fees,
      net,
      takeRate: gross > 0 ? fees / gross : 0,
    };
  });

  return {
    itemsTotal: items.length,
    byStatus,
    inventoryAtCost,
    grossRevenue,
    feesPaid,
    shippingPaid,
    netProceeds,
    profit: round(netProceeds - costOfGoodsSold),
    costOfGoodsSold,
    sellThrough: listedOrSold > 0 ? sold.length / listedOrSold : 0,
    byChannel,
  };
}

export function isSeeded(): boolean {
  const row = one<{ n: number }>(`SELECT COUNT(*) AS n FROM items`);
  return (row?.n ?? 0) > 0;
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n * 100) / 100;
