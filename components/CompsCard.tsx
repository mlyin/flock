"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usd } from "@/lib/money";
import { MIN_COMPS, type CompStats } from "@/lib/comps";
import { priceFromMarket, saveComps } from "@/app/actions";

export type StoredComps = CompStats & { query?: string; reportedTotal?: string | null };

/**
 * What this garment actually sells for.
 *
 * The number beside it on this page is a language model's opinion — the prompt
 * that produces it says as much. This one is completed eBay sales: what buyers
 * paid, not what sellers asked. A seller should be able to tell those two
 * apart at a glance, which is why this card says where its number came from
 * and the other one says it is a guess.
 *
 * The read runs in the extension. eBay's search page is public, so no session
 * is involved, but a request from a datacentre gets a challenge page and a
 * request from a person's browser does not.
 */
export default function CompsCard({
  itemId,
  narrowUrl,
  broadUrl,
  query,
  stored,
  storedAt,
}: {
  itemId: string;
  narrowUrl: string | null;
  broadUrl: string | null;
  query: string | null;
  stored: StoredComps | null;
  storedAt: string | null;
}) {
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data;
      if (d?.source !== "threader-extension") return;
      if (d.type === "ready") check();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** Ask the extension to read one search, and wait for its answer. */
  const read = (url: string) =>
    new Promise<{ prices: number[]; reportedTotal: string | null; error: string | null }>(
      (resolve) => {
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const d = event.data;
          if (d?.source !== "threader-extension" || d.type !== "comps-read") return;
          window.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve({
            prices: (d.comps ?? []).map((c: { price: number }) => c.price),
            reportedTotal: d.reportedTotal ?? null,
            error: d.ok ? null : (d.error ?? "The read didn't complete."),
          });
        };

        // eBay is occasionally slow and a tab that never loads would otherwise
        // leave this spinning with nothing to click.
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve({ prices: [], reportedTotal: null, error: "eBay didn't answer in time." });
        }, 45000);

        window.addEventListener("message", onMessage);
        window.postMessage({ source: "threader-page", type: "comps", url }, window.location.origin);
      }
    );

  const fetchComps = async () => {
    if (!narrowUrl && !broadUrl) return;
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      // Size first. It genuinely moves resale price, but it also cuts the
      // result count hard — so if the precise search is too thin to be
      // evidence, widen rather than reporting a confident band built from four
      // sales.
      let result = narrowUrl ? await read(narrowUrl) : { prices: [], reportedTotal: null, error: null };
      let widened = false;

      if (result.prices.length < MIN_COMPS && broadUrl && broadUrl !== narrowUrl) {
        setNote("Not many at that size — widening the search…");
        const broader = await read(broadUrl);
        if (broader.prices.length > result.prices.length) {
          result = broader;
          widened = true;
        }
      }

      if (result.error && result.prices.length === 0) {
        setError(result.error);
        return;
      }

      const outcome = await saveComps(itemId, {
        prices: result.prices,
        query: (widened ? broadUrl : narrowUrl) ?? "",
        reportedTotal: result.reportedTotal,
      });

      if (!outcome.ok) setError(outcome.error ?? "Couldn't use those results.");
      else setNote(widened ? "Widened past size to get enough sales." : null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!query) {
    return (
      <div className="notice">
        <strong>No sold prices for this one</strong>
        <p>
          Finding comparable sales needs a brand to search on — &ldquo;black fleece
          pullover&rdquo; matches half of eBay. Add the brand and this can look it up.
        </p>
      </div>
    );
  }

  const enough = stored && stored.n >= MIN_COMPS;

  return (
    <div className={enough ? "notice notice-good" : "notice"}>
      <strong>
        {enough
          ? `Sells for about ${usd(stored!.median)}`
          : stored
            ? `Only ${stored.n} completed ${stored.n === 1 ? "sale" : "sales"} found`
            : "What does this actually sell for?"}
      </strong>

      {enough ? (
        <p>
          Half of {stored!.n} completed eBay sales went between {usd(stored!.p25)} and{" "}
          {usd(stored!.p75)}
          {stored!.discarded > 0 &&
            `, ignoring ${stored!.discarded} outlier${stored!.discarded === 1 ? "" : "s"}`}
          . These are sold prices, not asking prices
          {storedAt && ` · read ${storedAt}`}.
        </p>
      ) : stored ? (
        <p>
          Too few to price from — {MIN_COMPS} is the minimum, because three sales of a common
          garment tell you almost nothing about the fourth. The price beside this is still a
          judgement call.
        </p>
      ) : (
        <p>
          Read completed eBay sales for this garment. It opens a background tab and reads the
          public sold-listings page — nothing signs in, and nothing is posted.
        </p>
      )}

      {error && <p className="num-neg">{error}</p>}
      {note && <p className="muted">{note}</p>}

      {!installed ? (
        <p className="muted">
          Needs the browser extension —{" "}
          <Link href="/install" className="link">
            install it
          </Link>
          .
        </p>
      ) : (
        <div className="qrow-actions">
          <button type="button" className="button button-sm" disabled={busy} onClick={fetchComps}>
            {busy ? "Reading eBay…" : stored ? "Read again" : "Find sold prices"}
          </button>

          {enough && (
            <button
              type="button"
              className="button button-sm button-quiet"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const outcome = await priceFromMarket(itemId);
                  if (!outcome.ok) setError(outcome.error ?? "Couldn't set the price.");
                  router.refresh();
                })
              }
            >
              {pending ? "Setting…" : `Price it at ${usd(stored!.median)}`}
            </button>
          )}

          {broadUrl && (
            <a className="linkbtn" href={broadUrl} target="_blank" rel="noreferrer">
              see the sales on eBay
            </a>
          )}
        </div>
      )}
    </div>
  );
}
