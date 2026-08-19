import { supabaseServer } from "./supabase/server";
import { computeFees, projectedNet, CHANNELS, type Channel } from "./fees";

/**
 * All reads and writes go through the request-scoped Supabase client, so every
 * query runs as the signed-in user and row-level security does the filtering.
 * You will not find a `where user_id = ...` below — that's deliberate. Postgres
 * enforces it, which means forgetting one here returns nothing rather than
 * leaking someone else's inventory.
 *
 * Inserts are the exception: RLS checks `auth.uid() = user_id`, so writes must
 * set user_id explicitly or they're rejected.
 */

export type Item = {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  category: string;
  size: string | null;
  color: string | null;
  swatch: string | null;
  material: string | null;
  /** Manufacturer's style/model code from the inner tag. The catalog join key for StockX. */
  style_code: string | null;
  condition: string;
  flaws: string[];
  cost_basis: number;
  floor_price: number | null;
  list_price: number | null;
  /** Profit wanted over cost_basis. Null when the seller hasn't set one. */
  target_profit: number | null;
  package_size: string | null;
  acquired_at: string | null;
  source: string | null;
  status: string;
  review_state: string;
  notes: string | null;
  created_at: string;
};

export type Listing = {
  id: string;
  item_id: string;
  channel: Channel;
  url: string | null;
  title: string | null;
  description: string | null;
  price: number;
  shipping_price: number;
  status: string;
  posted_at: string | null;
  /** Channel-specific extras: eBay specifics and category, Depop tags, price band. */
  draft: {
    category?: string;
    specifics?: Record<string, string>;
    tags?: string[];
    price?: { low: number; suggested: number; high: number; reasoning: string };
  } | null;
  drafted_by: string | null;
};

export type Photo = {
  id: string;
  item_id: string | null;
  storage_path: string;
  role: string;
  sort_order: number;
  bytes: number | null;
  created_at: string;
};

export type Sale = {
  id: string;
  listing_id: string;
  sold_price: number;
  shipping_collected: number;
  shipping_cost: number;
  sold_at: string;
};

export type Fee = { id: string; sale_id: string; kind: string; label: string; amount: number };

export type ItemFull = Item & {
  listings: Listing[];
  photos: Photo[];
  sale: (Sale & { channel: Channel; fees: Fee[]; feeTotal: number; net: number; profit: number }) | null;
  askingPrice: number | null;
};

/** PostgREST can hand numeric back as a string depending on the driver path. */
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const round = (n: number) => Math.round(n * 100) / 100;
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

function shapeItem(row: Record<string, unknown>): Item {
  return {
    ...(row as unknown as Item),
    cost_basis: num(row.cost_basis),
    floor_price: row.floor_price == null ? null : num(row.floor_price),
    list_price: row.list_price == null ? null : num(row.list_price),
    target_profit: row.target_profit == null ? null : num(row.target_profit),
    flaws: Array.isArray(row.flaws) ? (row.flaws as string[]) : [],
  };
}

export type ItemFilter = { status?: string; channel?: string; sort?: string };

export async function getItems(filter: ItemFilter = {}): Promise<ItemFull[]> {
  const supabase = await supabaseServer();

  // One round trip instead of five. PostgREST resolves the foreign keys.
  const { data, error } = await supabase
    .from("items")
    .select(
      `*,
       photos (*),
       listings (*, sales (*, fees (*)))`
    )
    .order("sku");

  if (error) throw new Error(`Loading inventory failed: ${error.message}`);

  let rows: ItemFull[] = (data ?? []).map((raw) => {
    const item = shapeItem(raw);
    const listings: Listing[] = (raw.listings ?? []).map((l: Record<string, unknown>) => ({
      ...(l as unknown as Listing),
      price: num(l.price),
      shipping_price: num(l.shipping_price),
    }));

    const photos: Photo[] = (raw.photos ?? [])
      .map((p: Record<string, unknown>) => p as unknown as Photo)
      .sort((a: Photo, b: Photo) => a.sort_order - b.sort_order);

    // A garment sells once, on one channel. Find whichever listing carries it.
    let sale: ItemFull["sale"] = null;
    for (const listing of raw.listings ?? []) {
      const rawSale = (listing.sales ?? [])[0];
      if (!rawSale) continue;

      const fees: Fee[] = (rawSale.fees ?? []).map((f: Record<string, unknown>) => ({
        ...(f as unknown as Fee),
        amount: num(f.amount),
      }));
      const feeTotal = round(sum(fees.map((f) => f.amount)));
      const soldPrice = num(rawSale.sold_price);
      const collected = num(rawSale.shipping_collected);
      const shipCost = num(rawSale.shipping_cost);
      const net = round(soldPrice + collected - feeTotal - shipCost);

      sale = {
        ...(rawSale as unknown as Sale),
        sold_price: soldPrice,
        shipping_collected: collected,
        shipping_cost: shipCost,
        channel: listing.channel as Channel,
        fees,
        feeTotal,
        net,
        profit: round(net - item.cost_basis),
      };
      break;
    }

    const live = listings.filter((l) => l.status === "live").map((l) => l.price);
    return { ...item, listings, photos, sale, askingPrice: live.length ? Math.min(...live) : null };
  });

  if (filter.status && filter.status !== "all") {
    rows = rows.filter((r) => r.status === filter.status);
  }
  if (filter.channel && filter.channel !== "all") {
    rows = rows.filter((r) => r.listings.some((l) => l.channel === filter.channel && l.status !== "draft"));
  }

  const daysListed = (r: ItemFull) => {
    if (r.sale) return -1; // sold stock isn't stale stock
    const posted = r.listings.map((l) => l.posted_at).filter(Boolean) as string[];
    if (!posted.length) return -1;
    return Math.floor((Date.now() - Math.min(...posted.map((p) => Date.parse(p)))) / 86_400_000);
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
  }

  return rows;
}

