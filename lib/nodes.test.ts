/**
 * Exists to catch the one lie a job queue can tell: calling a filled form a
 * published listing. A seller who reads "live on Facebook" on the dashboard
 * stops checking Facebook; if that line was really "the first screen is
 * filled", the garment is not for sale anywhere and the seller does not know.
 * Every case below pins a boundary in classifyOutcome, jobAutoSubmit and the
 * retry rule, sweeping every channel rather than the two or three that
 * happened to come to mind.
 */
import { describe, expect, it } from "vitest";
import { CHANNELS, FILLABLE, type Channel } from "./fees";
import {
  AUTO_SUBMIT_CHANNELS,
  HUMAN_PUBLISH_CHANNELS,
  MAX_ATTEMPTS,
  NODE_LATE_AFTER,
  NODE_SILENT_AFTER,
  RUNNING_STALE_MINUTES,
  canCancel,
  canRetry,
  classifyOutcome,
  describeJob,
  eligibleForQueue,
  isStaleRunning,
  jobAutoSubmit,
  nodeLiveness,
  submitWasPressed,
} from "./nodes";

const clean = (channel: Channel, over: Partial<Parameters<typeof classifyOutcome>[0]> = {}) => ({
  channel,
  ok: true,
  filled: ["title", "price", "photos"],
  missing: [],
  blocked: [],
  autoSubmit: false,
  ...over,
});

describe("jobAutoSubmit", () => {
  it("never lets a node setting reach Facebook or Mercari", () => {
    for (const channel of HUMAN_PUBLISH_CHANNELS) {
      expect(jobAutoSubmit(true, channel)).toBe(false);
    }
  });

  it("applies only to the three channels whose fillers press submit", () => {
    for (const channel of CHANNELS) {
      expect(jobAutoSubmit(true, channel)).toBe(AUTO_SUBMIT_CHANNELS.includes(channel));
      expect(jobAutoSubmit(false, channel)).toBe(false);
    }
  });

  it("keeps the two lists disjoint, because a channel on both would be a contradiction", () => {
    for (const channel of HUMAN_PUBLISH_CHANNELS) {
      expect(AUTO_SUBMIT_CHANNELS).not.toContain(channel);
    }
  });
});

describe("classifyOutcome", () => {
  it("is published only on the marketplace's word, on every channel", () => {
    for (const channel of CHANNELS) {
      expect(
        classifyOutcome(clean(channel, { publishedUrl: "https://www.depop.com/products/x/" }))
      ).toBe("published");
    }
  });

  it("never calls a clean fill published without a listing URL", () => {
    for (const channel of CHANNELS) {
      for (const autoSubmit of [true, false]) {
        const verdict = classifyOutcome(
          clean(channel, { autoSubmit, filled: ["title", "price", "clicked Post"] })
        );
        expect(verdict, `${channel} autoSubmit=${autoSubmit}`).not.toBe("published");
      }
    }
  });

  it("holds Facebook and Mercari at needs_seller however clean the fill", () => {
    for (const channel of HUMAN_PUBLISH_CHANNELS) {
      expect(
        classifyOutcome(clean(channel, { autoSubmit: true, filled: ["title", "clicked Publish"] }))
      ).toBe("needs_seller");
    }
  });

  it("calls a crash failed before anything else", () => {
    expect(classifyOutcome({ channel: "depop", ok: false, error: "boom", autoSubmit: true })).toBe(
      "failed"
    );
  });

  it("is filled only when the filler itself recorded pressing submit", () => {
    // Auto-submit on is a setting; "clicked Post" is evidence. Depop with the
    // setting on but no photos does not press and says so in `missing`.
    expect(classifyOutcome(clean("depop", { autoSubmit: true }))).toBe("needs_seller");
    expect(
      classifyOutcome(clean("depop", { autoSubmit: true, filled: ["title", "clicked Post"] }))
    ).toBe("filled");
    expect(
      classifyOutcome(clean("vinted", { autoSubmit: true, filled: ["clicked Publish"] }))
    ).toBe("filled");
  });

  it("treats a blocked field as a form a person must finish, even after a press", () => {
    expect(
      classifyOutcome(
        clean("depop", { autoSubmit: true, filled: ["clicked Post"], blocked: ["Category is required"] })
      )
    ).toBe("needs_seller");
  });

  it("reads a perfect fill with auto-submit off as waiting for the seller", () => {
    expect(
      classifyOutcome(clean("grailed", { missing: ["auto-submit off — tick it in the popup"] }))
    ).toBe("needs_seller");
  });
});

describe("submitWasPressed", () => {
  // Real fixtures: the exact strings the fillers push, read from
  // extension/fill-depop.js (`clicked ${label}`), fill-vinted.js:617 and
  // fill-grailed.js:507 on 16 Sep 2026. If a filler's wording changes, this
  // test is what says so before a real submit is misread as a handoff.
  it("recognises Depop's clicked-button lines", () => {
    expect(submitWasPressed(["title", "clicked Post"])).toBe(true);
    expect(submitWasPressed(["clicked Publish"])).toBe(true);
    expect(submitWasPressed(["clicked List it"])).toBe(true);
  });

  it("recognises Vinted's and Grailed's submitting line", () => {
    expect(submitWasPressed(["photos (4)", "submitting — the tab will land on the listing"])).toBe(true);
  });

  it("does not count a step button or a bare word", () => {
    expect(submitWasPressed(["clicked Continue"])).toBe(false);
    expect(submitWasPressed(["clicked Next"])).toBe(false);
    expect(submitWasPressed(["post"])).toBe(false);
    expect(submitWasPressed(["not submitted — no photos attached"])).toBe(false);
    expect(submitWasPressed(undefined)).toBe(false);
  });

  it("classifies a Vinted or Grailed auto-submit as filled, not as waiting for the seller", () => {
    for (const channel of ["vinted", "grailed"] as const) {
      expect(
        classifyOutcome(
          clean(channel, { autoSubmit: true, filled: ["title", "submitting — the tab will land on the listing"] })
        )
      ).toBe("filled");
    }
  });
});

