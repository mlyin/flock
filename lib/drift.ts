/**
 * Where Flock's price and the marketplace's price disagree.
 *
 * Pure, for the same reason lib/vanished.ts is: this decides what the seller
 * gets asked about, and a queue that cries wolf is a queue nobody reads.
 *
 * Note what this deliberately does NOT do — decide who is right. Flock cannot
 * know whether a $48/$60 disagreement is a drop the seller hasn't applied on
 * Depop yet or a raise they made on Depop and never told Flock about. Both are
 * real, both are common, and inferring from timestamps gets it wrong exactly
 * when the seller did two things in one sitting. So it reports the
 * disagreement and offers both answers.
 */

export type PricedListing = {
  id: string;
  item_id: string;
  channel: string;
  price: number | null;
  /** Last price seen on the marketplace, or null if never read. */
  market_price: number | null;
  /** Market price the seller already accepted, so it isn't raised again. */
  price_drift_ack: number | null;
};

export type Drift = {
  listing: PricedListing;
  /** What Flock has. */
  ours: number;
  /** What the marketplace shows. */
  theirs: number;
  /** theirs - ours. Negative means buyers see less than Flock thinks. */
  delta: number;
};

/**
 * A cent of disagreement is rounding, not a price change.
 *
 * Marketplaces render prices in different ways — "$48", "48.00", sometimes a
 * comma — and the reader parses all of them to a float. Comparing floats
 * exactly would raise a question about a hundredth of a cent.
 */
const EPSILON = 0.01;

export function detectDrift(listings: PricedListing[]): Drift[] {
  const out: Drift[] = [];

  for (const listing of listings) {
    const ours = listing.price;
    const theirs = listing.market_price;

    // Never read, or a listing with no price of its own, is not evidence of
    // disagreement. It is an absence of evidence, which is not the same thing.
    if (ours === null || theirs === null) continue;

    // A price of zero on either side means the read failed to find one, not
    // that something is free. Depop renders a sold item's price node empty.
    if (ours <= 0 || theirs <= 0) continue;

    if (Math.abs(theirs - ours) <= EPSILON) continue;

    // Already answered for this exact market price. If the marketplace moves
    // again that is a new fact and the question comes back.
    if (listing.price_drift_ack !== null && Math.abs(theirs - listing.price_drift_ack) <= EPSILON) {
      continue;
    }

    out.push({ listing, ours, theirs, delta: theirs - ours });
  }

  // Biggest disagreements first — that is where the money is, and a seller
  // working top-down should hit the costly ones before they lose interest.
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
