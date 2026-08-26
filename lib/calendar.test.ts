import { describe, expect, it } from "vitest";
import { CHANNELS } from "./fees";
import {
  DISPATCH,
  addDays,
  buildEvents,
  toIcs,
  unverifiedDispatch,
  type CalendarEvent,
} from "./calendar";

const AT = new Date("2026-08-21T12:00:00Z");

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  uid: "test-1@sellonflock.com",
  title: "Post FLK-0142",
  description: "A jacket",
  start: new Date("2026-08-25T00:00:00Z"),
  allDay: true,
  remindMinutesBefore: null,
  ...over,
});

describe("toIcs", () => {
  it("produces a calendar a client will actually parse", () => {
    const ics = toIcs([event()], { name: "Flock", description: "Deadlines", generatedAt: AT });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
  });

  it("uses CRLF everywhere, which the spec requires", () => {
    const ics = toIcs([event()], { name: "Flock", description: "d", generatedAt: AT });
    // A lone \n anywhere makes strict parsers reject the whole file, and the
    // symptom is an empty calendar rather than an error.
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it("names the calendar, so it lands as its own rather than 'Untitled'", () => {
    const ics = toIcs([], { name: "Flock deadlines", description: "d", generatedAt: AT });
    expect(ics).toContain("X-WR-CALNAME:Flock deadlines");
  });

  it("escapes the characters that would otherwise end a field early", () => {
    const ics = toIcs(
      [event({ title: "Jacket; navy, large", description: "Line one\nLine two" })],
      { name: "Flock", description: "d", generatedAt: AT }
    );
    expect(ics).toContain("SUMMARY:Jacket\\; navy\\, large");
    expect(ics).toContain("Line one\\nLine two");
  });

  it("gives an all-day event an exclusive end date", () => {
    // A one-day event has to end the NEXT day. Without that it renders
    // zero-length and some clients hide it entirely.
    const ics = toIcs([event({ start: new Date("2026-08-25T00:00:00Z") })], {
      name: "Flock",
      description: "d",
      generatedAt: AT,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260825");
    expect(ics).toContain("DTEND;VALUE=DATE:20260826");
  });

  it("folds long lines without splitting a character in half", () => {
    // Folding by character count instead of octets breaks multi-byte
    // characters across the fold and the client shows a replacement glyph.
    const title = "Maison Margiela — " + "é".repeat(60);
    const ics = toIcs([event({ title })], { name: "Flock", description: "d", generatedAt: AT });

    for (const line of ics.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    // And it must still say what it meant once unfolded.
    expect(ics.split("\r\n ").join("")).toContain(title);
  });

  it("writes an alarm only when one was asked for", () => {
    const without = toIcs([event()], { name: "F", description: "d", generatedAt: AT });
    expect(without).not.toContain("BEGIN:VALARM");

    const withAlarm = toIcs([event({ remindMinutesBefore: 1440 })], {
      name: "F",
      description: "d",
      generatedAt: AT,
    });
    expect(withAlarm).toContain("TRIGGER:-PT1440M");
  });

  it("is a pure function of its inputs", () => {
    const a = toIcs([event()], { name: "F", description: "d", generatedAt: AT });
    const b = toIcs([event()], { name: "F", description: "d", generatedAt: AT });
    expect(a).toBe(b);
  });
});

describe("addDays", () => {
  it("counts calendar days straight through a weekend", () => {
    // Friday 21 Aug 2026 + 3 calendar days = Monday 24th.
    expect(addDays(new Date("2026-08-21T00:00:00Z"), 3, false).toISOString().slice(0, 10)).toBe(
      "2026-08-24"
    );
  });

  it("skips weekends when the rule counts business days", () => {
    // Friday + 3 business days = Wednesday, not Monday. Getting this wrong
    // puts a dispatch deadline two days earlier than the marketplace's.
    expect(addDays(new Date("2026-08-21T00:00:00Z"), 3, true).toISOString().slice(0, 10)).toBe(
      "2026-08-26"
    );
  });

  it("never lands a business-day deadline on a weekend", () => {
    for (let start = 0; start < 14; start++) {
      for (let days = 1; days <= 10; days++) {
        const from = new Date(Date.UTC(2026, 7, 1 + start));
        const due = addDays(from, days, true);
        expect([0, 6]).not.toContain(due.getUTCDay());
      }
    }
  });
});

describe("buildEvents", () => {
  const origin = "https://www.sellonflock.com";

  const sale = {
    id: "s1",
    soldAt: "2026-08-21T10:00:00Z",
    channel: "depop" as const,
    itemId: "i1",
    title: "Patagonia fleece",
    sku: "FLK-0142",
  };

  it("says nothing about dispatch for a channel with no published deadline", () => {
    // Every DISPATCH entry is `days: null` until somebody verifies it against
    // the marketplace's own page. A guessed date is worse than none: the
    // seller either panics on a date that isn't real or relaxes into one later
    // than the truth.
    const events = buildEvents({ sales: [sale], offers: [], consignments: [] }, origin);
    expect(events).toEqual([]);
  });

  it("emits a dispatch deadline once a channel is verified", () => {
    const original = { ...DISPATCH.depop };
    try {
      Object.assign(DISPATCH.depop, { days: 5, businessDays: false, verifiedOn: "2026-08-21" });
      const events = buildEvents({ sales: [sale], offers: [], consignments: [] }, origin);
      expect(events).toHaveLength(1);
      expect(events[0].start.toISOString().slice(0, 10)).toBe("2026-08-26");
      expect(events[0].uid).toBe("sale-dispatch-s1@sellonflock.com");
    } finally {
      Object.assign(DISPATCH.depop, original);
    }
  });

  it("gives every event a UID that survives regeneration", () => {
    // The classic ICS bug: a UID derived from anything that changes between
    // fetches makes the client add a duplicate on every refresh, forever.
    const input = {
      sales: [],
      offers: [
        {
          id: "o1",
          expiresAt: "2026-08-23T09:00:00Z",
          channel: "grailed" as const,
          amount: 612,
          itemTitle: "A coat",
        },
      ],
      consignments: [
        {
          itemId: "i9",
          consignedAt: "2026-01-02T00:00:00Z",
          channel: "therealreal" as const,
          title: "A bag",
          sku: "FLK-0009",
        },
      ],
    };

    const first = buildEvents(input, origin).map((e) => e.uid);
    const second = buildEvents(input, origin).map((e) => e.uid);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("drops a row with an unparseable date rather than emitting Invalid Date", () => {
    const events = buildEvents(
      {
        sales: [],
        offers: [
          { id: "o2", expiresAt: "not a date", channel: "depop", amount: 20, itemTitle: null },
        ],
        consignments: [],
      },
      origin
    );
    expect(events).toEqual([]);
  });

  it("dates the consignment end a year out", () => {
    const events = buildEvents(
      {
        sales: [],
        offers: [],
        consignments: [
          {
            itemId: "i9",
            consignedAt: "2026-01-02T00:00:00Z",
            channel: "therealreal",
            title: "A bag",
            sku: "FLK-0009",
          },
        ],
      },
      origin
    );
    expect(events).toHaveLength(1);
    expect(events[0].start.toISOString().slice(0, 10)).toBe("2027-01-02");
  });
});

describe("dispatch table hygiene", () => {
  it("covers every channel", () => {
    for (const channel of CHANNELS) {
      expect(DISPATCH[channel], channel).toBeDefined();
    }
  });

  it("carries a verification date or an honest 'unverified'", () => {
    for (const channel of CHANNELS) {
      const v = DISPATCH[channel].verifiedOn;
      expect(v === "unverified" || /^\d{4}-\d{2}-\d{2}$/.test(v), `${channel}: "${v}"`).toBe(true);
    }
  });

  it("never carries a day count on an unverified channel", () => {
    // The pairing that must not happen: a number nobody checked, presented to
    // a seller as a deadline.
    for (const channel of unverifiedDispatch()) {
      expect(DISPATCH[channel].days, channel).toBeNull();
    }
  });
});
