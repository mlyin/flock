import { supabaseServer } from "./supabase/server";

/**
 * Plans, and the one limit that actually bites.
 *
 * The cap counts **listings that are live right now**, not garments ever added.
 * A free tier that stops at five items forever is a trial wearing the word
 * "free", and a seller works that out in a week. Five live at once is a real
 * tool for clearing your own wardrobe, and stops being enough exactly when
 * you're running stock — which is when paying for it is obviously worth it.
 *
 * The tiers are the real sheep lifecycle: a lamb is under a year, a hogget one
 * to two, mutton older than that.
 */
export type PlanId = "lamb" | "hogget" | "mutton";

export type Plan = {
  id: PlanId;
  label: string;
  /** null means no limit. */
  activeListings: number | null;
  monthly: number;
  headline: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "lamb",
    label: "Lamb",
    activeListings: 5,
    monthly: 0,
    headline: "Clearing out your own wardrobe.",
    features: [
      "5 listings live at once",
      "Every channel — Depop, Vinted, Grailed, Mercari",
      "Photo identification: brand, size, condition, colour",
      "Fee-adjusted net on every channel before you list",
      "One-click fill through the browser extension",
    ],
  },
  {
    id: "hogget",
    label: "Hogget",
    activeListings: 100,
    monthly: 12,
    headline: "Selling every week, and it adds up.",
    features: [
      "100 listings live at once",
      "Everything in Lamb",
      "Shared inbox across channels",
      "Offers, with your floor price held for you",
      "Sold-through and profit by channel",
    ],
  },
  {
    id: "mutton",
    label: "Mutton",
    activeListings: null,
    monthly: 29,
    headline: "This is the job, not the side of it.",
    features: [
      "Unlimited live listings",
      "Everything in Hogget",
      "Bulk relist and price drops",
      "Consignment tracking — The RealReal, ThredUp",
      "First access to new channels",
    ],
  },
];

export const planById = (id: string): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

export type Standing = {
  plan: Plan;
  beta: boolean;
  active: number;
  /** null when the plan has no limit. */
  remaining: number | null;
  atCap: boolean;
};

/**
 * What this seller is on, and how much room is left.
 *
 * A beta seller is on the top tier regardless of what `plan` says — the flag is
 * kept separate so a future billing system can still tell someone who paid from
 * someone who was here first. Those need different handling at renewal, and
 * collapsing them into one column loses the difference permanently.
 */
export async function standing(): Promise<Standing | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, beta")
    .eq("id", user.id)
    .maybeSingle();

  const beta = Boolean(profile?.beta);
  const plan = beta ? planById("mutton") : planById(profile?.plan ?? "lamb");

  // Live is the only status that occupies a slot. A draft costs nothing to
  // hold, and an ended or sold listing has already released its place.
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "live");

  const active = count ?? 0;
  const remaining = plan.activeListings === null ? null : Math.max(0, plan.activeListings - active);

  return { plan, beta, active, remaining, atCap: remaining !== null && remaining <= 0 };
}
