import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyToken } from "@/lib/exttoken";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type Control = {
  id?: string;
  label?: string;
  kind?: string;
  value?: string;
  required?: boolean;
  error?: string;
};

/**
 * Record what a marketplace form looked like after the extension filled it.
 *
 * The point is to end the screenshot loop. Until now the only way a fill
 * failure reached anyone who could fix it was a seller photographing a red
 * error message, and every one of those round trips cost a day. The form
 * already knows what it wants; this is where it says so.
 *
 * Bearer-authenticated like the rest of /api/ext/*, so there's no session for
 * RLS to match — the listing is scoped to the caller by hand before anything
 * is written against it.
 */
export async function POST(request: Request) {
  const userId = await verifyToken(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  let body: {
    listingId?: string;
    filled?: string[];
    missing?: string[];
    blocked?: string[];
    controls?: Control[];
    errors?: string[];
    url?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad JSON." }, 400);
  }

  if (!body.listingId) return json({ error: "listingId is required." }, 400);

  const admin = supabaseAdmin();

  // Scope by hand. A bearer token names a user, not a row.
  const { data: listing } = await admin
    .from("listings")
    .select("id, channel")
    .eq("id", body.listingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!listing) return json({ error: "Not found." }, 404);

  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 60) : [];

  const { error } = await admin.from("fill_reports").insert({
    user_id: userId,
    listing_id: listing.id,
    channel: listing.channel,
    filled: strings(body.filled),
    missing: strings(body.missing),
    blocked: strings(body.blocked),
    // Capped: a form with 400 controls is a bug, not a listing, and this
    // shouldn't become a way to write unbounded JSON into the database.
    controls: Array.isArray(body.controls) ? body.controls.slice(0, 120) : [],
    errors: strings(body.errors),
    url: typeof body.url === "string" ? body.url.slice(0, 500) : null,
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
