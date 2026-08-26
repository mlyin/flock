import { describe, expect, it } from "vitest";
import {
  LATE_AFTER,
  SILENT_AFTER,
  SYNC_MINUTES,
  assess,
  assessAll,
  needsAttention,
  type SyncRow,
} from "./heartbeat";

const NOW = new Date("2026-08-26T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

const row = (over: Partial<SyncRow> = {}): SyncRow => ({
  channel: "depop",
  last_sync_at: minutesAgo(10),
  found: 12,
  error: null,
  ...over,
});

describe("assess", () => {
  it("calls a recent sync fresh", () => {
    expect(assess(row(), NOW, "depop").state).toBe("fresh");
  });

  it("tolerates a single missed run", () => {
    // The alarm is every 30 minutes and a single miss is ordinary — the
    // machine slept, Chrome restarted. A warning that fires on ordinary
    // behaviour is one nobody reads by the second week.
    expect(assess(row({ last_sync_at: minutesAgo(SYNC_MINUTES + 5) }), NOW, "depop").state).toBe(
      "fresh"
    );
  });

  it("goes late after three missed runs and silent after twelve", () => {
    expect(assess(row({ last_sync_at: minutesAgo(LATE_AFTER) }), NOW, "depop").state).toBe("late");
    expect(assess(row({ last_sync_at: minutesAgo(SILENT_AFTER) }), NOW, "depop").state).toBe(
      "silent"
    );
  });

  it("reports an error even when the sync itself was recent", () => {
    // The trap: a node failing every half hour for six hours has a fresh
    // timestamp and is completely broken. Timestamp alone would call it fine.
    const health = assess(
      row({ last_sync_at: minutesAgo(2), error: "Depop's inbox didn't load." }),
      NOW,
      "depop"
    );
    expect(health.state).toBe("erroring");
    expect(health.detail).toContain("Depop's inbox didn't load.");
  });

  it("treats never-synced as silent and says what to do", () => {
    const health = assess(null, NOW, "depop");
    expect(health.state).toBe("silent");
    expect(health.minutesAgo).toBeNull();
    expect(health.detail).toMatch(/never synced/);
  });

  it("survives an unreadable timestamp instead of printing NaN", () => {
    const health = assess(row({ last_sync_at: "not a date" }), NOW, "depop");
    expect(health.state).toBe("silent");
    expect(health.detail).not.toMatch(/NaN/);
  });

  it("never reports a negative age when a clock runs ahead", () => {
    // The node's clock and the server's need not agree, and "-3 minutes ago"
    // reads as a bug rather than as clock skew.
    const health = assess(row({ last_sync_at: minutesAgo(-90) }), NOW, "depop");
    expect(health.minutesAgo).toBeGreaterThanOrEqual(0);
  });

  it("names the likely cause when a channel goes silent", () => {
    // An expired marketplace session is the most frequent real failure and it
    // needs a human, so the copy has to say so rather than just report a gap.
    const health = assess(row({ last_sync_at: minutesAgo(SILENT_AFTER + 60) }), NOW, "depop");
    expect(health.detail).toMatch(/session/i);
  });
});

describe("assessAll", () => {
  it("puts what needs a human first", () => {
    const health = assessAll(
      [
        row({ channel: "depop", last_sync_at: minutesAgo(5) }),
        row({ channel: "vinted", last_sync_at: minutesAgo(SILENT_AFTER + 10) }),
        row({ channel: "grailed", last_sync_at: minutesAgo(2), error: "Pairing code rejected." }),
        row({ channel: "mercari", last_sync_at: minutesAgo(LATE_AFTER + 5) }),
      ],
      NOW
    );
    expect(health.map((h) => h.state)).toEqual(["erroring", "silent", "late", "fresh"]);
  });

  it("says nothing about channels that have never reported", () => {
    // A seller who has never synced Grailed does not have a broken Grailed.
    // Eight "never synced" warnings is how a health panel becomes furniture.
    expect(assessAll([row({ channel: "depop" })], NOW)).toHaveLength(1);
  });

  it("is quiet when everything is fine", () => {
    const health = assessAll([row({ channel: "depop" }), row({ channel: "vinted" })], NOW);
    expect(needsAttention(health)).toBe(false);
  });

  it("raises its hand for a silence or an error, but not for merely late", () => {
    expect(needsAttention(assessAll([row({ last_sync_at: minutesAgo(LATE_AFTER) })], NOW))).toBe(
      false
    );
    expect(needsAttention(assessAll([row({ last_sync_at: minutesAgo(SILENT_AFTER) })], NOW))).toBe(
      true
    );
    expect(needsAttention(assessAll([row({ error: "boom" })], NOW))).toBe(true);
  });
});
