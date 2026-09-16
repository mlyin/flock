"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FillJobView, NodeView } from "@/app/node-actions";
import { cancelFillJob, retryFillJob } from "@/app/node-actions";
import { describeJob } from "@/lib/nodes";
import ChannelIcon from "./ChannelIcon";

/**
 * What the seller's browser is doing, and what it is waiting on.
 *
 * One row per open fill, with the form's own evidence inline: what went in,
 * what was left, and the marketplace's validation text. The status words are
 * from lib/nodes.ts and are chosen so that nothing here reads as "published"
 * unless the marketplace itself showed a listing. A row that says "left for
 * you" is a form a person still has to finish, and the button next to it
 * opens the browser where that form is.
 *
 * Renders nothing when there is nothing open. Published fills fall off; the
 * garment's channel board carries the live link from then on.
 */
export default function PendingFills({ jobs, node }: { jobs: FillJobView[]; node: NodeView | null }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const open = jobs.filter((j) => !gone.has(j.id));
  if (open.length === 0) return null;

  const waiting = open.filter((j) => j.status === "needs_seller" || (j.status === "filled" && j.stale)).length;
  const failed = open.filter((j) => j.status === "failed").length;
  const nodeUrl = node?.url ?? null;

  // The browser cannot run these, and "waiting for your browser" would be
  // a lie by omission. Say why.
  const nodeNote = !node
    ? "You have no browser to run these. Create one in Settings."
    : node.tokenRevoked
      ? "Your browser's pairing was revoked, so it will not pick these up. Create it again in Settings."
      : node.status === "paused"
        ? "Your browser is paused; these wait until you resume it in Settings."
        : node.status === "error" || node.status === "retired"
          ? "Your browser needs attention in Settings before these can run."
          : node.liveness.state === "silent"
            ? "Your browser has not checked in for a while, so these are waiting. Open it and see."
            : null;

  const retry = (id: string) =>
    start(async () => {
      setError(null);
      const outcome = await retryFillJob(id);
      if (!outcome.ok) setError(outcome.error ?? "Couldn't retry that.");
      router.refresh();
    });

  const cancel = (id: string) =>
    start(async () => {
      setError(null);
      const outcome = await cancelFillJob(id);
      if (outcome.ok) setGone((prev) => new Set(prev).add(id));
      else setError(outcome.error ?? "Couldn't cancel that.");
    });

  return (
    <div className={`delist ${failed > 0 ? "" : "delist-quiet"}`}>
      <div className="delist-head">
        <strong>
          {open.length} fill{open.length === 1 ? "" : "s"} in your browser
          {waiting > 0 ? ` · ${waiting} waiting for you` : ""}
          {failed > 0 ? ` · ${failed} failed` : ""}
        </strong>
        <p>
          {nodeNote ? `${nodeNote} ` : ""}
          A filled form is not a listing anyone can buy. A row is done only when the
          marketplace itself shows the listing; until then it says exactly what is still
          needed.
        </p>
      </div>

      {error && (
        <div className="notice notice-bad">
          <strong>That didn&apos;t work</strong>
          <p>{error}</p>
        </div>
      )}

      <ul className="delist-list">
        {open.map((job) => {
          const left = [...job.blocked, ...job.missing].filter((m) => !/auto-submit off/i.test(m));
          const needsYou = job.status === "needs_seller" || (job.status === "filled" && job.stale);
          return (
            <li key={job.id}>
              <ChannelIcon channel={job.channel} />
              <div className="delist-what">
                <strong>
                  {job.label}
                  {job.attempts > 1 ? <span className="muted"> · attempt {job.attempts}</span> : null}
                </strong>
                {job.item && (
                  <Link href={`/items/${job.item.id}`} className="muted">
                    {job.item.sku} · {job.item.title}
                  </Link>
                )}
                <span className="muted">
                  {describeJob(job.status, job.label, {
                    missing: job.missing,
                    blocked: job.blocked,
                    error: job.error,
                    filledMinutesAgo: job.filledMinutesAgo,
                    runningStale: job.status === "running" && job.stale,
                  })}
                </span>
                {job.filled.length > 0 && job.status !== "failed" && (
                  <span className="muted">
                    Went in: {job.filled.slice(0, 6).join(", ")}
                    {job.filled.length > 6 ? "…" : ""}
                  </span>
                )}
                {job.errors.length > 0 && (
                  <span className="muted">The form said: {job.errors.slice(0, 3).join(" · ")}</span>
                )}
                {left.length > 4 && (
                  <span className="muted">
                    And {left.length - 4} more field{left.length - 4 === 1 ? "" : "s"}.
                  </span>
                )}
              </div>

              <div className="delist-actions">
                {needsYou && nodeUrl && (
                  <a className="button button-sm" href={nodeUrl} target="_blank" rel="noreferrer">
                    Finish in your browser →
                  </a>
                )}
                {job.canRetry && (
                  <button
                    type="button"
                    className="button button-sm button-quiet"
                    disabled={pending}
                    onClick={() => retry(job.id)}
                  >
                    Fill again
                  </button>
                )}
                {job.canCancel && (
                  <button
                    type="button"
                    className="linkish"
                    disabled={pending}
                    onClick={() => cancel(job.id)}
                  >
                    {job.status === "queued" ? "Cancel" : "Dismiss"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
