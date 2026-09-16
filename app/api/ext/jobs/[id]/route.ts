import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyTokenDetailed } from "@/lib/exttoken";
import { classifyOutcome, type FillResult } from "@/lib/nodes";
import type { Channel } from "@/lib/fees";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 200)).slice(0, 60) : [];

/**
 * The node reports what happened to one job. The SERVER decides what that
 * means: the node sends the filler's raw result and the status comes from
 * lib/nodes.ts, so there is one classifier and it lives where the tests are.
 *
 * A job the posted route already closed as `published` stays published — the
 * marketplace's word beats the node's, in either direction.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await verifyTokenDetailed(request.headers.get("authorization"));
  if (!who) return unauthorized();

  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    filled?: unknown;
    missing?: unknown;
    blocked?: unknown;
    /** The listing URL the node saw the tab land on, if any. */
    publishedUrl?: string;
    /** Why the node's own posted call failed, when it did (plan cap, network). */
    postedError?: string;
    reportId?: string;
  } | null;
  if (!body || typeof body.ok !== "boolean") return json({ error: "ok (boolean) is required." }, 400);

  const admin = supabaseAdmin();

  // Scope by hand. A bearer token names a user, not a row.
  const { data: job } = await admin
    .from("fill_jobs")
    .select("id, status, listing_id, channel, auto_submit, node_id")
    .eq("id", id)
    .eq("user_id", who.userId)
    .maybeSingle();
  if (!job) return json({ error: "Not found." }, 404);

  if (job.status === "published") return json({ ok: true, status: "published" });
  if (job.status !== "running" && job.status !== "filled") {
    return json({ error: `That job is ${job.status}, not running.` }, 409);
  }

  // Only a URL the posted route would accept counts as the marketplace's
  // word. The posted route has already recorded it by the time the node
  // reports, so this is a consistency check rather than a second write.
  let publishedUrl: string | null = null;
  if (typeof body.publishedUrl === "string") {
    const { data: listing } = await admin
      .from("listings")
      .select("status, url")
      .eq("id", job.listing_id)
      .eq("user_id", who.userId)
      .maybeSingle();
    if (listing?.status === "live" && listing.url) publishedUrl = listing.url;
  }

  const result: FillResult = {
    channel: job.channel as Channel,
    ok: body.ok,
    error: typeof body.error === "string" ? body.error.slice(0, 500) : null,
    filled: strings(body.filled),
    missing: strings(body.missing),
    blocked: strings(body.blocked),
    autoSubmit: Boolean(job.auto_submit),
    publishedUrl,
  };
  let status = classifyOutcome(result);

  // The node saw the marketplace navigate to a listing, but the posted call
  // did not take — the plan cap said no, or Flock was unreachable for a
  // moment. The listing IS live and Flock does not have it, which is the one
  // state the seller must hear about now: "waiting for the marketplace"
  // would be a lie, and so would "published". Hand it to them with the URL.
  const seenUrl = typeof body.publishedUrl === "string" ? body.publishedUrl.slice(0, 500) : null;
  if (seenUrl && !publishedUrl) {
    status = "needs_seller";
    result.error =
      `The marketplace shows this listing at ${seenUrl}, but Flock couldn't record it` +
      (typeof body.postedError === "string" ? `: ${body.postedError.slice(0, 200)}` : "") +
      `. Mark it live by hand on the garment's page.`;
  }

  // The report must be this seller's, for this listing, or it is not evidence.
  let reportId: string | null = null;
  if (typeof body.reportId === "string") {
    const { data: report } = await admin
      .from("fill_reports")
      .select("id")
      .eq("id", body.reportId)
      .eq("user_id", who.userId)
      .eq("listing_id", job.listing_id)
      .maybeSingle();
    reportId = report?.id ?? null;
  }

  const { error } = await admin
    .from("fill_jobs")
    .update({
      status,
      outcome: {
        ok: result.ok,
        filled: result.filled,
        missing: result.missing,
        blocked: result.blocked,
        error: result.error,
        // Both: what Flock verified, and what the node saw.
        publishedUrl,
        seenUrl,
      },
      report_id: reportId,
      error: result.error,
      // When the node last reported. For `filled` this is the clock the
      // "still waiting for the marketplace" warning runs on; the posted route
      // overwrites it when the marketplace answers.
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", who.userId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, status });
}
