import { projectedNet, type Channel } from "./fees";
import { supabaseServer } from "./supabase/server";

/**
 * Offers and messages, every channel, in one shape.
 *
 * An offer is a `messages` row with kind='offer' (see 0009_offers.sql for why
 * they aren't a separate table). The columns added by that migration are all
 * optional here, so this file works against a database that hasn't been
 * migrated yet — the query selects `*` and missing columns simply arrive
 * undefined rather than throwing.
 */

export type OfferStatus = "open" | "accepted" | "declined" | "countered" | "expired" | "withdrawn";

export type MessageRow = {
  id: string;
  channel: Channel;
  sender: string | null;
  body: string | null;
  kind: string;
  direction: string;
  offer_amount: number | string | null;
  received_at: string;
  read_at: string | null;
  item_id: string | null;
  thread_id: string | null;

  // Added by 0009. Optional so this compiles and runs pre-migration.
  offer_status?: OfferStatus | null;
  counter_amount?: number | string | null;
  responded_at?: string | null;
  expires_at?: string | null;
  offer_url?: string | null;
  product_url?: string | null;
  buyer_handle?: string | null;

  items?: ItemStub | null;
};

export type ItemStub = {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  floor_price: number | string | null;
  list_price: number | string | null;
  cost_basis: number | string | null;
};

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : typeof v === "number" ? v : Number(v);

/** An offer with the maths already done, so the UI never computes money. */
export type ScoredOffer = {
  row: MessageRow;
  channel: Channel;
  amount: number;
  /** What lands after that channel's fees. */
  net: number;
  floor: number | null;
  cost: number | null;
  /** net − cost, when we know what was paid. */
  profit: number | null;
  aboveFloor: boolean | null;
  status: OfferStatus;
  expiresAt: Date | null;
  /** Hours until it lapses; null when the platform didn't tell us. */
  hoursLeft: number | null;
  item: ItemStub | null;
};

export function scoreOffer(row: MessageRow): ScoredOffer | null {
  const amount = num(row.offer_amount);
  if (amount === null) return null;

  const item = row.items ?? null;
  const floor = num(item?.floor_price ?? null);
  const cost = num(item?.cost_basis ?? null);
  const net = projectedNet(row.channel, amount);
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

  return {
    row,
    channel: row.channel,
    amount,
    net,
    floor,
    cost,
    profit: cost === null ? null : net - cost,
    // Compare like with like. This used to be `amount >= floor` — gross offer
    // against a floor — while the very same card displayed the NET. A $60
    // offer against a $60 floor "cleared it" while netting $57.57 on Depop
    // and $48 on Poshmark. The floor is what the seller wants to RECEIVE, so
    // it has to go through the same channel's fees before anything is
    // compared to it.
    aboveFloor: floor === null ? null : net >= projectedNet(row.channel, floor),
    status: (row.offer_status as OfferStatus) ?? "open",
    expiresAt,
    hoursLeft: expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 3_600_000) : null,
    item,
  };
}

const SELECT = "*, items (id, sku, title, brand, floor_price, list_price, cost_basis)";

/** Every message, newest first. */
export async function getMessages(limit = 500): Promise<MessageRow[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("messages")
    .select(SELECT)
    .order("received_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as MessageRow[];
}

/** Every message for one garment, oldest first — it's a conversation. */
export async function getMessagesForItem(itemId: string): Promise<MessageRow[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("messages")
    .select(SELECT)
    .eq("item_id", itemId)
    .order("received_at", { ascending: true });
  return (data ?? []) as unknown as MessageRow[];
}

/**
 * Open offers across every channel, soonest to lapse first, then biggest.
 * Rows whose status the migration hasn't created yet count as open.
 */
export async function getOpenOffers(): Promise<ScoredOffer[]> {
  const rows = await getMessages(500);

  return rows
    .filter((r) => r.kind === "offer")
    .map(scoreOffer)
    .filter((o): o is ScoredOffer => o !== null)
    .filter((o) => o.status === "open")
    .sort((a, b) => {
      if (a.hoursLeft !== null && b.hoursLeft !== null && a.hoursLeft !== b.hoursLeft) {
        return a.hoursLeft - b.hoursLeft;
      }
      if (a.hoursLeft !== null && b.hoursLeft === null) return -1;
      if (a.hoursLeft === null && b.hoursLeft !== null) return 1;
      return b.amount - a.amount;
    });
}

/** Offers already answered, for the history strip. */
export async function getAnsweredOffers(): Promise<ScoredOffer[]> {
  const rows = await getMessages(500);
  return rows
    .filter((r) => r.kind === "offer")
    .map(scoreOffer)
    .filter((o): o is ScoredOffer => o !== null)
    .filter((o) => o.status !== "open");
}

/**
 * Group anything message-shaped by the garment it concerns. Unmatched rows —
 * ones we couldn't tie to an item — collect under a single null key rather than
 * being silently dropped.
 */
export function groupByItem<T extends { item_id: string | null; items?: ItemStub | null }>(
  rows: T[]
): { key: string; item: ItemStub | null; rows: T[] }[] {
  const groups = new Map<string, { key: string; item: ItemStub | null; rows: T[] }>();
  for (const row of rows) {
    const key = row.item_id ?? "unmatched";
    if (!groups.has(key)) groups.set(key, { key, item: row.items ?? null, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  // Matched garments first; unmatched at the bottom where they belong.
  return [...groups.values()].sort((a, b) =>
    a.key === "unmatched" ? 1 : b.key === "unmatched" ? -1 : 0
  );
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  open: "open",
  accepted: "accepted",
  declined: "declined",
  countered: "countered",
  expired: "expired",
  withdrawn: "withdrawn",
};
