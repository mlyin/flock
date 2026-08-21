"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";
import type { PriceDriftView } from "@/lib/data";
import { resolvePriceDrift } from "@/app/actions";
import ChannelIcon from "./ChannelIcon";

/**
 * Where Flock's price and the marketplace's price disagree.
 *
 * Every net figure on the dashboard is computed from Flock's number. When the
 * marketplace shows a different one, those figures describe a sale that cannot
 * happen — and the Inbox judges offers against a floor derived from the same
 * fiction.
 *
 * Two answers, no default. Flock cannot tell a price drop the seller hasn't
 * applied yet from one they made on Depop and never told us about.
 */
export default function PriceDrift({ drifts }: { drifts: PriceDriftView[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const open = drifts.filter((d) => !done.has(d.listingId));
  if (open.length === 0) return null;

  const resolve = (id: string, answer: "adopt" | "keep") => {
    start(async () => {
      const outcome = await resolvePriceDrift(id, answer);
      if (outcome.ok) setDone((prev) => new Set(prev).add(id));
    });
  };

  return (
    <div className="delist delist-quiet">
      <div className="delist-head">
        <strong>
          {open.length} price{open.length === 1 ? "" : "s"} {open.length === 1 ? "doesn't" : "don't"}{" "}
          match the marketplace
        </strong>
        <p>
          Your net projections use Flock&apos;s number, and buyers see the marketplace&apos;s.
          Tell us which one is right.
        </p>
      </div>

      <ul className="delist-list">
        {open.map((d) => (
          <li key={d.listingId}>
            <ChannelIcon channel={d.channel} />
            <div className="delist-what">
              <strong>
                {CHANNEL_LABEL[d.channel]} shows {usd(d.theirs)}
                <span className={d.delta > 0 ? "num-pos" : "num-neg"}>
                  {" · "}
                  {d.delta > 0 ? "+" : "−"}
                  {usd(Math.abs(d.delta))}
                </span>
              </strong>
              {d.item && (
                <Link href={`/items/${d.item.id}`} className="muted">
                  {d.item.sku} · {d.item.brand ? `${d.item.brand} ` : ""}
                  {d.item.title}
                </Link>
              )}
              <span className="muted">Flock has {usd(d.ours)}</span>
            </div>

            <div className="delist-actions">
              {d.url && (
                <a className="button button-sm" href={d.url} target="_blank" rel="noreferrer">
                  Open →
                </a>
              )}
              <button
                type="button"
                className="button button-sm button-quiet"
                disabled={pending}
                onClick={() => resolve(d.listingId, "adopt")}
                title="The marketplace is right — take its price as ours"
              >
                Use {usd(d.theirs)}
              </button>
              {/* Not resolved, acknowledged. Nothing changes and the seller goes
                  and edits the form; we only stop asking about THIS market
                  price, so a later change raises it again. */}
              <button
                type="button"
                className="linkbtn"
                disabled={pending}
                onClick={() => resolve(d.listingId, "keep")}
                title="Mine is right — I'll update the marketplace"
              >
                keep {usd(d.ours)}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