export async function getItem(id: string): Promise<ItemFull | null> {
  return (await getItems()).find((i) => i.id === id) ?? null;
}

export function daysListedFor(item: ItemFull): number | null {
  const posted = item.listings.map((l) => l.posted_at).filter(Boolean) as string[];
  if (!posted.length) return null;
  return Math.floor((Date.now() - Math.min(...posted.map((p) => Date.parse(p)))) / 86_400_000);
}

/** Live for an unsold item, days-to-sell for a sold one. */
export function shelfAge(item: ItemFull): { days: number; kind: "listed" | "to-sell" } | null {
  if (item.sale) {
    const sold = item.listings.find((l) => l.status === "sold");
    if (!sold?.posted_at) return null;
    const days = Math.round((Date.parse(item.sale.sold_at) - Date.parse(sold.posted_at)) / 86_400_000);
    return { days: Math.max(0, days), kind: "to-sell" };
  }
  const listed = daysListedFor(item);
  return listed === null ? null : { days: listed, kind: "listed" };
}

/** Best net across the channels an item is actually live on. */
export function bestProjection(item: ItemFull): { net: number; channel: Channel } | null {
  const live = item.listings.filter((l) => l.status === "live");
  if (!live.length) return null;
  return live
    .map((l) => ({
      channel: l.channel,
      net: projectedNet(l.channel, l.price, {
        shippingCollected: l.shipping_price,
        shippingCost: l.shipping_price,
      }),
    }))
    .reduce((best, cur) => (cur.net > best.net ? cur : best));
}

export type Summary = ReturnType<typeof summarize>;

export function summarize(items: ItemFull[]) {
  const sold = items.filter((i) => i.sale);

  const byStatus: Record<string, number> = {};
  for (const i of items) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;

  const grossRevenue = round(sum(sold.map((i) => i.sale!.sold_price + i.sale!.shipping_collected)));
  const feesPaid = round(sum(sold.map((i) => i.sale!.feeTotal)));
  const shippingPaid = round(sum(sold.map((i) => i.sale!.shipping_cost)));
  const netProceeds = round(grossRevenue - feesPaid - shippingPaid);
  const costOfGoodsSold = round(sum(sold.map((i) => i.cost_basis)));
  const listedOrSold = items.filter((i) => i.status === "listed" || i.status === "sold").length;

  return {
    itemsTotal: items.length,
    byStatus,
    inventoryAtCost: round(
      sum(items.filter((i) => i.status !== "sold" && i.status !== "donated").map((i) => i.cost_basis))
    ),
    grossRevenue,
    feesPaid,
    shippingPaid,
    netProceeds,
    costOfGoodsSold,
    profit: round(netProceeds - costOfGoodsSold),
    sellThrough: listedOrSold > 0 ? sold.length / listedOrSold : 0,
    byChannel: CHANNELS.map((channel) => {
      const here = sold.filter((i) => i.sale!.channel === channel);
      const gross = round(sum(here.map((i) => i.sale!.sold_price + i.sale!.shipping_collected)));
      const fees = round(sum(here.map((i) => i.sale!.feeTotal)));
      return {
        channel,
        live: items.filter((i) => i.listings.some((l) => l.channel === channel && l.status === "live")).length,
        sold: here.length,
        gross,
        fees,
        net: round(sum(here.map((i) => i.sale!.net))),
        takeRate: gross > 0 ? fees / gross : 0,
      };
    }),
  };
}

/* ------------------------------------------------------------------ photos */

/** Photos uploaded but not yet identified — the inbox is a query now, not a folder. */
export async function getUnassignedPhotos(): Promise<Photo[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .is("item_id", null)
    .order("created_at");

  if (error) throw new Error(`Loading the inbox failed: ${error.message}`);
  return (data ?? []) as Photo[];
}

/**
 * The bucket is private, so images are reached through short-lived signed URLs
 * rather than public links. One hour is plenty for a page view.
 */
export async function signPhotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage.from("photos").createSignedUrls(paths, 3600);
  if (error) throw new Error(`Signing photo URLs failed: ${error.message}`);

  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export { computeFees, projectedNet };

export type FillReport = {
  id: string;
  channel: Channel;
  created_at: string;
  filled: string[];
  missing: string[];
  blocked: string[];
  errors: string[];
  controls: { id?: string; label?: string; value?: string; required?: boolean; error?: string }[];
  url: string | null;
};

/**
 * The most recent fill attempt per channel for one garment.
 *
 * Exists so a broken fill can be read rather than described. Before this, the
 * validation text a marketplace showed reached anyone who could act on it only
 * as a photograph of a red message.
 */
export async function fillReportsFor(itemId: string): Promise<FillReport[]> {
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("fill_reports")
    .select("id, channel, created_at, filled, missing, blocked, errors, controls, url, listing_id, listings!inner(item_id)")
    .eq("listings.item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(40);

  const newest = new Map<Channel, FillReport>();
  for (const row of (data ?? []) as unknown as FillReport[]) {
    if (!newest.has(row.channel)) newest.set(row.channel, row);
  }
  return [...newest.values()];
}
