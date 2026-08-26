import { CHANNEL_LABEL, type Channel } from "./fees";

/**
 * Is the always-on node still alive?
 *
 * Every failure mode of an unattended browser looks the same from outside:
 * nothing arrives, and nobody is told. An expired marketplace session, a
 * screen saver occluding Chrome, a macOS update that rebooted the box, a
 * crashed service worker, a revoked pairing token — all of them present as
 * silence, and silence is indistinguishable from a quiet week.
 *
 * `channel_syncs` has recorded every sync since March and nothing has ever
 * read it. This is the reader. It answers one question — when did this channel
 * last actually report in — and turns a long enough gap into something the
 * seller sees.
 */

export type SyncRow = {
  channel: Channel;
  last_sync_at: string;
  found: number;
  error: string | null;
};

export type Health = "fresh" | "late" | "silent" | "erroring";

export type ChannelHealth = {
  channel: Channel;
  label: string;
  state: Health;
  /** Minutes since the last report. Null when it has never reported. */
  minutesAgo: number | null;
  lastSyncAt: string | null;
  error: string | null;
  /** What the seller should read. */
  detail: string;
};

/**
 * The extension's alarm runs every 30 minutes (`SYNC_MINUTES` in
 * background.js), so these are multiples of that rather than round numbers.
 *
 * `LATE` is three missed runs, not one. A single miss is ordinary — the laptop
 * was shut, the machine was asleep, Chrome was restarting — and a warning that
 * fires on ordinary behaviour is one nobody reads by the second week.
 */
export const SYNC_MINUTES = 30;
export const LATE_AFTER = SYNC_MINUTES * 3;
export const SILENT_AFTER = SYNC_MINUTES * 12;

export function assess(row: SyncRow | null, now: Date, channel: Channel): ChannelHealth {
  const label = CHANNEL_LABEL[channel];

  if (!row) {
    return {
      channel,
      label,
      state: "silent",
      minutesAgo: null,
      lastSyncAt: null,
      error: null,
      detail: `${label} has never synced. Pair the extension and run a sync once.`,
    };
  }

  const at = new Date(row.last_sync_at);
  if (Number.isNaN(at.getTime())) {
    return {
      channel,
      label,
      state: "silent",
      minutesAgo: null,
      lastSyncAt: null,
      error: null,
      detail: `${label}'s last sync time is unreadable.`,
    };
  }

  const minutesAgo = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));

  // An error is worse than a gap, because it names the cause. Report it even
  // when the sync itself was recent — a node that has been failing every half
  // hour for six hours is "fresh" by timestamp and broken in fact.
  if (row.error) {
    return {
      channel,
      label,
      state: "erroring",
      minutesAgo,
      lastSyncAt: row.last_sync_at,
      error: row.error,
      detail: `${label} reported in ${describe(minutesAgo)} but failed: ${row.error}`,
    };
  }

  if (minutesAgo >= SILENT_AFTER) {
    return {
      channel,
      label,
      state: "silent",
      minutesAgo,
      lastSyncAt: row.last_sync_at,
      error: null,
      // The likeliest causes, in the order they actually happen.
      detail:
        `${label} has not synced for ${describe(minutesAgo)}. Usually a marketplace session ` +
        `that expired, or the machine asleep. Sign in again on the node and run a sync.`,
    };
  }

  if (minutesAgo >= LATE_AFTER) {
    return {
      channel,
      label,
      state: "late",
      minutesAgo,
      lastSyncAt: row.last_sync_at,
      error: null,
      detail: `${label} last synced ${describe(minutesAgo)} ago — it usually runs every half hour.`,
    };
  }

  return {
    channel,
    label,
    state: "fresh",
    minutesAgo,
    lastSyncAt: row.last_sync_at,
    error: null,
    detail: `${label} synced ${describe(minutesAgo)} ago.`,
  };
}

function describe(minutes: number): string {
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * Assess only the channels that have ever reported.
 *
 * Deliberately not every channel in CHANNELS: a seller who has never synced
 * Grailed does not have a broken Grailed, and listing eight "never synced"
 * warnings for channels they do not use is how a health panel becomes
 * furniture. Silence is only evidence once there was noise.
 */
export function assessAll(rows: SyncRow[], now: Date): ChannelHealth[] {
  const order: Record<Health, number> = { erroring: 0, silent: 1, late: 2, fresh: 3 };
  return rows
    .map((row) => assess(row, now, row.channel))
    .sort((a, b) => order[a.state] - order[b.state]);
}

/** True when something needs a human. */
export const needsAttention = (all: ChannelHealth[]): boolean =>
  all.some((h) => h.state === "silent" || h.state === "erroring");
