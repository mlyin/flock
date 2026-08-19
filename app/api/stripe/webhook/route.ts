import { supabaseAdmin } from "@/lib/supabase/server";
import { planForPrice, stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe's view of who is paying for what, written into profiles.plan.
 *
 * The plan column is already the thing the cap reads, in all three places it's
 * enforced — so this route's whole job is to keep one column true. Nothing here
 * decides what a plan allows.
 *
 * Three properties this has to have, and each has bitten real integrations:
 *
 *   1. **Verify the signature.** Without it, anyone who knows the URL can grant
 *      themselves Mutton with a curl. The raw body is required for that, which
 *      is why this reads request.text() rather than request.json().
 *   2. **Be idempotent.** Stripe retries on any non-2xx, and delivers
 *      out of order under load. Every handler here is a plain assignment of
 *      current state, never an increment or a toggle, so a replay is harmless.
 *   3. **Return 2xx for events we ignore.** A 400 on an unrecognised type makes
 *      Stripe retry it forever and eventually disable the endpoint — taking the
 *      events we *do* care about down with it.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured.", { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("No signature.", { status: 400 });

  const raw = await request.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    // A bad signature is the one case worth refusing loudly: it means either a
    // misconfigured secret or someone forging events.
    return new Response(
      `Signature check failed: ${error instanceof Error ? error.message : "unknown"}`,
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  /** Write the plan for whoever this subscription belongs to. */
  async function apply(subscriptionId: string, fallbackUserId?: string | null) {
    const subscription = await stripe().subscriptions.retrieve(subscriptionId);

    const userId =
      (subscription.metadata?.user_id as string | undefined) || fallbackUserId || null;
    if (!userId) return;

    // Cancelled, unpaid or past due — anything that isn't a paying subscription
    // drops them to Lamb. Their listings stay exactly where they are; the cap
    // only ever stops the NEXT one going up.
    const paying = subscription.status === "active" || subscription.status === "trialing";
    const priceId = subscription.items.data[0]?.price?.id;
    const plan = paying ? planForPrice(priceId) ?? "lamb" : "lamb";

    await admin
      .from("profiles")
      .update({ plan, stripe_customer_id: String(subscription.customer) })
      .eq("id", userId);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        // client_reference_id carries our user id through Checkout — the only
        // link back, since Stripe has never heard of Supabase.
        await apply(String(session.subscription), session.client_reference_id);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await apply(event.data.object.id);
      break;
    }

    default:
      // Acknowledged and ignored. See note 3 above.
      break;
  }

  return Response.json({ received: true });
}
