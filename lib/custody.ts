import { CONSIGNMENT, isConsignment, type Channel } from "./fees";

/**
 * Where the garment physically is, and what that permits.
 *
 * Every channel except consignment is non-exclusive: the same jacket sits on
 * Depop, Vinted and Grailed at once, the first buyer wins, the rest come down.
 * That works because the jacket is in the seller's closet the whole time.
 *
 * Consignment breaks it. You ship the item to The RealReal and they hold it.
 * While it is in their warehouse a Depop listing is not an optimistic
 * cross-list, it is an oversell — the seller finds out when a buyer pays for
 * something 2,000 miles away and they have to cancel, which on most platforms
 * costs a defect or account standing.
 *
 * The schema for this has existed since migration 0011 with nothing reading or
 * writing it, so the rule was documented and unenforced.
 */

export type Custody = "hand" | "consigned" | "returned";

export const CUSTODY_LABEL: Record<Custody, string> = {
  hand: "In your closet",
  consigned: "With a consignor",
  returned: "Came back unsold",
};

/** True when the garment is physically available to ship. */
export function inHand(custody: Custody): boolean {
  return custody !== "consigned";
}

export type ListingVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * May this item be listed on this channel right now?
 *
 * The asymmetry is deliberate. Blocking a listing that would have been fine
 * costs the seller one click to fix. Allowing one that is an oversell costs
 * them a cancelled order and a rating hit, and they find out days later.
 */
export function canList(
  item: { custody: Custody; consigned_to: Channel | null },
  channel: Channel
): ListingVerdict {
  if (item.custody !== "consigned") return { allowed: true };

  const holder = item.consigned_to;

  // Listing it with the consignor that already holds it is not an oversell —
  // that IS the consignment. It is how the item gets sold at all.
  if (holder && channel === holder) return { allowed: true };

  // Consigned to one house, being offered to another. Still an oversell: they
  // cannot ship it either.
  if (isConsignment(channel)) {
    return {
      allowed: false,
      reason: holder
        ? `It's already with ${holder} — one consignor at a time.`
        : "It's out on consignment, so a second consignor can't take it.",
    };
  }

  return {
    allowed: false,
    reason: holder
      ? `It's physically with ${holder}. Listing it here would sell something you can't ship.`
      : "It's out on consignment, so there's nothing here to ship.",
  };
}

/** The channels an item may be drafted or listed on, given where it is. */
export function listableChannels(
  item: { custody: Custody; consigned_to: Channel | null },
  channels: Channel[]
): Channel[] {
  return channels.filter((c) => canList(item, c).allowed);
}

export type Transition = { ok: true; custody: Custody } | { ok: false; error: string };

/**
 * Move an item's custody, refusing the moves that make no physical sense.
 *
 * "returned" and "hand" both mean the garment is in the closet — the
 * distinction is history, not capability, which is why `inHand` treats them
 * alike and only this function cares which.
 */
export function transition(
  from: Custody,
  to: "consigned" | "returned" | "hand",
  channel?: Channel
): Transition {
  if (to === "consigned") {
    if (from === "consigned") return { ok: false, error: "It's already out on consignment." };
    if (!channel) return { ok: false, error: "Which consignor is it going to?" };
    if (!isConsignment(channel)) {
      return {
        ok: false,
        error: `${channel} doesn't take custody — nothing is shipped to them until it sells.`,
      };
    }
    return { ok: true, custody: "consigned" };
  }

  if (to === "returned") {
    // Only a consigned item can come back. Marking a garment that never left
    // as "returned" would put a history on it that did not happen.
    if (from !== "consigned") {
      return { ok: false, error: "It was never sent anywhere, so it can't come back." };
    }
    return { ok: true, custody: "returned" };
  }

  return { ok: true, custody: "hand" };
}

/** Consignment channels, for offering the seller somewhere to send it. */
export const CONSIGNORS: Channel[] = CONSIGNMENT;
