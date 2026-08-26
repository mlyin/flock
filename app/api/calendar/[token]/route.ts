import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyFeedToken } from "@/lib/calfeed";
import { buildEvents, toIcs, type DeadlineInput } from "@/lib/calendar";
import type { Channel } from "@/lib/fees";

export const dynamic = "force-dynamic";

/**
 * The subscribable calendar feed.
 *
 * Public by necessity — Calendar.app, Google Calendar and iOS have no login
 * step when subscribing, so the token in the path IS the credential. It is
 * verified here rather than by middleware, and the route is listed as public
 * in middleware.ts for that reason.
 *
 * Every query below scopes by user_id explicitly. supabaseAdmin() bypasses
 * row-level security, so this route owns its own tenant isolation — the same
 * rule as /api/ext/*, and the same failure if it is forgotten.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const userId = await verifyFeedToken(token);

  // 404 rather than 401: a wrong token should not confirm that a right one
  // would have worked, and a calendar client shows an auth prompt on a 401
  // that the seller has no credentials to satisfy.
  if (!userId) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const admin = supabaseAdmin();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sellonflock.com";

  // Sales, for the dispatch deadline. Only recent ones: a sale from March has
  // either shipped or become somebody else's problem, and a calendar that
  // reaches back forever is one nobody scrolls.
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const { data: sales } = await admin
    .from("sales")
    .select("id, sold_at, listings!inner (channel, item_id, user_id, items (title, sku))")
    .eq("user_id", userId)
    .gte("sold_at", since)
    .order("sold_at", { ascending: false })
    .limit(200);

  const { data: offers } = await admin
    .from("messages")
    .select("id, expires_at, channel, offer_amount, items (title)")
    .eq("user_id", userId)
    .eq("kind", "offer")
    .eq("offer_status", "open")
    .not("expires_at", "is", null)
    .limit(200);

  const { data: consigned } = await admin
    .from("items")
    .select("id, sku, title, consigned_at, consigned_to")
    .eq("user_id", userId)
    .eq("custody", "consigned")
    .not("consigned_at", "is", null)
    .limit(200);

  const rows = (sales ?? []) as unknown as Array<Record<string, unknown>>;

  const input: DeadlineInput = {
    sales: rows.flatMap((row) => {
      const listing = (Array.isArray(row.listings) ? row.listings[0] : row.listings) as
        | Record<string, unknown>
        | undefined;
      if (!listing) return [];
      const item = (Array.isArray(listing.items) ? listing.items[0] : listing.items) as
        | Record<string, unknown>
        | undefined;

      return [
        {
          id: row.id as string,
          soldAt: row.sold_at as string,
          channel: listing.channel as Channel,
          itemId: listing.item_id as string,
          title: (item?.title as string) ?? "A garment",
          sku: (item?.sku as string) ?? "—",
        },
      ];
    }),

    offers: ((offers ?? []) as unknown as Array<Record<string, unknown>>).flatMap((row) => {
      const amount = Number(row.offer_amount);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      const item = (Array.isArray(row.items) ? row.items[0] : row.items) as
        | Record<string, unknown>
        | undefined;

      return [
        {
          id: row.id as string,
          expiresAt: row.expires_at as string,
          channel: row.channel as Channel,
          amount,
          itemTitle: (item?.title as string) ?? null,
        },
      ];
    }),

    consignments: ((consigned ?? []) as unknown as Array<Record<string, unknown>>).flatMap(
      (row) => {
        if (!row.consigned_to) return [];
        return [
          {
            itemId: row.id as string,
            consignedAt: row.consigned_at as string,
            channel: row.consigned_to as Channel,
            title: (row.title as string) ?? "A garment",
            sku: (row.sku as string) ?? "—",
          },
        ];
      }
    ),
  };

  const ics = toIcs(buildEvents(input, origin), {
    name: "Flock",
    description: "Dispatch deadlines, offer expiry and consignment windows.",
    generatedAt: new Date(),
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="flock.ics"',
      // Never cached by anything in between. A calendar client polling an
      // hour-old CDN copy is the whole failure mode this feature has.
      "cache-control": "no-store, max-age=0",
      // The URL is a credential; keep it out of Referer on any link a client
      // renders from the feed.
      "referrer-policy": "no-referrer",
    },
  });
}
