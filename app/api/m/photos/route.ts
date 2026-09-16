import { registerPhoto } from "@/app/actions";
import { mjson, readJson, withMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/**
 * Record a photo the app has already uploaded to Storage.
 *
 * The app uploads straight to the `photos` bucket at
 * `{user_id}/inbox/{uuid}.jpg` with its own Supabase session (the bucket
 * policy checks the first path segment), then tells Flock here — the same
 * two steps the web's Uploader takes. `registerPhoto` refuses a path outside
 * the caller's own prefix, so a client cannot register a row pointing at
 * someone else's object.
 */
export async function POST(request: Request) {
  return withMobileSession(request, async () => {
    const body = await readJson<{ storagePath?: unknown; bytes?: unknown }>(request);
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
    const bytes = typeof body?.bytes === "number" && Number.isFinite(body.bytes) ? Math.max(0, Math.round(body.bytes)) : 0;
    if (!storagePath) return mjson({ ok: false, error: "storagePath is required." }, 400);

    const outcome = await registerPhoto(storagePath, bytes);
    return mjson(outcome, outcome.ok ? 200 : 400);
  });
}
