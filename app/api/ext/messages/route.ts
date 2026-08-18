import { supabaseAdmin } from "@/lib/supabase/server";
import { CHANNELS, type Channel } from "@/lib/fees";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type Scraped = {
  external_id?: string;
  thread_id?: string;
  sender?: string;
  body?: string;
  kind?: string;
  offer_amount?: number | string;
  received_at?: string;
  listing_url?: string;
  raw?: unknown;
};

/**
 * Messages the extension read off the seller's own marketplace inbox.
 *
 * Where a listing URL comes through, the message is attached to the matching
 * item automatically — that link is exact, not a guess, so it's safe. Anything
 * without one stays unattached rather than being matched on a title, because a
 * message shown against the wrong garment is worse than one shown against none.
 */
export async function POST(request: Request) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    channel?: string;
    messages?: Scraped[];
  } | null;

  const channel = body?.channel as Channel | undefined;
  if (!channel || !CHANNELS.includes(channel)) {
    return json({ error: `Unknown channel: ${body?.channel}` }, 400);
  }

  const scraped = (Array.isArray(body?.messages) ? body!.messages! : []).filter(
    (m) => m.external_id
  );
  if (scraped.length === 0) return json({ ok: true, imported: 0 });

  const admin = supabaseAdmin();

  // Resolve listing URLs to items in one query rather than one per message.
  const urls = [...new Set(scraped.map((m) => m.listing_url).filter(Boolean) as string[])];
  const byUrl = new Map<string, { id: string; item_id: string }>();

  if (urls.length > 0) {
    const { data } = await admin
      .from("listings")
      .select("id, item_id, url")
      .eq("user_id", userId)
      .in("url", urls);

    for (const row of data ?? []) {
      if (row.url) byUrl.set(row.url, { id: row.id, item_id: row.item_id });
    }
  }

  const rows = scraped.map((m) => {
    const match = m.listing_url ? byUrl.get(m.listing_url) : undefined;
    const amount = m.offer_amount === undefined || m.offer_amount === "" ? null : Number(m.offer_amount);

    return {
      user_id: userId, // bearer callers have no session; scope explicitly
      channel,
      external_id: String(m.external_id),
      thread_id: m.thread_id ?? null,
      sender: m.sender ?? null,
      body: m.body ?? null,
      kind: amount !== null ? "offer" : (m.kind ?? "message"),
      offer_amount: amount,
      received_at: m.received_at ?? new Date().toISOString(),
      item_id: match?.item_id ?? null,
      listing_id: match?.id ?? null,
      raw: m.raw ?? null,
    };
  });

  const { error } = await admin
    .from("messages")
    .upsert(rows, { onConflict: "user_id,channel,external_id", ignoreDuplicates: false });

  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    imported: rows.length,
    matched: rows.filter((r) => r.item_id).length,
  });
}
