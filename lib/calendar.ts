import { CHANNEL_LABEL, type Channel } from "./fees";

/**
 * A subscribable calendar of the deadlines that cost money.
 *
 * Deliberately a FEED rather than a write into someone's calendar. A feed is a
 * URL that Calendar.app, Google Calendar and iOS all know how to subscribe to;
 * it lands as its own separate calendar the seller can colour, hide or delete
 * in one action; it refreshes itself; and it needs no OAuth, no Apple ID, and
 * no write access to a personal calendar. Writing events into someone's real
 * calendar means holding a credential that can also delete their dentist
 * appointment, to solve a problem a URL already solves.
 *
 * What belongs here is the narrow set of things with a DATE and a
 * CONSEQUENCE. The dashboard already shows what needs doing today; a calendar
 * earns its place only where being late costs something specific — a defect on
 * a marketplace account, a consignment fee, an offer that lapses.
 */

export type CalendarEvent = {
  /**
   * Stable across regenerations. This is the whole ballgame: a feed is
   * re-fetched every hour, and a UID that changes between fetches makes the
   * client treat each one as a NEW event. That produces a calendar which
   * silently accumulates a duplicate of everything, every refresh, forever.
   */
  uid: string;
  title: string;
  description: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  /** Minutes before `start` to alarm. Null for no alarm. */
  remindMinutesBefore: number | null;
  url?: string;
};

/**
 * How long a seller has to dispatch after a sale, per channel.
 *
 * Same discipline as lib/fees.ts, and for the same reason: a wrong number here
 * puts a deadline in someone's calendar that isn't real, and they either panic
 * or — worse — relax. `verifiedOn` shames the next person into rechecking, and
 * `days: null` means "this channel publishes no number", which is a different
 * and more honest state than a guess.
 *
 * `businessDays` matters more than it looks: three business days from a Friday
 * sale is Wednesday, not Monday.
 */
export type DispatchRule = {
  days: number | null;
  businessDays: boolean;
  verifiedOn: string;
  note: string;
};

export const DISPATCH: Record<Channel, DispatchRule> = {
  ebay: {
    days: null,
    businessDays: true,
    verifiedOn: "unverified",
    note: "Set per listing by the seller's own handling time, so there is no single number.",
  },
  poshmark: { days: null, businessDays: false, verifiedOn: "unverified", note: "" },
  depop: { days: null, businessDays: false, verifiedOn: "unverified", note: "" },
  mercari: { days: null, businessDays: true, verifiedOn: "unverified", note: "" },
  vinted: { days: null, businessDays: true, verifiedOn: "unverified", note: "" },
  grailed: { days: null, businessDays: false, verifiedOn: "unverified", note: "" },
  facebook: { days: null, businessDays: false, verifiedOn: "unverified", note: "" },
  stockx: { days: null, businessDays: true, verifiedOn: "unverified", note: "" },
  vestiaire: { days: null, businessDays: false, verifiedOn: "unverified", note: "" },
  therealreal: {
    days: null,
    businessDays: false,
    verifiedOn: "unverified",
    note: "Consignment — they hold the garment, so there is nothing to dispatch per sale.",
  },
};

/** Channels whose dispatch deadline nobody has checked against the marketplace. */
export const unverifiedDispatch = (): Channel[] =>
  (Object.keys(DISPATCH) as Channel[]).filter((c) => DISPATCH[c].verifiedOn === "unverified");

const DAY = 86_400_000;

