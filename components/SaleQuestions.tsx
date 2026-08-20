"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveSaleCandidate, type SaleCandidate } from "@/app/actions";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";

/**
 * "This stopped showing up — did it sell?"
 *
 * Deliberately a question rather than a notification. A listing disappears from
 * a shop for several reasons and only one of them is a sale; the seller is the
 * only one who knows which. Answering "sold" is also the only path that writes
 * money, so the price is editable and pre-filled with what it was listed at.
 */
export default function SaleQuestions({ candidates }: { candidates: SaleCandidate[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("");
  const router = useRouter();

  if (candidates.length === 0) return null;

  const answer = (id: string, verdict: "sold" | "removed" | "still_up", soldPrice?: number) =>
    startTransition(async () => {
      setError(null);
      const result = await resolveSaleCandidate(id, verdict, soldPrice);
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else {
        setAsking(null);
        router.refresh();
      }
    });

  return (
    <section className="salequestions">
      <div className="sectionhead">
        <h2>Did these sell?</h2>
        <p>
          {candidates.length} listing{candidates.length === 1 ? "" : "s"} stopped showing up in
          your shop. Nothing is recorded until you say.
        </p>
      </div>

      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t save that</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="qlist">
        {candidates.map((c) => (
          <div key={c.id} className="qrow">
            <div className="qrow-what">
              <strong>
                {c.brand ? `${c.brand} ` : ""}
                {c.title}
              </strong>
              <span className="qrow-meta">
                {c.sku} · {CHANNEL_LABEL[c.channel]} · listed {usd(c.listPrice)} · missing from{" "}
                {c.misses} reads
                {c.url && (
                  <>
                    {" · "}
                    <a href={c.url} target="_blank" rel="noreferrer" className="link">
                      check it
                    </a>
                  </>
                )}
              </span>
            </div>

            {asking === c.id ? (
              <div className="qrow-price">
                <label className="field" htmlFor={`price-${c.id}`}>
                  <span className="field-label">Sold for</span>
                  <input
                    id={`price-${c.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    autoFocus
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={pending || !Number(price)}
                  onClick={() => answer(c.id, "sold", Number(price))}
                >
                  {pending ? "Recording…" : "Record sale"}
                </button>
                <button type="button" className="pill" onClick={() => setAsking(null)} disabled={pending}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="qrow-actions">
                <button
                  type="button"
                  className="button"
                  disabled={pending}
                  onClick={() => {
                    setAsking(c.id);
                    setPrice(String(c.listPrice || ""));
                  }}
                >
                  It sold
                </button>
                <button
                  type="button"
                  className="pill"
                  disabled={pending}
                  onClick={() => answer(c.id, "removed")}
                >
                  I took it down
                </button>
                <button
                  type="button"
                  className="pill"
                  disabled={pending}
                  onClick={() => answer(c.id, "still_up")}
                >
                  Still there
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
