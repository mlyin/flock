"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, CHANNEL_ABBR, CHANNEL_LABEL, type Channel } from "@/lib/fees";

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
export default function ChannelActions({ states }: { states: ChannelState[] }) {
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

  return (
    <>
      <div className="matrix">
        {CHANNELS.map((channel) => {
          const state = byChannel.get(channel);
          const abbr = CHANNEL_ABBR[channel];
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
                {abbr}
              </a>
            );
          }

          if (state?.status === "live") {
            return (
              <span key={channel} className="mchip mchip-live" title={`Listed on ${label}`}>
                {abbr}
              </span>
            );
          }

          if (state?.listingId && installed) {
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
                {isBusy ? "…" : abbr}
              </button>
            );
          }

          return (
            <span
              key={channel}
              className={state?.listingId ? "mchip mchip-draft" : "mchip mchip-off"}
              title={state?.listingId ? `Drafted for ${label}` : `Nothing drafted for ${label}`}
            >
              {abbr}
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
