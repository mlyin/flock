import { supabaseAdmin } from "@/lib/supabase/server";
import { CHANNELS, type Channel } from "@/lib/fees";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";
import { matchListingToItem } from "@/lib/reconcile";
import { detectVanished, type LiveListing } from "@/lib/vanished";
import { notify } from "@/lib/push";

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

  // Sale detection rides along on the read we already did. Anything Flock
  // believes is live on this channel, but which the seller's own shop no
  // longer shows, is a QUESTION for them — never a state change. See
  // lib/vanished.ts for why absence is such weak evidence on its own.
  const vanished = await checkVanished(admin, userId, channel, rows, now);

  await admin.from("channel_syncs").upsert({
    user_id: userId,
    channel,
    last_sync_at: now,
    found: rows.length,
    error: null,
  });

  return json({ ok: true, imported: rows.length, ...reconciled, ...vanished });
}

type AdminClient = ReturnType<typeof supabaseAdmin>;

/**
 * Raise the question "did this sell?" against one listing.
 *
 * Shared by the two things that can suggest a sale: a listing that vanished
 * from the shop, and one the scrape saw carrying a SOLD badge. Both are
 * evidence, neither is proof, and neither may write a sale — recordSale is the
 * only thing that does, because it also writes the fees and the delist queue.
 *
 * Returns true only when a NEW question was raised, so the caller can notify
 * without re-notifying every sync.
 */
async function raiseSaleCandidate(
  admin: AdminClient,
  userId: string,
  listing: { id: string; item_id: string },
  channel: Channel,
  misses: number,
  now: string
): Promise<boolean> {
  // `unique (listing_id)` means there is at most one question per listing ever,
  // so what happens to an existing row decides whether detection keeps working.
  const { data: existing } = await admin
    .from("sale_candidates")
    .select("id, state")
    .eq("listing_id", listing.id)
    .maybeSingle();

  if (existing) {
    // Still unanswered — leave it alone. Re-asking a question already on screen
    // is how a useful prompt becomes an ignored one.
    if (existing.state === "open") return false;

    // Answered before, and the evidence has come back. This used to be an
    // `ignoreDuplicates` upsert, which meant a resolved row blocked every
    // future question for that listing — so a seller who once answered "still
    // up" turned sale detection off for that garment permanently, silently,
    // and for the rest of its life. The listing most likely to sell is the one
    // that already looked like it had.
    //
    // 'sold' is the exception: that garment is done, and re-asking about a sale
    // already in the books would invite recording it twice.
    if (existing.state === "sold") return false;

    await admin
      .from("sale_candidates")
      .update({ state: "open", misses, detected_at: now, resolved_at: null })
      .eq("id", existing.id);

    return true;
  }

  const { data } = await admin
    .from("sale_candidates")
    .insert({
      user_id: userId,
      item_id: listing.item_id,
      listing_id: listing.id,
      channel,
      misses,
      detected_at: now,
    })
    .select("id");

  return Boolean(data && data.length > 0);
}


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
  rows: Array<{ external_id: string; url: string | null; status: string; price: number | null }>,
  now: string
) {
  if (rows.length === 0) return { matched: 0, ambiguous: 0, soldSeen: 0 };

  const { data: items } = await admin
    .from("items")
    .select("id, title, brand")
    .eq("user_id", userId);

  if (!items?.length) return { matched: 0, ambiguous: 0, soldSeen: 0 };

  let matched = 0;
  let ambiguous = 0;
  let soldSeen = 0;

  for (const row of rows) {
    const result = matchListingToItem(row.external_id, items);
    if (!result.itemId) {
      if (/items match/.test(result.reason)) ambiguous++;
      continue;
    }

    // Point external_listings at the item, so the "everything live everywhere"
    // view has its link even when there's no Flock listing behind it.
    await admin
      .from("external_listings")
      .update({ item_id: result.itemId })
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("external_id", row.external_id);

    // And backfill the Flock listing's url/status, which is what the channel
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

    // What a buyer is actually being shown. Recorded, never applied: adopting
    // it silently would overwrite a price drop the seller made in Flock ten
    // minutes ago and hasn't had a chance to key into Depop yet. The
    // disagreement becomes a question on the dashboard — see lib/drift.ts.
    //
    // Zero means the price node was empty (Depop does this on sold items),
    // which is a failed read rather than a free garment.
    if (row.price !== null && row.price > 0) {
      patch.market_price = row.price;
      patch.market_price_at = now;
    }
    // Status moves are deliberately one-directional and deliberately narrow.
    //
    // A shop read is a scrape, and the sold badge it keys off is unverified —
    // read-depop-listings.js says so in its own comment. So it may promote a
    // draft to live, and it may end a live listing. It may NOT do either of
    // these, both of which it used to:
    //
    // 1. Resurrect a sold listing. The old condition was `listing.status !==
    //    "live"`, which includes 'sold'. One missed SOLD badge and a garment
    //    with a recorded sale, fees and a delist queue went back to 'live' and
    //    the item back to 'listed' — inviting the seller to sell it twice.
    //
    // 2. Mark a listing sold. That looks helpful and is the worst of the two:
    //    recordSale is the only writer of `sales`, `fees` and `delist_tasks`,
    //    so a listing flipped to 'sold' here has no sale row, no fee
    //    breakdown, no takedown queue for the other channels, and no way to
    //    record the sale afterwards because the button that does it only shows
    //    on a live listing. The money silently never enters the books.
    //
    // A scrape that thinks something sold raises a QUESTION instead —
    // checkVanished below already owns that, and the seller answers it.
    if (row.status === "active" && listing.status === "draft") patch.status = "live";
    if (row.status === "ended" && listing.status === "live") patch.status = "ended";

    await admin.from("listings").update(patch).eq("id", listing.id);

    // A SOLD badge on a live listing is the strongest sale signal we get —
    // stronger than the absence checkVanished works from — so it raises the
    // same question rather than being thrown away. `misses: 0` distinguishes
    // it: this listing did not go missing, it was seen and it said sold.
    if (row.status === "sold" && listing.status === "live") {
      if (await raiseSaleCandidate(admin, userId, { id: listing.id, item_id: result.itemId }, channel, 0, now)) {
        soldSeen += 1;
      }
    }

    if (patch.url || patch.status) {
      matched++;
      if (patch.status === "live") {
        await admin.from("items").update({ status: "listed" }).eq("id", result.itemId);
      }
    }
  }

  return { matched, ambiguous, soldSeen };
}

