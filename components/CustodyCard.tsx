"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_LABEL, type Channel } from "@/lib/fees";
import { CONSIGNORS, type Custody } from "@/lib/custody";
import { setCustody } from "@/app/actions";
import { shortDate } from "@/lib/money";

/**
 * Where this garment physically is.
 *
 * Only worth showing when it changes what the seller can do, which is why
 * there is no chip saying "in your closet" on every item — that is the state
 * of almost everything and a badge that always reads the same is furniture.
 * The card appears when the item is with a consignor, or when it can be sent
 * to one.
 */
export default function CustodyCard({
  itemId,
  custody,
  consignedTo,
  consignedAt,
  liveChannels,
}: {
  itemId: string;
  custody: Custody;
  consignedTo: Channel | null;
  consignedAt: string | null;
  liveChannels: Channel[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const move = (to: "consigned" | "returned" | "hand", channel?: Channel) => {
    setError(null);
    start(async () => {
      const outcome = await setCustody(itemId, to, channel);
      if (!outcome.ok) setError(outcome.error ?? "That didn't work.");
      else router.refresh();
    });
  };

  if (custody === "consigned") {
    const holder = consignedTo ? CHANNEL_LABEL[consignedTo] : "a consignor";
    return (
      <div className="notice notice-warn">
        <strong>
          With {holder}
          {consignedAt && ` since ${shortDate(consignedAt)}`}
        </strong>
        <p>
          They have the garment, so it can&apos;t be listed anywhere else — a sale on another
          channel is one you couldn&apos;t ship. {holder} prices and sells it; you&apos;ll see a
          payout, not a net you chose.
        </p>
        {error && <p className="num-neg">{error}</p>}
        <button type="button" className="button button-sm" disabled={pending} onClick={() => move("returned")}>
          {pending ? "Saving…" : "It came back unsold"}
        </button>
      </div>
    );
  }

  // Nothing to offer if there is nowhere to send it.
  if (CONSIGNORS.length === 0) return null;

  return (
    <div className="notice">
      <strong>{custody === "returned" ? "Back in your closet" : "Send it to a consignor"}</strong>
      <p>
        {custody === "returned"
          ? "It came back unsold, so it's free to list anywhere again."
          : "A consignor takes the garment, authenticates and prices it, and pays a commission. While they hold it, nothing else can be listed."}
      </p>
      {liveChannels.length > 0 && (
        <p className="muted">
          Live on {liveChannels.map((c) => CHANNEL_LABEL[c]).join(", ")} — take those down first.
        </p>
      )}
      {error && <p className="num-neg">{error}</p>}
      <div className="qrow-actions">
        {CONSIGNORS.map((channel) => (
          <button
            key={channel}
            type="button"
            className="button button-sm button-quiet"
            disabled={pending}
            onClick={() => move("consigned", channel)}
          >
            Ship to {CHANNEL_LABEL[channel]}
          </button>
        ))}
      </div>
    </div>
  );
}
