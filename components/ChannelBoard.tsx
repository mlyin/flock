"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CHANNELS, CHANNEL_ACCESS, CHANNEL_LABEL, canFill, stockxSearchUrl, type Channel } from "@/lib/fees";
import ChannelIcon from "./ChannelIcon";
import { usd } from "@/lib/money";
import { markListedWithUrl, saveListingUrl, unmarkListed } from "@/app/actions";

export type ChannelRow = {
  channel: Channel;
  listingId: string | null;
  status: string | null;
  url: string | null;
  price: number | null;
  net: number | null;
};

/**
 * One row per channel, with the marketplace named rather than abbreviated.
 *
 * This replaces six two-letter chips on the item page. The chips are fine for
 * scanning a table; on the item itself the questions are "where is this live",
 * "what's the link", and "how do I get it onto eBay" — none of which "EB" answers.
 *
 * It also closes the hole that left items stuck at draft: the extension fills a
 * form and stops, the seller publishes on the marketplace, and until now nothing
 * came back to say so.
 */
export default function ChannelBoard({
  item,
  rows,
  catalog,
}: {
  item: string;
  rows: ChannelRow[];
  /** Just enough of the garment to look it up in StockX's catalog. */
  catalog?: { style_code?: string | null; brand?: string | null; title?: string | null };
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
        const row = rows.find((r) => r.listingId === data.listingId);
        if (!row) return;

        const problems = [...(data.missing ?? []), ...(data.blocked ?? [])];
        setNote({
          channel: row.channel,
          ok: Boolean(data.ok),
          text: data.error
            ? data.error
            : problems.length
              ? `Left for you: ${problems.slice(0, 4).join(", ")}.`
              : "Everything went in — review it there and hit publish.",
        });
        // No prompt here any more: background.js watches this tab and records
        // the URL itself as soon as the marketplace navigates to the listing.
        router.refresh();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [rows, router]);

  const fill = (listingId: string) => {
    setNote(null);
    setBusy(listingId);
    window.postMessage({ source: "threader-page", type: "fill", listingId }, window.location.origin);
  };

  const byChannel = new Map(rows.map((r) => [r.channel, r]));

  return (
    <div className="board">
      {CHANNELS.map((channel) => {
        const row = byChannel.get(channel);
        const live = row?.status === "live";
        const drafted = Boolean(row?.listingId);
        const isBusy = busy && busy === row?.listingId;

        return (
          <div key={channel} className={`boardrow ${live ? "boardrow-live" : ""}`}>
            <div className="boardrow-id">
              <span className={`chanmark chanmark-${channel}`} aria-hidden />
              <div>
                <span className="boardrow-name">
                  <ChannelIcon channel={channel} />{" "}
                  {CHANNEL_LABEL[channel]}
                </span>
                <span className="boardrow-sub">
                  {live
                    ? "live"
                    : drafted
                      ? "drafted, not posted"
                      : CHANNEL_ACCESS[channel] === "api"
                        ? "no draft yet"
                        : "no draft yet"}
                </span>
              </div>
            </div>

            <div className="boardrow-money">
              {row?.price != null && (
                <>
                  <span className="boardrow-price">{usd(row.price)}</span>
                  {row.net != null && <span className="boardrow-net">nets {usd(row.net)}</span>}
                </>
              )}
            </div>

            <div className="boardrow-act">
              {live && row?.url && (
                <a className="button button-sm" href={row.url} target="_blank" rel="noreferrer">
                  View listing →
                </a>
              )}

              {live && !row?.url && row?.listingId && (
                <UrlBox listingId={row.listingId} mode="save" label="Add the link" />
              )}

              {/* StockX is neither fillable nor manual — it's catalog-matched.
                  There's nothing to fill because there's nothing to write: the
                  listing is (product, size, ask), and the product has to be
                  found in their catalog first. So the useful button is the
                  search, and the seller confirms the match. A "Fill" here would
                  be a button whose only outcome is an error, which is the
                  mistake The RealReal already taught us. */}
              {!live && channel === "stockx" && catalog && stockxSearchUrl(catalog) && (
                <a
                  className="button button-sm button-quiet"
                  href={stockxSearchUrl(catalog)!}
                  target="_blank"
                  rel="noreferrer"
                  title={
                    catalog.style_code
                      ? `Search StockX for style code ${catalog.style_code}`
                      : "No style code on this garment, so this searches the brand and title — expect a lot of results"
                  }
                >
                  Find on StockX →
                </a>
              )}

              {!live && drafted && channel !== "stockx" && (
                <>
                  {/* A manual channel has no form to fill — The RealReal takes
                      the item in by hand and lists it itself. Offering "Fill"
                      there would be a button whose only outcome is an error. */}
                  {CHANNEL_ACCESS[channel] === "manual" ? (
                    <Link href={`/post/${row!.listingId}`} className="button button-sm button-quiet">
                      Intake copy
                    </Link>
                  ) : installed && canFill(channel) ? (
                    <button
                      type="button"
                      className="button button-sm"
                      onClick={() => fill(row!.listingId!)}
                      disabled={Boolean(busy)}
                    >
                      {isBusy ? "Filling…" : `Fill on ${CHANNEL_LABEL[channel]}`}
                    </button>
                  ) : (
                    <Link href={`/post/${row!.listingId}`} className="button button-sm button-quiet">
                      Post step by step
                    </Link>
                  )}
                  {/* Fallback only. The extension watches the tab it filled and
                      records the URL the moment the marketplace navigates to the
                      new listing, so this is for the cases it can't see: a
                      listing published from another tab, another device, or
                      before the watcher was added. */}
                  <UrlBox
                    listingId={row!.listingId!}
                    mode="publish"
                    label="Mark live by hand"
                    subtle
                  />
                </>
              )}

              {live && row?.listingId && <EndedButton listingId={row.listingId} />}
            </div>

            {note?.channel === channel && (
              <div className={note.ok ? "chipnote chipnote-ok" : "chipnote chipnote-bad"}>
                {note.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Paste the URL the listing ended up at, and optionally flip it to live. */
function UrlBox({
  listingId,
  mode,
  label,
  open: initiallyOpen,
  subtle,
}: {
  listingId: string;
  mode: "publish" | "save";
  label: string;
  open?: boolean;
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);

  if (!open) {
    return (
      <button
        type="button"
        className={subtle ? "linkish" : "button button-sm button-quiet"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  const submit = () =>
    start(async () => {
      setError(null);
      const result =
        mode === "publish"
          ? await markListedWithUrl(listingId, url)
          : await saveListingUrl(listingId, url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="urlbox">
      <input
        className="field"
        placeholder="Paste the listing link (optional)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button type="button" className="button button-sm" disabled={pending} onClick={submit}>
        {pending ? "Saving…" : mode === "publish" ? "Mark live" : "Save"}
      </button>
      <button type="button" className="button button-sm button-quiet" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="offercard-error">{error}</p>}
    </div>
  );
}

function EndedButton({ listingId }: { listingId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="button button-sm button-quiet"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await unmarkListed(listingId);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Ended"}
    </button>
  );
}