/**
 * Ask about listings that stopped appearing in the seller's shop.
 *
 * Writes no sale and ends no listing. It raises a candidate the seller answers,
 * because only they know whether a missing listing sold, was deleted, or was
 * never really missing at all.
 */
async function checkVanished(
  admin: AdminClient,
  userId: string,
  channel: Channel,
  rows: Array<{ external_id: string }>,
  now: string
) {
  const { data: liveRows } = await admin
    .from("listings")
    .select("id, item_id, external_id, url, absent_streak")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "live");

  if (!liveRows?.length) return { vanished: 0 };

  const result = detectVanished(
    liveRows as LiveListing[],
    rows.map((r) => r.external_id)
  );

  if (result.skipped) return { vanished: 0, vanishSkipped: result.skipped };

  // Seen again — clear the streak. A listing that reappears was never gone,
  // and leaving a stale streak behind would flag it on the next single miss.
  const seenIds = result.seen.filter((l) => l.absent_streak > 0).map((l) => l.id);
  if (seenIds.length) {
    await admin.from("listings").update({ absent_streak: 0 }).in("id", seenIds);
  }

  // Missing, but not yet often enough to bother anyone about.
  for (const { listing, misses } of result.pending) {
    await admin.from("listings").update({ absent_streak: misses }).eq("id", listing.id);
  }

  let raised = 0;

  for (const { listing, misses } of result.flag) {
    await admin.from("listings").update({ absent_streak: misses }).eq("id", listing.id);
    // One candidate per listing. Re-asking a question the seller already
    // answered is how a useful prompt becomes an ignored one — and counting
    // only genuinely new rows is what stops the notification below firing on
    // every sync.
    if (await raiseSaleCandidate(admin, userId, listing, channel, misses, now)) raised += 1;
  }

  // Worth a phone buzz. This is the one thing in the product that gets worse
  // while you don't know about it: if it sold, the same garment is still for
  // sale on three other channels, and a second buyer paying is a cancellation
  // and a defect. Deliberately not sent for the pending misses — one look at
  // an empty shop should not wake anybody.
  if (raised > 0) {
    await notify(userId, {
      title: raised === 1 ? "Did something sell?" : `${raised} listings vanished`,
      body:
        raised === 1
          ? `A listing is no longer showing in your ${channel} shop. If it sold, the other channels need to come down.`
          : `${raised} listings stopped showing in your ${channel} shop. If they sold, other channels need to come down.`,
      url: "/",
      // One tag per channel, so a later sync replaces this rather than
      // stacking a second identical question on the lock screen.
      tag: `vanished-${channel}`,
    });
  }

  return { vanished: result.flag.length };
}
