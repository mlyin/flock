import { openFillJobs, queueFills, queueFillsForItems } from "@/app/node-actions";
import { idList, mjson, readJson, withMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/**
 * The seller's browser node, from the phone.
 *
 * GET: what the node is doing and what it is waiting on — the dashboard's
 * pending panel as JSON, with the same status words (lib/nodes.ts) and the
 * same rule: nothing here is "published" until the marketplace showed a
 * listing. A `needs_seller` row is a form a person still has to finish,
 * in the node's own screen (`node.url` from /api/m/me).
 *
 * POST: hand fills to the node, by listing or by garment. Same function the
 * inventory page's "Fill in my browser" calls, same plan cap, same refusal
 * of a listing that already has an open job. Facebook and Mercari always
 * come back `needs_seller`; Depop, Vinted and Grailed publish only if the
 * node's auto-submit is on. FILLING IS NOT PUBLISHING, and the app must not
 * show it as such.
 */
export async function GET(request: Request) {
  return withMobileSession(request, async () => {
    const jobs = await openFillJobs();
    return mjson({ jobs });
  });
}

export async function POST(request: Request) {
  return withMobileSession(request, async () => {
    const body = await readJson<{ listingIds?: unknown; itemIds?: unknown }>(request);
    const listingIds = body?.listingIds === undefined ? null : idList(body.listingIds);
    const itemIds = body?.itemIds === undefined ? null : idList(body.itemIds);

    if (listingIds?.length) {
      const outcome = await queueFills(listingIds);
      return mjson(outcome, outcome.ok ? 200 : 422);
    }
    if (itemIds?.length) {
      const outcome = await queueFillsForItems(itemIds);
      return mjson(outcome, outcome.ok ? 200 : 422);
    }
    return mjson({ ok: false, queued: 0, skipped: 0, error: "Send listingIds or itemIds: a list of ids." }, 400);
  });
}