/** Add N days, skipping weekends when the rule counts business days. */
export function addDays(from: Date, days: number, businessDays: boolean): Date {
  const out = new Date(from.getTime());
  if (!businessDays) {
    out.setTime(out.getTime() + days * DAY);
    return out;
  }
  let remaining = days;
  while (remaining > 0) {
    out.setTime(out.getTime() + DAY);
    const weekday = out.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return out;
}

/* --------------------------------------------------------------------------
   ICS serialisation.

   RFC 5545 is fussy in three specific ways, and getting any of them wrong
   produces a file that imports as EMPTY rather than one that reports an error.
   -------------------------------------------------------------------------- */

/** Escape the characters RFC 5545 reserves inside a text value. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold to 75 octets, continuing lines with a leading space.
 *
 * Octets, not characters — folding by character count splits a multi-byte
 * character across the fold and the client renders a replacement glyph.
 * Garment titles carry "€", "—" and the occasional emoji often enough for this
 * to matter.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // The first line gets 75; continuations get 74, leaving room for the space.
    let take = Math.min(start === 0 ? 75 : 74, bytes.length - start);
    // Never split inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (take > 1 && start + take < bytes.length && (bytes[start + take] & 0xc0) === 0x80) {
      take -= 1;
    }
    parts.push(bytes.subarray(start, start + take).toString("utf8"));
    start += take;
  }
  return parts.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");

const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const dateStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/**
 * Render a whole feed.
 *
 * `generatedAt` is passed in rather than read from the clock, so the output is
 * a pure function of its inputs and can be tested.
 */
export function toIcs(
  events: CalendarEvent[],
  opts: { name: string; description: string; generatedAt: Date }
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flock//Resale deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // X-WR-CALNAME is not in the RFC, but every client honours it, and it is
    // what makes this land as a NAMED separate calendar rather than "Untitled".
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `X-WR-CALDESC:${escapeText(opts.description)}`,
    // How often clients should re-poll. Both spellings, because support differs.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${utcStamp(opts.generatedAt)}`);

    if (event.allDay) {
      // An all-day DTEND is EXCLUSIVE, so a one-day event ends the following
      // day. Omitting that renders a zero-length event, which some clients
      // hide entirely.
      const end = event.end ?? new Date(event.start.getTime() + DAY);
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateStamp(end)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(event.start)}`);
      lines.push(`DTEND:${utcStamp(event.end ?? new Date(event.start.getTime() + 30 * 60_000))}`);
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${escapeText(event.url)}`);

    if (event.remindMinutesBefore !== null) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeText(event.title)}`);
      lines.push(`TRIGGER:-PT${event.remindMinutesBefore}M`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // CRLF is required by the spec, not a preference.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* --------------------------------------------------------------------------
   Turning Flock's rows into events.
   -------------------------------------------------------------------------- */

export type DeadlineInput = {
  sales: Array<{
    id: string;
    soldAt: string;
    channel: Channel;
    itemId: string;
    title: string;
    sku: string;
  }>;
  offers: Array<{
    id: string;
    expiresAt: string;
    channel: Channel;
    amount: number;
    itemTitle: string | null;
  }>;
  consignments: Array<{
    itemId: string;
    consignedAt: string;
    channel: Channel;
    title: string;
    sku: string;
  }>;
};

/** The RealReal's consignment period, from their consignor terms. */
export const CONSIGNMENT_DAYS = 365;

export function buildEvents(input: DeadlineInput, origin: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const sale of input.sales) {
    const rule = DISPATCH[sale.channel];
    // No published number means no deadline we can honestly put in a calendar.
    // A guessed dispatch date is worse than none: the seller either panics on a
    // date that isn't real, or relaxes into one later than the truth.
    if (rule.days === null) continue;

    const soldAt = new Date(sale.soldAt);
    if (Number.isNaN(soldAt.getTime())) continue;

    events.push({
      uid: `sale-dispatch-${sale.id}@sellonflock.com`,
      title: `Post ${sale.sku} — ${CHANNEL_LABEL[sale.channel]}`,
      description:
        `${sale.title}\n\nSold on ${CHANNEL_LABEL[sale.channel]}. ` +
        `${rule.days} ${rule.businessDays ? "business " : ""}day${rule.days === 1 ? "" : "s"} to dispatch.` +
        (rule.note ? `\n\n${rule.note}` : ""),
      start: addDays(soldAt, rule.days, rule.businessDays),
      allDay: true,
      // The day before, not the morning of — a parcel you first hear about on
      // the deadline is already late by the time the post office opens.
      remindMinutesBefore: 60 * 24,
      url: `${origin}/items/${sale.itemId}`,
    });
  }

  for (const offer of input.offers) {
    const expires = new Date(offer.expiresAt);
    if (Number.isNaN(expires.getTime())) continue;

    events.push({
      uid: `offer-expiry-${offer.id}@sellonflock.com`,
      title: `Offer lapses — $${offer.amount.toFixed(2)} on ${CHANNEL_LABEL[offer.channel]}`,
      description: offer.itemTitle ?? "Open the Inbox to answer it.",
      start: expires,
      allDay: false,
      remindMinutesBefore: 120,
      url: `${origin}/inbox`,
    });
  }

  for (const consignment of input.consignments) {
    const from = new Date(consignment.consignedAt);
    if (Number.isNaN(from.getTime())) continue;

    events.push({
      uid: `consignment-end-${consignment.itemId}@sellonflock.com`,
      title: `Consignment ends — ${consignment.sku}`,
      description:
        `${consignment.title}\n\nWith ${CHANNEL_LABEL[consignment.channel]} since ` +
        `${from.toISOString().slice(0, 10)}. After this they return it at their own cost; ` +
        `pulling it back before then carries a per-item fee.`,
      start: addDays(from, CONSIGNMENT_DAYS, false),
      allDay: true,
      // A week's warning. Deciding whether to let something run costs nothing
      // on the day, and everything once the date has passed.
      remindMinutesBefore: 60 * 24 * 7,
      url: `${origin}/items/${consignment.itemId}`,
    });
  }

  return events;
}
