import { supabaseAdmin } from "@/lib/supabase/server";
import { CORS, json, unauthorized, verifyTokenDetailed } from "@/lib/exttoken";
import { AUTO_SUBMIT_CHANNELS, HUMAN_PUBLISH_CHANNELS } from "@/lib/nodes";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * One fill per poll. One tab at a time looks like a person, and a single fill
 * (90s ceiling, plus a 45s wait for the marketplace) stays inside Chrome's
 * five-minute per-event cap for the extension's service worker. The node
 * polls every minute, so throughput is a listing a minute, which is plenty.
 */
const PER_POLL = 1;

/**
 * The node's poll: claim queued fills for this seller.
 *
 * Only a token that belongs to a node row gets anything back. A laptop
 * install carries a token with no node behind it, so the same extension code
 * polling this route from a laptop receives an empty list and nothing about
 * laptops changes. That is the whole reason nodes are keyed on the token
 * rather than on a preference the seller could flip on the wrong machine.
 *
 * Bearer-authenticated, so there is no session for RLS to use: the node row
 * and the claim are both scoped by user_id by hand, like every /api/ext route.
 */
export async function GET(request: Request) {
  const who = await verifyTokenDetailed(request.headers.get("authorization"));
  if (!who) return unauthorized();

  const admin = supabaseAdmin();

  const { data: node } = await admin
    .from("nodes")
    .select("id, status, auto_submit")
    .eq("user_id", who.userId)
    .eq("token_id", who.tokenId)
    .maybeSingle();

  // Not a node, or paused: nothing to do, and no error — silence here is the
  // designed answer for a laptop, and the pause switch for a node.
  if (!node || node.status !== "ready") return json({ jobs: [] });

  // The node's setting, minus the channels it never applies to. Decided
  // here, not on the node, so no storage flag on a container can reach past
  // lib/nodes.ts — and written by the claim itself, in the same statement,
  // so the evidence of what the node was told cannot disagree with what it
  // was told.
  const { data, error } = await admin.rpc("claim_fill_jobs", {
    p_user: who.userId,
    p_node: node.id,
    p_limit: PER_POLL,
    p_auto_submit: Boolean(node.auto_submit),
    p_auto_channels: AUTO_SUBMIT_CHANNELS.filter((c) => !HUMAN_PUBLISH_CHANNELS.includes(c)),
  });
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as {
    id: string;
    listing_id: string;
    channel: string;
    attempts: number;
    auto_submit: boolean | null;
  }[];

  return json({
    jobs: rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      channel: row.channel,
      attempt: row.attempts,
      autoSubmit: Boolean(row.auto_submit),
    })),
  });
}