describe("eligibleForQueue", () => {
  it("queues only drafts on channels with a filler", () => {
    for (const channel of CHANNELS) {
      expect(eligibleForQueue({ status: "draft", channel })).toBe(FILLABLE.includes(channel));
      for (const status of ["live", "sold", "ended", "error"]) {
        expect(eligibleForQueue({ status, channel })).toBe(false);
      }
    }
  });
});

describe("canRetry and canCancel", () => {
  const NOW = new Date("2026-09-16T12:00:00Z");
  const ago = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

  it("lets the seller retry a failure or a handoff, up to the cap, and nothing else", () => {
    expect(canRetry({ status: "failed", attempts: 1 }, NOW)).toBe(true);
    expect(canRetry({ status: "needs_seller", attempts: 2 }, NOW)).toBe(true);
    expect(canRetry({ status: "failed", attempts: MAX_ATTEMPTS }, NOW)).toBe(false);
    expect(canRetry({ status: "published", attempts: 0 }, NOW)).toBe(false);
    expect(canRetry({ status: "queued", attempts: 0 }, NOW)).toBe(false);
    expect(canRetry({ status: "filled", attempts: 0 }, NOW)).toBe(false);
  });

  it("treats a running job as retryable only once its node has gone quiet", () => {
    // A worker killed mid-fill, or a report that never arrived, must not
    // pin the listing behind the unique index forever; a run that started a
    // minute ago must not be doubled.
    expect(canRetry({ status: "running", attempts: 1, claimedAt: ago(1) }, NOW)).toBe(false);
    expect(canRetry({ status: "running", attempts: 1, claimedAt: ago(RUNNING_STALE_MINUTES) }, NOW)).toBe(true);
    expect(canRetry({ status: "running", attempts: MAX_ATTEMPTS, claimedAt: ago(60) }, NOW)).toBe(false);
    expect(isStaleRunning({ status: "running", claimedAt: null }, NOW)).toBe(false);
    expect(isStaleRunning({ status: "queued", claimedAt: ago(60) }, NOW)).toBe(false);
  });

  it("lets the seller cancel anything except a run in flight or a finished job", () => {
    expect(canCancel({ status: "queued" }, NOW)).toBe(true);
    expect(canCancel({ status: "filled" }, NOW)).toBe(true);
    expect(canCancel({ status: "needs_seller" }, NOW)).toBe(true);
    expect(canCancel({ status: "failed" }, NOW)).toBe(true);
    expect(canCancel({ status: "running", claimedAt: ago(1) }, NOW)).toBe(false);
    expect(canCancel({ status: "running", claimedAt: ago(RUNNING_STALE_MINUTES) }, NOW)).toBe(true);
    expect(canCancel({ status: "published" }, NOW)).toBe(false);
    expect(canCancel({ status: "cancelled" }, NOW)).toBe(false);
  });
});

describe("describeJob", () => {
  it("uses the word live for published and for nothing else", () => {
    const statuses = ["queued", "running", "filled", "needs_seller", "failed", "cancelled"] as const;
    for (const status of statuses) {
      for (const runningStale of [false, true]) {
        const text = describeJob(status, "Facebook", { filledMinutesAgo: 2, runningStale });
        expect(text).not.toMatch(/\blive\b/i);
        expect(text).not.toMatch(/published/i);
      }
    }
    expect(describeJob("published", "Facebook")).toMatch(/live/i);
  });

  it("drops the popup hint from the list a node seller is shown", () => {
    const text = describeJob("needs_seller", "Grailed", {
      missing: ["auto-submit off — tick it in the popup", "designer (type it)"],
    });
    expect(text).toContain("designer");
    expect(text).not.toContain("popup");
  });
});

describe("nodeLiveness", () => {
  const NOW = new Date("2026-09-16T12:00:00Z");
  const ago = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

  it("tolerates a few missed polls, then goes late, then silent", () => {
    expect(nodeLiveness(ago(1), NOW).state).toBe("fresh");
    expect(nodeLiveness(ago(NODE_LATE_AFTER - 1), NOW).state).toBe("fresh");
    expect(nodeLiveness(ago(NODE_LATE_AFTER), NOW).state).toBe("late");
    expect(nodeLiveness(ago(NODE_SILENT_AFTER), NOW).state).toBe("silent");
  });

  it("says never rather than inventing a gap for a node that has not polled", () => {
    expect(nodeLiveness(null, NOW).state).toBe("never");
    expect(nodeLiveness("not a date", NOW).state).toBe("never");
  });

  it("reads as a sentence at every age", () => {
    for (const n of [0, 1, 2, 30, NODE_LATE_AFTER, NODE_SILENT_AFTER, 600, 5000]) {
      const text = nodeLiveness(ago(n), NOW).detail;
      expect(text).not.toMatch(/just now ago/);
      expect(text).toMatch(/\.$/);
    }
  });
});
