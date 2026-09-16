import { FILLABLE, type Channel } from "./fees";

/**
 * Browser nodes: what may run unattended, what waits for a person, and how a
 * fill's result becomes a job status.
 *
 * Pure, and imported by both ends of the queue — the bearer routes that hand
 * jobs to a node and the dashboard that explains them — so the two agree on
 * what a status means. The rule this file exists to hold, stated once:
 *
 *   FILLING A FORM IS NOT PUBLISHING A LISTING.
 *
 * A job is `published` only when the marketplace itself navigated to a live
 * listing URL and the posted route recorded it. Everything short of that is
 * either `filled` (submit pressed, marketplace not yet heard from) or
 * `needs_seller` (a person has to press something), and the dashboard says
 * which. A fill that "went in" is not a listing anyone can buy.
 */

export type FillJobStatus =
  | "queued"
  | "running"
  | "filled"
  | "needs_seller"
  | "published"
  | "failed"
  | "cancelled";

/** Statuses the dashboard still shows; published and cancelled fall off. */
export const OPEN_JOB_STATUSES: FillJobStatus[] = [
  "queued",
  "running",
  "filled",
  "needs_seller",
  "failed",
];

/**
 * Channels whose fillers press the marketplace's own submit when auto-submit
 * is on: fill-depop.js, fill-vinted.js and fill-grailed.js each do, gated on
 * nothing required being empty and photos having attached. Everything else
 * fills and stops.
 */
export const AUTO_SUBMIT_CHANNELS: Channel[] = ["depop", "vinted", "grailed"];

/**
 * Channels where a person presses the final button, whatever the setting.
 *
 * Facebook's create screen ends at "Next" with a second screen behind it, and
 * fill-facebook.js stops there on purpose. Mercari's form carries invisible
 * reCAPTCHA v3, which scores a scripted click against the seller's real
 * account; fill-mercari.js ignores auto-submit by design and must keep doing
 * so. This list is the server-side statement of the same two facts, so no
 * setting on a node can reach past them.
 */
export const HUMAN_PUBLISH_CHANNELS: Channel[] = ["facebook", "mercari"];

/**
 * A failed fill is retried by the seller, not by the node, and a job's
 * attempts are capped — mirrored in claim_fill_jobs (0038), which also
 * reclaims a `running` job whose node went quiet. A seller who dismisses a
 * job and queues the listing again starts a new job on purpose; the cap is
 * on the node looping, not on the seller deciding.
 */
export const MAX_ATTEMPTS = 3;

/** How long a `filled` job may wait for the marketplace before it reads as stuck. */
export const FILLED_STALE_MINUTES = 15;

/**
 * How long a `running` job may go without its node reporting before the
 * seller may retry or cancel it. The node's fill has a 90s ceiling and a 45s
 * publish wait, and Chrome kills the worker at five minutes; a quarter hour
 * past the claim, the report is not coming.
 */
export const RUNNING_STALE_MINUTES = 15;

export function isStaleRunning(
  job: { status: FillJobStatus; claimedAt?: string | null },
  now: Date
): boolean {
  if (job.status !== "running" || !job.claimedAt) return false;
  const at = new Date(job.claimedAt).getTime();
  return Number.isFinite(at) && now.getTime() - at >= RUNNING_STALE_MINUTES * 60_000;
}

/** Whether this job may press submit: the node's setting, minus the channels it never applies to. */
export function jobAutoSubmit(nodeAutoSubmit: boolean, channel: Channel): boolean {
  return (
    nodeAutoSubmit &&
    AUTO_SUBMIT_CHANNELS.includes(channel) &&
    !HUMAN_PUBLISH_CHANNELS.includes(channel)
  );
}

/** Only a drafted listing on a channel with a filler can be queued. */
export function eligibleForQueue(listing: { status: string; channel: Channel }): boolean {
  return listing.status === "draft" && FILLABLE.includes(listing.channel);
}

/** What a node reports after running one fill. Mirrors the filler's own response. */
export type FillResult = {
  channel: Channel;
  ok: boolean;
  error?: string | null;
  filled?: string[];
  missing?: string[];
  blocked?: string[];
  autoSubmit: boolean;
  /** The listing URL, when the marketplace navigated to it during the job. */
  publishedUrl?: string | null;
};

/**
 * The fillers record a press of the marketplace's own button in `filled`, in
 * two wordings that must both be recognised here or a real submit is
 * misread as "waiting for you" and the seller is offered "Fill again" on a
 * listing that already went out — the double-post this queue exists to
 * prevent:
 *
 *   fill-depop.js    `clicked Post` / `clicked Continue` / `clicked Publish`
 *                    (one line per button it advanced through)
 *   fill-vinted.js   `submitting — the tab will land on the listing`
 *   fill-grailed.js  `submitting — the tab will land on the listing`
 *
 * `clicked Continue` and `clicked Next` are steps, not a submit, so only the
 * final buttons count on Depop. Pinned by lib/nodes.test.ts against the
 * fillers' own strings.
 */
const SUBMIT_CLICK = /^clicked (publish|post|list it|list)$/i;
const SUBMITTING = /^submitting\b/i;

export function submitWasPressed(filled: string[] | undefined): boolean {
  return (filled ?? []).some((f) => {
    const line = f.trim();
    return SUBMIT_CLICK.test(line) || SUBMITTING.test(line);
  });
}

export type FillVerdict = Exclude<FillJobStatus, "queued" | "running" | "cancelled">;

