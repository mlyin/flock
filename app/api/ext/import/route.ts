import { supabaseAdmin } from "@/lib/supabase/server";
import { CHANNELS, type Channel } from "@/lib/fees";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";
import { matchListingToItem } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type Scraped = {
  external_id?: string;
  url?: string;
  title?: string;
  price?: number | string;
  photo_url?: string;
  status?: string;
  raw?: unknown;
};

/** Platforms word this differently; the dashboard shouldn't have to care. */
function normaliseStatus(status: string | undefined) {
  const s = (status ?? "active").toLowerCase();
  if (/sold/.test(s)) return "sold";
  if (/ended|expired|deleted|removed|inactive/.test(s)) return "ended";
  return "active";
}

/**
 * The extension reports what it read off the seller's own listing pages.
 *
 * Upsert on (user_id, channel, external_id) so re-syncing updates prices and
 * statuses instead of stacking duplicates. Nothing here matches listings to
 * items — that's a separate, reversible step, because a wrong auto-match is
 * worse than an unmatched row.
 */
export async function POST(request: Request) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    channel?: string;
    listings?: Scraped[];
  } | null;

  const channel = body?.channel as Channel | undefined;
  if (!channel || !CHANNELS.includes(channel)) {
    return json({ error: `Unknown channel: ${body?.channel}` }, 400);
  }

  const scraped = Array.isArray(body?.listings) ? body!.listings! : [];
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const rows = scraped
    .filter((l) => l.external_id)
    .map((l) => ({
      user_id: userId, // bearer callers have no session; scope explicitly
      channel,
      external_id: String(l.external_id),
      url: l.url ?? null,
      title: l.title ?? null,
      price: l.price === undefined || l.price === "" ? null : Number(l.price),
      photo_url: l.photo_url ?? null,
      status: normaliseStatus(l.status),
      raw: l.raw ?? null,
      last_seen_at: now,
    }));

  if (rows.length > 0) {
    const { error } = await admin
      .from("external_listings")
      .upsert(rows, { onConflict: "user_id,channel,external_id" });

    if (error) {
      await admin.from("channel_syncs").upsert({
        user_id: userId,
        channel,
        last_sync_at: now,
        found: 0,
        error: error.message,
      });
      return json({ error: error.message }, 500);
    }
  }

  // Fill in where a listing actually went live.
  //
  // The extension fills a form and stops; the seller publishes on the
  // marketplace. Nothing came back with the resulting URL, so listings sat with
  // a null url and the channel chip stayed unclickable. Now that we can read the
  // seller's own shop, close that gap — but only where the match is certain.
  const reconciled = await reconcile(admin, userId, channel, rows, now);

  await admin.from("channel_syncs").upsert({
    user_id: userId,
    channel,
    last_sync_at: now,
    found: rows.length,
    error: null,
  });

  return json({ ok: true, imported: rows.length, ...reconciled });
}

type AdminClient = ReturnType<typeof supabaseAdmin>;

/**
 * Attach scraped listings to the items they belong to.
 *
 * Deliberately conservative (see lib/reconcile.ts): a slug has to contain an
 * item's whole title, only one item may match, and anything ambiguous is left
 * alone. A wrong match corrupts net proceeds and files buyer messages against
 * the wrong garment — an unmatched listing is merely visible.
 */
async function reconcile(
  admin: AdminClient,
  userId: string,
  channel: Channel,
  rows: Array<{ external_id: string; url: string | null; status: string }>,
  now: string
) {
  if (rows.length === 0) return { matched: 0, ambiguous: 0 };

  const { data: items } = await admin
    .from("items")
    .select("id, title, brand")
    .eq("user_id", userId);

  if (!items?.length) return { matched: 0, ambiguous: 0 };

  let matched = 0;
  let ambiguous = 0;

  for (const row of rows) {
    const result = matchListingToItem(row.external_id, items);
    if (!result.itemId) {
      if (/items match/.test(result.reason)) ambiguous++;
      continue;
    }

    // Point external_listings at the item, so the "everything live everywhere"
    // view has its link even when there's no Threader listing behind it.
    await admin
      .from("external_listings")
      .update({ item_id: result.itemId })
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("external_id", row.external_id);

    // And backfill the Threader listing's url/status, which is what the channel
    // chip reads. Only ever fills a blank url — never overwrites one the seller
    // entered by hand.
    const { data: listing } = await admin
      .from("listings")
      .select("id, url, status")
      .eq("user_id", userId)
      .eq("item_id", result.itemId)
      .eq("channel", channel)
      .maybeSingle();

    if (!listing) continue;

    const patch: Record<string, unknown> = { last_synced_at: now };
    if (!listing.url && row.url) patch.url = row.url;
    if (row.status === "active" && listing.status !== "live") patch.status = "live";
    if (row.status === "sold") patch.status = "sold";
    if (row.status === "ended" && listing.status === "live") patch.status = "ended";

    await admin.from("listings").update(patch).eq("id", listing.id);

    if (patch.url || patch.status) {
      matched++;
      if (patch.status === "live") {
        await admin.from("items").update({ status: "listed" }).eq("id", result.itemId);
      }
    }
  }

  return { matched, ambiguous };
}
