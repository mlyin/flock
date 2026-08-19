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
      const allowed = [
        // Every channel a listing can come back from. This lagged the channel
        // enum, so a real published URL from a newer marketplace was silently
        // dropped and the listing stayed link-less.
        "depop.com", "www.depop.com",
        "mercari.com", "www.mercari.com",
        "vinted.com", "www.vinted.com",
        "grailed.com", "www.grailed.com",
        "poshmark.com", "www.poshmark.com",
        "ebay.com", "www.ebay.com",
        "facebook.com", "www.facebook.com",
        "stockx.com", "www.stockx.com",
        "therealreal.com", "www.therealreal.com",
        "vestiairecollective.com", "www.vestiairecollective.com",
        "us.vestiairecollective.com",
        "ebay.com", "www.ebay.com",
        "poshmark.com", "www.poshmark.com",
      ];
      if (parsed.protocol === "https:" && allowed.includes(parsed.hostname)) url = parsed.toString();
    } catch {
      // ignore an unparseable url; the status update still matters
    }
  }

  // The plan cap applies here too. This route has no session and renders no
  // page, so it can't be governed by hiding a button — and it is the path the
  // extension uses, which is the one that runs unattended. `standing()` reads
  // the session, so the count is done directly against the admin client and
  // scoped by hand, the same way every other bearer route has to.
  const admin = supabaseAdmin();

  const { data: already } = await admin
    .from("listings")
    .select("status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  // A listing that's already live holds its slot; re-recording a URL for it
  // must not be refused as though the seller were spending a new one.
  if (already && already.status !== "live") {
    const { data: profile } = await admin
      .from("profiles")
      .select("plan, beta")
      .eq("id", userId)
      .maybeSingle();

    const { data: plan } = await admin
      .from("plans")
      .select("label, active_listings")
      .eq("id", profile?.beta ? "mutton" : (profile?.plan ?? "lamb"))
      .maybeSingle();

    if (plan?.active_listings != null) {
      const { count } = await admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "live");

      if ((count ?? 0) >= plan.active_listings) {
        // 409, not 403: nothing is wrong with the request or the token — the
        // account simply has no room, and the extension shows this text.
        return json(
          {
            error: `That's live on the marketplace, but Flock can't track it: ${count} listings are already live, which is the limit on ${plan.label}. End one in Flock, or move up a tier.`,
          },
          409
        );
      }
    }
  }

  const { error } = await admin
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