/**
 * Turn a fill's result into a job status.
 *
 * Order matters. The marketplace's word (a listing URL) beats everything; a
 * crash beats everything else; the two human-publish channels are
 * `needs_seller` however clean the fill; a blocked field means the form will
 * not submit; and only a submit the filler actually pressed earns `filled`.
 * Anything else is a form a person still has to finish — including a perfect
 * fill with auto-submit off, which is the ordinary case on a laptop.
 */
export function classifyOutcome(r: FillResult): FillVerdict {
  if (r.publishedUrl) return "published";
  if (!r.ok) return "failed";
  if (HUMAN_PUBLISH_CHANNELS.includes(r.channel)) return "needs_seller";
  if ((r.blocked?.length ?? 0) > 0) return "needs_seller";
  if (r.autoSubmit && jobAutoSubmit(true, r.channel) && submitWasPressed(r.filled)) return "filled";
  return "needs_seller";
}

/**
 * Whether the seller may ask for this job to run again: a failure, a handoff
 * they would rather have the node take another pass at, or a run whose node
 * went quiet — never one that is genuinely in flight, and never past the cap.
 */
export function canRetry(
  job: { status: FillJobStatus; attempts: number; claimedAt?: string | null },
  now: Date = new Date()
): boolean {
  if (job.attempts >= MAX_ATTEMPTS) return false;
  if (job.status === "failed" || job.status === "needs_seller") return true;
  return isStaleRunning(job, now);
}

/** Whether the seller may withdraw this job: anything but a run that is genuinely in flight. */
export function canCancel(
  job: { status: FillJobStatus; claimedAt?: string | null },
  now: Date = new Date()
): boolean {
  if (job.status === "published" || job.status === "cancelled") return false;
  if (job.status === "running") return isStaleRunning(job, now);
  return true;
}

/**
 * Seller-facing sentence per status. `label` is the marketplace's name.
 * Deliberately never the word "published" for anything but `published`.
 */
export function describeJob(
  status: FillJobStatus,
  label: string,
  detail: {
    missing?: string[];
    blocked?: string[];
    error?: string | null;
    filledMinutesAgo?: number | null;
    runningStale?: boolean;
  } = {}
): string {
  switch (status) {
    case "queued":
      return `Waiting for your browser to pick it up.`;
    case "running":
      return detail.runningStale
        ? `Your browser went quiet while filling the ${label} form. Fill again, or cancel it.`
        : `Your browser is filling the ${label} form now.`;
    case "filled": {
      const stuck = (detail.filledMinutesAgo ?? 0) >= FILLED_STALE_MINUTES;
      return stuck
        ? `Submit was pressed on ${label} ${detail.filledMinutesAgo} minutes ago and no listing has appeared. Check the tab in your browser.`
        : `Submit was pressed on ${label}. Waiting for the marketplace to show the listing.`;
    }
    case "needs_seller": {
      const left = [...(detail.blocked ?? []), ...(detail.missing ?? [])].filter(
        (m) => !/auto-submit off/i.test(m)
      );
      if (left.length) return `Filled on ${label}. Left for you: ${left.slice(0, 4).join(", ")}.`;
      return `Filled on ${label}. Open your browser and press its publish button yourself.`;
    }
    case "published":
      return `Live on ${label}.`;
    case "failed":
      return detail.error ? `Couldn't fill ${label}: ${detail.error}` : `Couldn't fill ${label}.`;
    case "cancelled":
      return `Withdrawn.`;
  }
}

/* --------------------------------------------------------------------------
   Liveness.

   A node polls /api/ext/jobs every minute, and verifyToken stamps
   extension_tokens.last_used_at on every call — so "when did this browser
   last check in" needs no heartbeat of its own. The thresholds are multiples
   of the poll, and "late" tolerates a few misses because a container restart
   or a slow host is ordinary; a warning on ordinary behaviour is one nobody
   reads by the second week (lib/heartbeat.ts learned this first).
   -------------------------------------------------------------------------- */

export const NODE_POLL_MINUTES = 1;
export const NODE_LATE_AFTER = NODE_POLL_MINUTES * 5;
export const NODE_SILENT_AFTER = NODE_POLL_MINUTES * 30;

export type NodeLiveness = {
  state: "never" | "fresh" | "late" | "silent";
  minutesAgo: number | null;
  detail: string;
};

export function nodeLiveness(lastUsedAt: string | null | undefined, now: Date): NodeLiveness {
  if (!lastUsedAt) {
    return {
      state: "never",
      minutesAgo: null,
      detail: "Your browser has not checked in yet. It usually does within a minute of starting.",
    };
  }
  const at = new Date(lastUsedAt);
  if (Number.isNaN(at.getTime())) {
    return { state: "never", minutesAgo: null, detail: "Your browser's last check-in time is unreadable." };
  }
  const minutesAgo = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutesAgo >= NODE_SILENT_AFTER) {
    return {
      state: "silent",
      minutesAgo,
      detail: `Your browser has not checked in for ${describeMinutes(minutesAgo)}. It is probably stopped; open it and see.`,
    };
  }
  if (minutesAgo >= NODE_LATE_AFTER) {
    return {
      state: "late",
      minutesAgo,
      detail: `Your browser last checked in ${describeMinutes(minutesAgo)} ago. It usually checks in every minute.`,
    };
  }
  return {
    state: "fresh",
    minutesAgo,
    detail:
      minutesAgo < 2
        ? "Your browser checked in just now."
        : `Your browser checked in ${describeMinutes(minutesAgo)} ago.`,
  };
}

function describeMinutes(minutes: number): string {
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}
