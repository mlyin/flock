"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CHANNEL_LABEL } from "@/lib/fees";
import type { DelistTask } from "@/lib/data";
import { resolveDelistTask } from "@/app/actions";
import ChannelIcon from "./ChannelIcon";

/**
 * Listings that are still up for something already sold.
 *
 * The worst outcome in cross-listing isn't a slow sale, it's a second buyer
 * paying for an item that's already in the post. This is the list of ways that
 * can still happen right now, and it sits at the top of the dashboard because
 * every hour one of these stays up is an hour someone can buy it.
 *
 * Flock doesn't take them down — that's destructive, inside the seller's own
 * marketplace account. It opens each one and asks.
 */
export default function DelistQueue({ tasks }: { tasks: DelistTask[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const live = tasks.filter((t) => !done.has(t.id));
  if (live.length === 0) return null;

  const resolve = (id: string, state: "gone" | "skipped") => {
    start(async () => {
      const outcome = await resolveDelistTask(id, state);
      if (outcome.ok) setDone((prev) => new Set(prev).add(id));
    });
  };

  return (
    <div className="delist">
      <div className="delist-head">
        <strong>
          {live.length} listing{live.length === 1 ? "" : "s"} still up for something that sold
        </strong>
        <p>
          Someone can still buy {live.length === 1 ? "it" : "these"}. Take {live.length === 1 ? "it" : "them"} down
          on the marketplace, then tick {live.length === 1 ? "it" : "them"} off here.
        </p>
      </div>

      <ul className="delist-list">
        {live.map((task) => (
          <li key={task.id}>
            <ChannelIcon channel={task.channel} />
            <div className="delist-what">
              <strong>{CHANNEL_LABEL[task.channel]}</strong>
              {task.item && (
                <Link href={`/items/${task.item.id}`} className="muted">
                  {task.item.sku} · {task.item.title}
                </Link>
              )}
              <span className="muted">sold on {CHANNEL_LABEL[task.sold_on]}</span>
            </div>

            <div className="delist-actions">
              {task.listing?.url && (
                <a className="button button-sm" href={task.listing.url} target="_blank" rel="noreferrer">
                  Open →
                </a>
              )}
              <button
                type="button"
                className="button button-sm button-quiet"
                disabled={pending}
                onClick={() => resolve(task.id, "gone")}
              >
                It&apos;s down
              </button>
              {/* Not a failure state. Two identical pieces is a normal thing to
                  own, and a queue that nags forever is one people stop reading. */}
              <button
                type="button"
                className="linkbtn"
                disabled={pending}
                onClick={() => resolve(task.id, "skipped")}
                title="I have another one of these — leave it up"
              >
                keep it up
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
