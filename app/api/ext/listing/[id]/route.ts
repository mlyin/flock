import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** The full payload the extension needs to fill one marketplace form. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: listing, error } = await admin
    .from("listings")
    .select("id, channel, title, description, price, shipping_price, draft, item_id")
    .eq("id", id)
    .eq("user_id", userId) // bearer callers have no session; scope explicitly
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!listing) return json({ error: "Not found." }, 404);

  const { data: item } = await admin
    .from("items")
    .select("sku, brand, category, size, color, material, condition, flaws, package_size, depop_category, department")
    .eq("id", listing.item_id)
    .single();

  const { data: photos } = await admin
    .from("photos")
    .select("storage_path")
    .eq("item_id", listing.item_id)
    .order("sort_order");

  // Ship-from address, so the extension can complete the marketplace's
  // account-level shipping form instead of stopping there.
  const { data: address } = await admin
    .from("addresses")
    .select("name, line1, line2, city, state, postcode, country, phone")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  // Signed because the bucket is private. Long enough to fill a form, not to leak.
  const paths = (photos ?? []).map((p) => p.storage_path);
  const signed = paths.length
    ? (await admin.storage.from("photos").createSignedUrls(paths, 1800)).data ?? []
    : [];

  const draft = (listing.draft ?? {}) as { tags?: string[]; specifics?: Record<string, string> };

  return json({
    id: listing.id,
    channel: listing.channel,
    title: listing.title,
    description: listing.description,
    price: Number(listing.price),
    shipping_price: Number(listing.shipping_price),
    tags: draft.tags ?? [],
    specifics: draft.specifics ?? {},
    item: item ?? null,
    address: address ?? null,
    photos: signed.map((s) => s.signedUrl).filter(Boolean),
  });
}
