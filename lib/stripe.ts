import Stripe from "stripe";
import type { PlanId } from "./plan";

/**
 * Stripe, kept to the smallest surface that can charge someone correctly.
 *
 * Deliberately not a client singleton at module scope: this file is imported by
 * routes that run without the key set (a fresh clone, a preview deploy), and a
 * constructor that throws at import time takes the whole page down rather than
 * the one feature that needs it.
 */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
  return new Stripe(key);
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Price ids, by plan. Lamb is free and has none. */
export const PRICE: Record<Exclude<PlanId, "lamb">, string | undefined> = {
  hogget: process.env.STRIPE_PRICE_HOGGET,
  mutton: process.env.STRIPE_PRICE_MUTTON,
};

/**
 * Which plan a Stripe price belongs to.
 *
 * Resolved from the price id rather than from metadata we set at checkout,
 * because a subscription can change price in the Stripe dashboard without ever
 * passing through our checkout — and then metadata would describe a plan the
 * customer is no longer paying for.
 */
export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === PRICE.hogget) return "hogget";
  if (priceId === PRICE.mutton) return "mutton";
  return null;
}
