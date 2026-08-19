"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";
import { answerOffer } from "@/app/offer-actions";
import { considerOffer } from "@/app/actions";

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

type Advice = {
  move: string;
  counterAt: number | null;
  because: string;
  working: string[];
  reply: string;
};

function OfferCard({ offer }: { offer: OfferView }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Work out the move and draft the words. Sends nothing, commits to nothing —
  // accepting is a binding sale and a reply speaks to a real buyer as the
  // seller, so both stay a deliberate tap away with the reasoning on screen.
  const think = () => {
    setError(null);
    setThinking(true);
    start(async () => {
      const outcome = await considerOffer(offer.id);
      setThinking(false);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setAdvice(outcome);
      if (outcome.move === "counter" && outcome.counterAt) {
        setCounter(outcome.counterAt.toFixed(2));
      }
    });
  };
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
          {!advice && (
            <button className="button button-quiet" disabled={pending} onClick={think}>
              {thinking ? "Working it out…" : "What should I do?"}
            </button>
          )}
          {/* Deep link first: this is where the offer is actually accepted. */}
          {offer.offerUrl && (
            /* Opening the tab is NOT accepting. This used to fire
               act("accepted") on click, which wrote a binding sale into the
               ledger for a seller who had done nothing but look — and then
               removed the offer from the queue, since the queue only shows
               open ones. Looking at an offer is how you decide to decline it. */
            <a
              className="button"
              href={offer.offerUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on {CHANNEL_LABEL[offer.channel as keyof typeof CHANNEL_LABEL]} →
            </a>
          )}
          <button className="button button-quiet" disabled={pending} onClick={() => act("accepted")}>
            I accepted it
          </button>
          <button className="button button-quiet" onClick={() => setCountering(true)}>
            Counter
          </button>
          <button className="button button-quiet" disabled={pending} onClick={() => act("declined")}>
            I declined it
          </button>
        </div>
      )}

      {advice && (
        <div className={`advice advice-${advice.move}`}>
          <div className="advice-head">
            <strong>
              {advice.move === "counter" && advice.counterAt
                ? `Counter at ${usd(advice.counterAt)}`
                : advice.move === "accept"
                  ? "Take it"
                  : advice.move === "decline"
                    ? "Let it go"
                    : "Needs you"}
            </strong>
            <button type="button" className="linkbtn" onClick={() => setShowWorking((v) => !v)}>
              {showWorking ? "hide the maths" : "show the maths"}
            </button>
          </div>
          <p className="advice-because">{advice.because}</p>

          {/* The arithmetic, on request. A price decision the seller can't
              check is one they have to trust, and this is their money. */}
          {showWorking && (
            <ul className="advice-working">
              {advice.working.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          {advice.reply && (
            <div className="advice-reply">
              <p>{advice.reply}</p>
              <div className="advice-replyactions">
                <button
                  type="button"
                  className="button button-sm button-quiet"
                  onClick={() => {
                    navigator.clipboard.writeText(advice.reply);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied" : "Copy reply"}
                </button>
                <span className="muted">
                  Flock doesn&apos;t send this. Read it, change it if it isn&apos;t how you&apos;d
                  put it, then send it yourself.
                </span>
              </div>
            </div>
          )}
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
