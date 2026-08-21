import { supabaseAdmin } from "@/lib/supabase/server";
import { notify } from "@/lib/push";
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
  offer_amount?: number | string | null;
  product_url?: string | null;
  buyer_handle?: string | null;
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
    // null has to be handled explicitly: Number(null) is 0, and a zero here
    // would mark the row kind='offer' and put a phantom $0 offer in the queue
    // for every ordinary message that carries no amount.
    const raw = m.offer_amount;
    const parsed = raw === undefined || raw === null || raw === "" ? null : Number(raw);
    const amount = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;

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
      // Columns migration 0009 added and nothing ever wrote. product_url is
      // the stable key for matching a thread to a garment later; buyer_handle
      // is who you're talking to.
      product_url: m.product_url ?? m.listing_url ?? null,
      buyer_handle: m.buyer_handle ?? m.sender ?? null,
      raw: m.raw ?? null,
    };
  });

  const { error } = await admin
    .from("messages")
    .upsert(rows, { onConflict: "user_id,channel,external_id", ignoreDuplicates: false });

  if (error) return json({ error: error.message }, 500);

  // Notify once per conversation, not once per message. A thread that syncs
  // five new lines should buzz the phone once; re-syncing the same thread
  // tomorrow should not buzz it at all, which is what notified_at guards.
  const notified = await notifyNewMessages(userId);

  return json({
    ok: true,
    imported: rows.length,
    matched: rows.filter((r) => r.item_id).length,
    notified,
  });
}


/**
 * Sends one push per thread with unnotified incoming messages, then marks them.
 *
 * Deliberately after the upsert has already succeeded and outside its error
 * path: a buyer message must be recorded whether or not the phone can be
 * reached. notify() swallows its own failures for the same reason.
 */
async function notifyNewMessages(userId: string): Promise<number> {
  const admin = supabaseAdmin();

  const { data: fresh } = await admin
    .from("messages")
    .select("id, thread_id, sender, buyer_handle, body, offer_amount, item_id, channel")
    .eq("user_id", userId)
    .eq("direction", "incoming")
    .is("notified_at", null)
    .order("received_at", { ascending: false })
    .limit(50);

  if (!fresh?.length) return 0;

  // Newest first, so the first row seen for a thread is the one worth showing.
  const byThread = new Map<string, (typeof fresh)[number]>();
  for (const message of fresh) {
    const key = message.thread_id ?? message.id;
    if (!byThread.has(key)) byThread.set(key, message);
  }

  let sent = 0;
  for (const [key, message] of byThread) {
    const who = message.buyer_handle ?? message.sender ?? "A buyer";
    const title = message.offer_amount
      ? `${who} offered $${message.offer_amount}`
      : `${who} messaged you`;

    sent += await notify(userId, {
      title,
      body: (message.body ?? "").slice(0, 140) || "Open Flock to reply.",
      // /inbox, not /messages — there is no /messages route, so an unmatched
      // message notified the seller and then dropped them on a 404.
      url: message.item_id ? `/items/${message.item_id}` : "/inbox",
      tag: `thread-${key}`,
    });
  }

  await admin
    .from("messages")
    .update({ notified_at: new Date().toISOString() })
    .in("id", fresh.map((m) => m.id));

  return byThread.size;
}
