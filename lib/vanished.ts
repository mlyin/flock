/**
 * Which live listings did not appear in the shop we just read.
 *
 * Pure on purpose: this decides whether a seller gets asked "did this sell?",
 * and the cost of getting it wrong is asymmetric. A missed sale is a listing
 * that stays up one sync longer. A false positive is Flock telling someone to
 * delist a garment that is still for sale — which is the exact behaviour that
 * makes SellRaze's version their most-complained-about feature.
 *
 * So the bar for flagging is deliberately high, and every guard below exists
 * because absence is ambiguous evidence.
 */

export type LiveListing = {
  id: string;
  item_id: string;
  /** The marketplace's own id for it — the slug in the URL, usually. */
  external_id: string | null;
  url: string | null;
  absent_streak: number;
};

export type VanishCheck = {
  /** Listings to flag as candidates now. */
  flag: Array<{ listing: LiveListing; misses: number }>;
  /** Listings still present — their streak resets. */
  seen: LiveListing[];
  /** Absent, but not yet enough times to ask about. */
  pending: Array<{ listing: LiveListing; misses: number }>;
  /** Why the whole check was skipped, when it was. */
  skipped: string | null;
};

/** How many consecutive reads a listing must be missing from before we ask. */
export const MISSES_BEFORE_ASKING = 2;

const slugOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ? last.toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * @param live      Listings Flock believes are live on this channel.
 * @param scrapedIds External ids the reader actually saw. May be empty.
 */
export function detectVanished(live: LiveListing[], scrapedIds: string[]): VanishCheck {
  const empty: VanishCheck = { flag: [], seen: [], pending: [], skipped: null };

  // An empty read is not evidence of anything. A shop page that returns no
  // listings is overwhelmingly a failed load, a sign-out, or a layout change —
  // not a seller whose entire closet sold between two syncs. Treating it as
  // evidence would flag every listing they own at once, which is precisely the
  // catastrophic version of this feature.
  if (scrapedIds.length === 0) {
    return { ...empty, skipped: "the shop read came back empty" };
  }

  const seenSet = new Set(scrapedIds.map((id) => id.toLowerCase()));

  for (const listing of live) {
    // A listing we could never recognise in a scrape cannot be judged by its
    // absence from one. No external id and no url means nothing ever confirmed
    // it went live on the marketplace at all.
    const key = listing.external_id?.toLowerCase() ?? slugOf(listing.url);
    if (!key) continue;

    if (seenSet.has(key)) {
      empty.seen.push(listing);
      continue;
    }

    const misses = (listing.absent_streak ?? 0) + 1;
    if (misses >= MISSES_BEFORE_ASKING) empty.flag.push({ listing, misses });
    else empty.pending.push({ listing, misses });
  }

  return empty;
}
