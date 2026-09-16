import { createBasicListings, prepareListings } from "@/app/actions";
import { mjson, readJson, withMobileSession } from "@/lib/mobile-auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Draft listing copy for one garment on every channel, then return the
 * drafts.
 *
 * `mode: "basic"` (default) assembles copy from the garment's own fields —
 * free, instant, no API key. `mode: "ai"` is the web's "Rewrite with AI":
 * model-written copy per channel, with the seller's standing text applied.
 * Both go through writeDrafts, which never touches a listing that is
 * already live.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withMobileSession(request, async () => {
    const { id } = await params;
    if (!UUID.test(id)) return mjson({ ok: false, error: "Not a garment id." }, 400);

    const body = await readJson<{ mode?: unknown }>(request);
    const mode = body?.mode === "ai" ? "ai" : "basic";

    const outcome = mode === "ai" ? await prepareListings(id) : await createBasicListings(id);
    if (!outcome.ok) return mjson(outcome, 422);

    // RLS scopes this to the caller: a garment id that is not theirs comes
    // back empty from the draft step's own select and fails above.
    const { data } = await (await supabaseServer())
      .from("listings")
      .select("id, channel, status, title, description, price, shipping_price, url, drafted_by, drafted_at")
      .eq("item_id", id)
      .order("channel");

    return mjson({ ok: true, mode, listings: data ?? [] });
  });
}
