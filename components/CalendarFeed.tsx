"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendarFeed, revokeCalendarFeed, type CalendarFeedRow } from "@/app/actions";
import { shortDate } from "@/lib/money";

/**
 * Subscribe a calendar to Flock's deadlines.
 *
 * A feed rather than a write into the seller's own calendar, so Flock never
 * holds a credential that could also delete their dentist appointment. It
 * lands as a separate calendar they can colour, hide or unsubscribe in one
 * action, and the same URL works on the Mac and the phone.
 */
export default function CalendarFeed({ feeds }: { feeds: CalendarFeedRow[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const create = () =>
    start(async () => {
      setError(null);
      const outcome = await createCalendarFeed();
      if (outcome.ok) setUrl(outcome.url);
      else setError(outcome.error);
      router.refresh();
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some contexts; the input is selectable anyway.
      setError("Couldn't copy — select the URL and copy it by hand.");
    }
  };

  return (
    <>
      <div className="notice">
        <strong>What this puts in your calendar</strong>
        <p>
          Only things with a date and a consequence: the dispatch deadline after a sale, when an
          offer lapses, and when a consignment window closes. Not a copy of your inventory —
          the dashboard is better at that.
        </p>
      </div>

      {url && (
        <div className="notice notice-good">
          <strong>Your feed URL — copy it now</strong>
          <p>
            This is shown once. Only a hash is stored, so it can&apos;t be shown again — if you
            lose it, revoke it and make another.
          </p>
          <label className="field">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              style={{ fontFamily: "var(--mono)", fontSize: 12 }}
            />
          </label>
          <div className="qrow-actions" style={{ marginTop: 8 }}>
            <button type="button" className="button button-sm" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            <strong>On a Mac:</strong> Calendar → File → New Calendar Subscription, paste,
            set Auto-refresh to Every hour.
            <br />
            <strong>On iPhone:</strong> Settings → Apps → Calendar → Calendar Accounts → Add
            Account → Other → Add Subscribed Calendar.
            <br />
            <strong>Google Calendar:</strong> Other calendars → From URL.
          </p>
        </div>
      )}

      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t do that</strong>
          <p>{error}</p>
        </div>
      )}

      {feeds.length > 0 && (
        <div className="qlist">
          {feeds.map((feed) => (
            <div key={feed.id} className="qrow">
              <div className="qrow-what">
                <strong>{feed.label ?? "Calendar"}</strong>
                <span className="qrow-meta">
                  made {shortDate(feed.created_at)}
                  {feed.last_used_at
                    ? ` · last fetched ${shortDate(feed.last_used_at)}`
                    : " · never fetched"}
                </span>
              </div>
              <button
                type="button"
                className="pill"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const outcome = await revokeCalendarFeed(feed.id);
                    if (!outcome.ok) setError(outcome.error ?? "Couldn't revoke it.");
                    setUrl(null);
                    router.refresh();
                  })
                }
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="qrow-actions" style={{ marginTop: 12 }}>
        <button type="button" className="button" disabled={pending} onClick={create}>
          {pending ? "Working…" : feeds.length > 0 ? "Make another URL" : "Create the feed URL"}
        </button>
        {feeds.length > 0 && (
          <span className="muted">
            Anyone with the URL can read these dates. Revoke and remake it if it gets out.
          </span>
        )}
      </div>
    </>
  );
}
