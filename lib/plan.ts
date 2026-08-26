import { supabaseServer } from "./supabase/server";

/**
 * Plans, and the one limit that actually bites.
 *
 * The cap counts listings that are **live right now**, and counts a garment
 * once however many marketplaces it's on. A jacket live on Depop, Vinted and
 * Grailed is one against the cap, not three — charging three times for one
 * garment would punish the exact behaviour the product exists to encourage.
 *
 * It is not a cap on garments ever added. A free tier that stops at five items
 * forever is a trial wearing the word "free", and a seller works that out in a
 * week. Five concurrent is a real tool for clearing a wardrobe, and stops being
 * enough exactly when you're running stock — which is the honest moment to ask
 * for money.
 *
 * Tiers are the real sheep lifecycle: a lamb is under a year, a hogget one to
 * two, mutton older than that.
 */
export type PlanId = "lamb" | "hogget" | "mutton";

/**
 * `soon` marks a feature that is NOT built yet.
 *
 * It renders as "in build" on the page rather than being quietly listed with
 * the rest. A pricing page is where overclaiming costs the most: someone pays
 * for a bullet, finds it missing, and is right to be angry. Delete the flag
 * when the feature lands, not before.
 */
export type Feature = { text: string; soon?: boolean };

export type Plan = {
  id: PlanId;
  label: string;
  /** null means no limit. */
  activeListings: number | null;
  monthly: number;
  headline: string;
  forWhom: string;
  cta: string;
  fine: string;
  features: Feature[];
};

export const PLANS: Plan[] = [
  {
    id: "lamb",
    label: "Lamb",
    activeListings: 5,
    monthly: 0,
    headline: "For anyone with a closet to thin out.",
    forWhom:
      "For clearing a wardrobe a few pieces at a time, or trying Flock on one real garment. You can stay here forever. That's fine.",
    cta: "Start on Lamb",
    fine: "No card.",
    features: [
      { text: "5 listings live at once, forever" },
      { text: "Every marketplace — Depop, Vinted, Grailed, Mercari" },
      { text: "Photograph the tag; Flock reads brand, size, condition" },
      { text: "Flags what it can't read instead of guessing" },
      { text: "Net payout per marketplace, before you post" },
    ],
  },
  {
    id: "hogget",
    label: "Hogget",
    activeListings: 400,
    monthly: 12,
    headline: "For the rail that's always going.",
    forWhom:
      "For 50–400 pieces working at any time, sourcing most weekends. Steady side income rather than a clear-out.",
    cta: "Go Hogget",
    fine: "One sold jacket covers the month.",
    features: [
      { text: "400 listings live at once" },
      { text: "Everything in Lamb, nothing clipped" },
      // "One inbox across every marketplace" until 26 Aug, with no `soon` flag
      // — on a PAID tier, while background.js throws by name for every channel
      // except Depop and read-depop-messages.js is the only reader that exists.
      // The inbox is real and works; its reach was the overclaim.
      { text: "Buyer messages and offers in one inbox — Depop today" },
      // These were one bullet marked `soon`, which was wrong in both
      // directions at once: bulk price drops shipped (bulkDropPrices), and
      // bulk relist genuinely has not been built.
      { text: "Bulk price drops across your inventory" },
      { text: "Bulk relist", soon: true },
      { text: "CSV export, any time" },
    ],
  },
  {
    id: "mutton",
    label: "Mutton",
    activeListings: null,
    monthly: 29,
    headline: "For when resale is the job, not the side of it.",
    forWhom:
      "For hundreds of pieces live, and books to square at the end of the month.",
    cta: "Go Mutton",
    fine: "Cancel in the app, two clicks.",
    features: [
      { text: "No cap on listings live at once" },
      { text: "Offers answered against your floor price" },
      // Shipped 21 Aug: lib/custody.ts, and migration 0034 enforces it in the
      // database. ThredUp is dropped rather than deflagged — it has never been
      // a channel in lib/fees.ts, so naming it promised a marketplace the
      // product has never had.
      { text: "Consignment tracking — The RealReal" },
      { text: "Profit and sell-through by marketplace" },
      { text: "Email that reaches the person who builds Flock" },
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
 * separate so a future billing system can still tell someone who paid from
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

  // One garment counts once, however many marketplaces it's live on — hence
  // the distinct item_id rather than a row count. Drafts hold no slot, and a
  // sold or ended listing has already given its place back.
  const { data: live } = await supabase
    .from("listings")
    .select("item_id")
    .eq("user_id", user.id)
    .eq("status", "live");

  const active = new Set((live ?? []).map((l) => l.item_id)).size;
  const remaining = plan.activeListings === null ? null : Math.max(0, plan.activeListings - active);

  return { plan, beta, active, remaining, atCap: remaining !== null && remaining <= 0 };
}
