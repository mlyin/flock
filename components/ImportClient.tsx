"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adoptAllUnmatched, adoptExternalListing, type ExternalListingRow } from "@/app/actions";
import { CHANNEL_LABEL } from "@/lib/fees";
import { usd } from "@/lib/money";

/**
 * Bring a closet that already exists into Flock.
 *
 * Reading the shop needs the extension — Depop has no API — so this drives it
 * over the same postMessage bridge the Fill buttons use, then shows what came
 * back and lets the seller adopt it.
 */
export default function ImportClient({
  listings,
  depopUsername,
}: {
  listings: ExternalListingRow[];
  depopUsername: string;
}) {
  const [installed, setInstalled] = useState(false);
  const [username, setUsername] = useState(depopUsername);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setInstalled(document.documentElement.hasAttribute("data-threader-extension"));

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data;
      if (!d || d.source !== "threader-extension") return;

      if (d.type === "ready") setInstalled(true);
      if (d.type === "shop-synced") {
        setSyncing(false);
        if (d.ok) {
          setError(null);
          setStatus(
            `Read ${d.found} listing${d.found === 1 ? "" : "s"}` +
              (d.matched ? ` · ${d.matched} tied to garments you already have` : "")
          );
          router.refresh();
        } else {
          setError(d.error ?? "The read didn't complete.");
        }
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  const sync = () => {
    if (!username.trim()) {
      setError("Which Depop shop? Enter your username.");
      return;
    }
    setSyncing(true);
    setError(null);
    setStatus(null);
    window.postMessage(
      { source: "threader-page", type: "sync-shop", channel: "depop", username: username.trim() },
      window.location.origin
    );
  };

  const unmatched = listings.filter((l) => !l.item_id && l.status !== "ended");
  const matched = listings.filter((l) => l.item_id);

  return (
    <>
      {!installed ? (
        <div className="notice notice-warn">
          <strong>Import needs the browser extension</strong>
          <p>
            Depop has no API, so the only way to read your shop is from your own signed-in
            browser.{" "}
            <Link href="/install" className="link">
              Install it
            </Link>{" "}
            — a minute, and it is the same extension that fills listing forms.
          </p>
        </div>
      ) : (
        <div className="uploader">
          <div>
            <strong>Read your Depop shop</strong>
            <p>
              Opens your shop in a background tab and reads what is live. Nothing is changed on
              Depop.
            </p>
          </div>
          <div className="qrow-actions">
            <label className="field" htmlFor="depop-username">
              <span className="field-label">Depop username</span>
              <input
                id="depop-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yumseller21"
                spellCheck={false}
              />
            </label>
            <button type="button" className="button" onClick={sync} disabled={syncing}>
              {syncing ? "Reading…" : "Read my shop"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t read the shop</strong>
          <p>{error}</p>
        </div>
      )}
      {status && (
        <div className="notice notice-good">
          <strong>{status}</strong>
        </div>
      )}

      {unmatched.length > 0 && (
        <>
          <div className="sectionhead">
            <h2>Not in Flock yet</h2>
            <p>
              {unmatched.length} listing{unmatched.length === 1 ? "" : "s"} · adopting one
              creates the garment with its real URL already attached
            </p>
          </div>

          <div className="review-actions" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await adoptAllUnmatched();
                  setStatus(
                    `Adopted ${result.adopted}. They land unreviewed — the marketplace never told us brand, size or what you paid.`
                  );
                  router.refresh();
                })
              }
            >
              {pending ? "Adopting…" : `Adopt all ${unmatched.length}`}
            </button>
            <span className="muted">
              Each lands unreviewed. A marketplace gives a title and a price, never brand, size
              or cost basis.
            </span>
          </div>

          <div className="qlist">
            {unmatched.map((l) => (
              <div key={l.id} className="qrow">
                <div className="qrow-what">
                  <strong>{l.title ?? l.external_id}</strong>
                  <span className="qrow-meta">
                    {CHANNEL_LABEL[l.channel]}
                    {l.price !== null && ` · ${usd(l.price)}`}
                    {l.status !== "active" && ` · ${l.status}`}
                    {l.url && (
                      <>
                        {" · "}
                        <a href={l.url} target="_blank" rel="noreferrer" className="link">
                          view
                        </a>
                      </>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="pill"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await adoptExternalListing(l.id);
                      if (!result.ok) setError(result.error ?? "Couldn't adopt it.");
                      router.refresh();
                    })
                  }
                >
                  Adopt
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {matched.length > 0 && (
        <>
          <div className="sectionhead">
            <h2>Already in Flock</h2>
            <p>{matched.length} tied to a garment</p>
          </div>
          <div className="qlist">
            {matched.map((l) => (
              <div key={l.id} className="qrow">
                <div className="qrow-what">
                  <strong>{l.title ?? l.external_id}</strong>
                  <span className="qrow-meta">
                    {CHANNEL_LABEL[l.channel]}
                    {l.price !== null && ` · ${usd(l.price)}`}
                  </span>
                </div>
                <Link href={`/items/${l.item_id}`} className="pill">
                  Open garment
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {listings.length === 0 && installed && (
        <div className="notice">
          <strong>Nothing read yet</strong>
          <p>
            Enter your Depop username and press Read my shop. Everything live there appears
            here, ready to become garments.
          </p>
        </div>
      )}
    </>
  );
}
