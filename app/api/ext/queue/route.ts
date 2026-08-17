import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Everything drafted for an extension-driven channel and not yet posted. */
export async function GET(request: Request) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("id, channel, title, price, status, items!inner (sku, brand, title)")
    .eq("user_id", userId) // no session here, so scope by hand
    .in("channel", ["depop", "vinted", "grailed"])
    .eq("status", "draft")
    .order("id");

  if (error) return json({ error: error.message }, 500);

  return json({
    listings: (data ?? []).map((row) => {
      const item = row.items as unknown as { sku: string; brand: string | null; title: string };
      return {
        id: row.id,
        channel: row.channel,
        sku: item.sku,
        label: `${item.brand ? `${item.brand} ` : ""}${item.title}`,
        title: row.title,
        price: Number(row.price),
      };
    }),
  });
}
