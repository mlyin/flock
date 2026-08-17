"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareListings } from "@/app/actions";
import { CHANNEL_LABEL, projectedNet, type Channel } from "@/lib/fees";
import { usd } from "@/lib/money";

export type DraftedListing = {
  id: string;
  channel: Channel;
  title: string | null;
  description: string | null;
  price: number;
  draft: {
    category?: string;
    specifics?: Record<string, string>;
    tags?: string[];
    price?: { low: number; suggested: number; high: number; reasoning: string };
  } | null;
};

function Copy({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export default function ListingDrafts({
  itemId,
  listings,
}: {
  itemId: string;
  listings: DraftedListing[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await prepareListings(itemId);
      if (!outcome.ok) setError(outcome.error);
      else router.refresh();
    });

  const band = listings.find((l) => l.draft?.price)?.draft?.price;

  return (
    <>
      <div className="sectionhead">
        <h2>Listing copy</h2>
        <p>
          {listings.length > 0
            ? "Paste into each channel. eBay and Depop want different things."
            : "Generate eBay and Depop copy from this garment."}
        </p>
      </div>

      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t write the listings</strong>
          <p>{error}</p>
        </div>
      )}

      {band && (
        <div className="priceband">
          <div className="priceband-row">
            <span>
              <strong>{usd(band.suggested)}</strong> suggested
            </span>
            <span className="muted">
              {usd(band.low)} moves fast · {usd(band.high)} with patience
            </span>
          </div>
          <p>{band.reasoning}</p>
        </div>
      )}

      {listings.map((listing) => {
        const net = projectedNet(listing.channel, listing.price);
        return (
          <div key={listing.id} className="draftcard">
            <div className="draftcard-head">
              <span className="draftcard-name">{CHANNEL_LABEL[listing.channel]}</span>
              <span className="draftcard-net">
                {usd(net)} net <span className="muted">at {usd(listing.price)}</span>
              </span>
            </div>

            <div className="field">
              <span className="field-label">
                Title
                {listing.channel === "ebay" && (
                  <span className={`conf ${(listing.title?.length ?? 0) > 80 ? "conf-bad" : "conf-ok"}`}>
                    {listing.title?.length ?? 0}/80
                  </span>
                )}
                <Copy text={listing.title ?? ""} label="title" />
              </span>
              <p className="draft-text">{listing.title}</p>
            </div>

            <div className="field">
              <span className="field-label">
                Description
                <Copy text={listing.description ?? ""} label="description" />
              </span>
              <p className="draft-text draft-body">{listing.description}</p>
            </div>

            {listing.draft?.tags && (
              <div className="field">
                <span className="field-label">
                  Tags
                  <Copy text={listing.draft.tags.join(" ")} label="tags" />
                </span>
                <div className="tags">
                  {listing.draft.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {listing.draft?.specifics && (
              <div className="field">
                <span className="field-label">Item specifics</span>
                <div className="spec spec-tight">
                  {Object.entries(listing.draft.specifics).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value || "—"}</dd>
                    </div>
                  ))}
                </div>
                {listing.draft.category && (
                  <p className="draft-text muted">Category: {listing.draft.category}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="review-actions">
        <button type="button" className="button" onClick={generate} disabled={pending}>
          {pending ? "Writing…" : listings.length > 0 ? "Rewrite copy" : "Write listing copy"}
        </button>
        <span className="muted">
          {listings.length > 0
            ? "Rewriting replaces the copy above."
            : "Nothing is posted anywhere — this only drafts the text."}
        </span>
      </div>
    </>
  );
}
