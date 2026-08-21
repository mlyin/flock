"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/fees";
import { canList, type Custody } from "@/lib/custody";
import ChannelIcon from "./ChannelIcon";

export type ChannelState = {
  channel: Channel;
  listingId: string | null;
  status: string | null;
  url: string | null;
};

/**
 * The six channel chips, made to do something.
 *
 * Live  → a link straight to the listing on that marketplace.
 * Draft → one click fills that marketplace's form.
 * Empty → dim, nothing drafted yet.
 *
 * The whole point is not having to open the item to act on it.
 */
export default function ChannelActions({
  states,
  custody = "hand",
  consignedTo = null,
}: {
  states: ChannelState[];
  custody?: Custody;
  consignedTo?: Channel | null;
}) {
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ channel: Channel; text: string; ok: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "threader-extension") return;
      if (data.type === "ready") check();

      if (data.type === "filled") {
        setBusy(null);
        const state = states.find((s) => s.listingId === data.listingId);
        if (!state) return;

        const problems = [...(data.missing ?? []), ...(data.blocked ?? [])];
        setNote({
          channel: state.channel,
          ok: Boolean(data.ok),
          text: data.error
            ? data.error
            : problems.length
              ? `Left for you: ${problems.slice(0, 4).join(", ")}.`
              : "Everything went in — review it there and publish.",
        });
        if (data.ok) router.refresh();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [states, router]);

  // A stuck fill used to leave the chip spinning forever with nothing to click.
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => {
      setBusy(null);
      setNote({
        channel: states.find((s) => s.listingId === busy)?.channel ?? "depop",
        ok: false,
        text: "No answer from the extension. Reload it at chrome://extensions and try again.",
      });
    }, 90000);
    return () => clearTimeout(timer);
  }, [busy, states]);

  const fill = (listingId: string) => {
    setNote(null);
    setBusy(listingId);
    window.postMessage({ source: "threader-page", type: "fill", listingId }, window.location.origin);
  };

  const byChannel = new Map(states.map((s) => [s.channel, s]));

  // Both labels are always in the DOM. CSS shows one, keyed off data-chanview
  // on <html>, so switching costs no re-render and screen readers still get the
  // full marketplace name either way.
  const label2 = (channel: Channel) => (
    <>
      <span className="mchip-abbr"><ChannelIcon channel={channel} /></span>
      <span className="mchip-full">{CHANNEL_LABEL[channel]}</span>
    </>
  );

  return (
    <>
      <div className="matrix">
        {CHANNELS.map((channel) => {
          const state = byChannel.get(channel);
          const label = CHANNEL_LABEL[channel];

          if (state?.status === "live" && state.url) {
            return (
              <a
                key={channel}
                className="mchip mchip-live"
                href={state.url}
                target="_blank"
                rel="noreferrer"
                title={`Open on ${label}`}
              >
                {label2(channel)}
              </a>
            );
          }

          if (state?.status === "live") {
            return (
              <span key={channel} className="mchip mchip-live" title={`Listed on ${label}`}>
                {label2(channel)}
              </span>
            );
          }

          // A consignor has the garment, so there is nothing to ship if this
          // sells. The database refuses the listing outright; this is so the
          // seller sees why instead of clicking a button that errors.
          const verdict = canList({ custody, consigned_to: consignedTo }, channel);
          if (!verdict.allowed) {
            return (
              <span key={channel} className="mchip mchip-blocked" title={verdict.reason}>
                {label2(channel)}
              </span>
            );
          }

          // Only a DRAFT can be filled. A sold or ended listing still carries a
          // listingId, so this offered a live "Fill" button for a garment that
          // is gone — filling it would recreate the listing that just sold.
          if (state?.listingId && state.status === "draft" && installed) {
            const isBusy = busy === state.listingId;
            return (
              <button
                key={channel}
                type="button"
                className={isBusy ? "mchip mchip-busy" : "mchip mchip-draft"}
                onClick={() => fill(state.listingId!)}
                disabled={Boolean(busy)}
                title={`Fill on ${label}`}
              >
                {isBusy ? "…" : label2(channel)}
              </button>
            );
          }

          return (
            <span
              key={channel}
              className={state?.listingId ? "mchip mchip-draft" : "mchip mchip-off"}
              title={state?.listingId ? `Drafted for ${label}` : `Nothing drafted for ${label}`}
            >
              {label2(channel)}
            </span>
          );
        })}
      </div>

      {note && (
        <div className={note.ok ? "chipnote chipnote-ok" : "chipnote chipnote-bad"}>
          <strong>{CHANNEL_LABEL[note.channel]}</strong> {note.text}
        </div>
      )}
    </>
  );
}
