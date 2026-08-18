"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBasicListings, prepareListings } from "@/app/actions";
import { CHANNEL_LABEL, projectedNet, type Channel } from "@/lib/fees";
import { usd } from "@/lib/money";
import FillButton from "./FillButton";

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
  addressSet = true,
}: {
  itemId: string;
  listings: DraftedListing[];
  addressSet?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = (action: (id: string) => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const outcome = await action(itemId);
      if (!outcome.ok) setError(outcome.error ?? "Something went wrong.");
      else router.refresh();
    });

  const band = listings.find((l) => l.draft?.price)?.draft?.price;

  return (
    <>
      <div className="sectionhead">
        <h2>Listing copy</h2>
        <p>Each channel wants something different, so the copy differs.</p>
      </div>

      {listings.length > 0 && (
        <div className="routes">
          <div>
            <strong>On this computer</strong>
            <p>
              Click the <b>Flock icon in your Chrome toolbar</b> and hit Fill on Depop. It
              opens the sell page in a hidden window and fills it. Not paired yet?{" "}
              <Link href="/connect" className="link">
                Set that up first
              </Link>
              .
            </p>
          </div>
          <div>
            <strong>Anywhere else</strong>
            <p>
              <b>Post step by step</b> below gives you one tap per field to copy across. The
              only route that works on a phone, where nothing can fill another app&apos;s form.
            </p>
          </div>
        </div>
      )}

      {listings.length > 0 && !addressSet && (
        <div className="notice notice-warn">
          <strong>No ship-from address yet</strong>
          <p>
            Depop and Mercari both refuse a listing until your account has one.{" "}
            <Link href="/settings" className="link">
              Add it once in Settings
            </Link>{" "}
            and the extension enters it for you from then on.
          </p>
        </div>
      )}

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
              {/* Tap-to-copy. Named for the phone because that's where it
                  matters most — iOS can't fill another app's form — but it
                  works with a mouse too. */}
              <a className="copy" href={`/post/${listing.id}`}>
                Post step by step
              </a>
              {listing.channel !== "ebay" && (
                <FillButton listingId={listing.id} channel={listing.channel} />
              )}
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
        <button
          type="button"
          className="pill"
          onClick={() => run(createBasicListings)}
          disabled={pending}
        >
          Build from my details
        </button>
        <button type="button" className="button" onClick={() => run(prepareListings)} disabled={pending}>
          {pending ? "Working…" : listings.length > 0 ? "Rewrite with AI" : "Write copy with AI"}
        </button>
        <span className="muted">
          {listings.length > 0
            ? "Either option replaces the copy above."
            : "Nothing is posted anywhere. “Build from my details” needs no API key."}
        </span>
      </div>
    </>
  );
}
