import { mjson, withMobileSession } from "@/lib/mobile-auth";
import { standing } from "@/lib/plan";
import { getNode } from "@/app/node-actions";

export const dynamic = "force-dynamic";

/**
 * Who am I, what am I on, and do I have a browser.
 *
 * The first call a native app makes after sign-in, and the one it polls for
 * the account screen. Everything else about the seller — items, listings,
 * photos, jobs — the app reads straight from Supabase under RLS; this is the
 * part that needs server-side knowledge (the plan table, the node's
 * liveness, the provisioner's presence).
 */
export async function GET(request: Request) {
  return withMobileSession(request, async (user) => {
    const where = await standing();
    const node = await getNode();
    return mjson({
      user: { id: user.id, email: user.email },
      plan: where
        ? {
            id: where.plan.id,
            label: where.plan.label,
            monthly: where.plan.monthly,
            activeListings: where.plan.activeListings,
            active: where.active,
            remaining: where.remaining,
            atCap: where.atCap,
            beta: where.beta,
          }
        : null,
      node: node
        ? {
            status: node.status,
            url: node.url,
            autoSubmit: node.autoSubmit,
            tokenRevoked: node.tokenRevoked,
            liveness: node.liveness,
          }
        : null,
    });
  });
}
