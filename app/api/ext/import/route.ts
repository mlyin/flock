import { supabaseAdmin } from "@/lib/supabase/server";
import { CHANNELS, type Channel } from "@/lib/fees";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

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

  await admin.from("channel_syncs").upsert({
    user_id: userId,
    channel,
    last_sync_at: now,
    found: rows.length,
    error: null,
  });

  return json({ ok: true, imported: rows.length });
}
