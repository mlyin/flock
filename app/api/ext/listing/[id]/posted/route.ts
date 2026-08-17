import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * The extension reports back after the user has submitted the form themselves.
 * We only ever record what happened — nothing here posts anything.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { url?: string; external_id?: string };

  // Only accept a marketplace URL, so a compromised extension can't turn this
  // into a way to write arbitrary links into someone's inventory.
  let url: string | null = null;
  if (body.url) {
    try {
      const parsed = new URL(body.url);
      const allowed = ["depop.com", "www.depop.com", "mercari.com", "www.mercari.com"];
      if (parsed.protocol === "https:" && allowed.includes(parsed.hostname)) url = parsed.toString();
    } catch {
      // ignore an unparseable url; the status update still matters
    }
  }

  const { error } = await supabaseAdmin()
    .from("listings")
    .update({
      status: "live",
      url,
      external_id: body.external_id ?? null,
      posted_at: new Date().toISOString(),
      posted_via: "extension",
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return json({ error: error.message }, 500);

  // Anything with a live listing is no longer a draft garment.
  const { data: listing } = await supabaseAdmin()
    .from("listings")
    .select("item_id")
    .eq("id", id)
    .single();

  if (listing) {
    await supabaseAdmin().from("items").update({ status: "listed" }).eq("id", listing.item_id);
  }

  return json({ ok: true });
}
