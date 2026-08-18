"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";
import { answerOffer } from "@/app/offer-actions";

/** Serialisable shape — ScoredOffer carries Dates, which can't cross the boundary. */
export type OfferView = {
  id: string;
  channel: string;
  sender: string | null;
  body: string | null;
  amount: number;
  net: number;
  floor: number | null;
  profit: number | null;
  aboveFloor: boolean | null;
  hoursLeft: number | null;
  offerUrl: string | null;
  receivedAt: string;
  item: { id: string; sku: string; title: string; brand: string | null; listPrice: number | null } | null;
};

export default function OfferQueue({ offers }: { offers: OfferView[] }) {
  if (offers.length === 0) {
    return (
      <div className="notice">
        <strong>No open offers</strong>
        <p>
          Offers from every connected channel land here with the fee maths already done, so
          you can see what each one actually leaves you before you answer it.
        </p>
      </div>
    );
  }

  return (
    <div className="offerlist">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
}

function OfferCard({ offer }: { offer: OfferView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState(
    offer.floor ? offer.floor.toFixed(2) : offer.amount.toFixed(2)
  );

  const act = (answer: "accepted" | "declined" | "countered") => {
    setError(null);
    start(async () => {
      const result = await answerOffer(
        offer.id,
        answer,
        answer === "countered" ? Number(counter) : undefined
      );
      if (!result.ok) setError(result.error);
    });
  };

  const askPct =
    offer.item?.listPrice && offer.item.listPrice > 0
      ? Math.round((offer.amount / offer.item.listPrice) * 100)
      : null;

  const urgent = offer.hoursLeft !== null && offer.hoursLeft <= 12;

  return (
    <article className="offercard">
      <div className="offercard-top">
        <div className="offercard-who">
          {offer.item ? (
            <Link href={`/items/${offer.item.id}`} className="offercard-item">
              {offer.item.brand ? `${offer.item.brand} ` : ""}
              {offer.item.title}
            </Link>
          ) : (
            <span className="offercard-item muted">Not matched to an item</span>
          )}
          <div className="offercard-meta">
            <span className="mchip">{CHANNEL_LABEL[offer.channel as keyof typeof CHANNEL_LABEL]}</span>
            <span>{offer.sender ?? "Buyer"}</span>
            {offer.item && <span className="cell-sku">{offer.item.sku}</span>}
            {offer.hoursLeft !== null && (
              <span className={urgent ? "num-neg" : "muted"}>
                {offer.hoursLeft <= 0 ? "expired" : `${offer.hoursLeft}h left`}
              </span>
            )}
          </div>
        </div>

        <div className="offercard-money">
          <div className="offercard-amount">{usd(offer.amount)}</div>
          {askPct !== null && <div className="cell-sub">{askPct}% of ask</div>}
        </div>
      </div>

      {offer.body && <p className="msg-body">{offer.body}</p>}

      {/* The whole reason this screen exists: what the offer actually leaves you. */}
      <div className="offercard-maths">
        <span>
          nets <b>{usd(offer.net)}</b>
        </span>
        {offer.profit !== null && (
          <span className={offer.profit >= 0 ? "num-pos" : "num-neg"}>
            {offer.profit >= 0 ? "+" : ""}
            {usd(offer.profit)} profit
          </span>
        )}
        {offer.floor !== null && (
          <span className={offer.aboveFloor ? "num-pos" : "num-neg"}>
            floor {usd(offer.floor)}
            {offer.aboveFloor ? " — clears it" : " — under it"}
          </span>
        )}
      </div>

      {error && <p className="offercard-error">{error}</p>}

      {countering ? (
        <div className="offercard-counter">
          <label className="field-label" htmlFor={`c-${offer.id}`}>
            Counter with
          </label>
          <input
            id={`c-${offer.id}`}
            className="field"
            inputMode="decimal"
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
          />
          <button className="button" disabled={pending} onClick={() => act("countered")}>
            {pending ? "Saving…" : "Record counter"}
          </button>
          <button className="button button-quiet" onClick={() => setCountering(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="offercard-actions">
          {/* Deep link first: this is where the offer is actually accepted. */}
          {offer.offerUrl && (
            <a
              className="button"
              href={offer.offerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => act("accepted")}
            >
              Open on {CHANNEL_LABEL[offer.channel as keyof typeof CHANNEL_LABEL]} →
            </a>
          )}
          <button className="button button-quiet" disabled={pending} onClick={() => act("accepted")}>
            Accepted
          </button>
          <button className="button button-quiet" onClick={() => setCountering(true)}>
            Counter
          </button>
          <button className="button button-quiet" disabled={pending} onClick={() => act("declined")}>
            Declined
          </button>
        </div>
      )}

      <p className="offercard-fine">
        Flock records your decision and the maths behind it. The accept itself happens on
        {" "}
        {CHANNEL_LABEL[offer.channel as keyof typeof CHANNEL_LABEL]}, from your own browser.
      </p>
    </article>
  );
}
