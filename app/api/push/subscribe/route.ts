import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Records a browser's push endpoint against the signed-in user. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Signed out." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "Incomplete subscription." }, { status: 400 });
  }

  // Endpoint is unique: re-subscribing on the same browser updates the row
  // rather than accumulating duplicates that each buzz the same phone.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: request.headers.get("user-agent"),
      failed_at: null,
      fail_reason: null,
    },
    { onConflict: "endpoint" }
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Turning notifications off should actually stop them, not just mute the UI. */
export async function DELETE(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Signed out." }, { status: 401 });

  const { endpoint } = ((await request.json().catch(() => ({}))) ?? {}) as { endpoint?: string };
  if (!endpoint) return Response.json({ error: "No endpoint." }, { status: 400 });

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
