"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markListed } from "@/app/actions";
import { CHANNEL_LABEL, type Channel } from "@/lib/fees";

/**
 * One tap per field. Copied fields stay marked so you can see where you are
 * after switching to the marketplace app and back — which on a phone happens
 * between every single field.
 */

const APP_LINK: Partial<Record<Channel, string>> = {
  depop: "https://www.depop.com/products/create/",
  mercari: "https://www.mercari.com/sell/",
  ebay: "https://www.ebay.com/sl/sell",
};

type Field = { key: string; label: string; value: string; long?: boolean };

export default function PostFlow({
  listingId,
  channel,
  alreadyLive,
  fields,
  photos,
  reminders,
}: {
  listingId: string;
  channel: Channel;
  alreadyLive: boolean;
  fields: Field[];
  photos: string[];
  reminders: string[];
}) {
  const [done, setDone] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const copy = async (field: Field) => {
    await navigator.clipboard.writeText(field.value);
    setDone((current) => (current.includes(field.key) ? current : [...current, field.key]));
  };

  const allCopied = fields.every((f) => done.includes(f.key));

  return (
    <>
      {photos.length > 0 && (
        <div className="postphotos">
          {photos.map((url) => (
            <img key={url} src={url} alt="" />
          ))}
        </div>
      )}

      <p className="posthint">
        Your photos are already in the camera roll — pick them in {CHANNEL_LABEL[channel]}&apos;s
        own uploader. Copy each field below, paste it across, then come back.
      </p>

      <div className="postfields">
        {fields.map((field, index) => {
          const copied = done.includes(field.key);
          return (
            <button
              key={field.key}
              type="button"
              className={copied ? "postfield postfield-done" : "postfield"}
              onClick={() => copy(field)}
            >
              <span className="postfield-head">
                <span className="postfield-step">{index + 1}</span>
                <span className="postfield-label">{field.label}</span>
                <span className="postfield-action">{copied ? "Copied ✓" : "Tap to copy"}</span>
              </span>
              <span className={field.long ? "postfield-value postfield-long" : "postfield-value"}>
                {field.value || <em>empty</em>}
              </span>
            </button>
          );
        })}
      </div>

      {reminders.length > 0 && (
        <div className="notice">
          <strong>Set these by hand</strong>
          <p>
            {CHANNEL_LABEL[channel]} uses dropdowns for these, so they can&apos;t be pasted:{" "}
            {reminders.join(" · ")}
          </p>
        </div>
      )}

      <div className="postactions">
        <a
          className="button"
          href={APP_LINK[channel] ?? "#"}
          target="_blank"
          rel="noreferrer"
        >
          Open {CHANNEL_LABEL[channel]}
        </a>

        {alreadyLive ? (
          <span className="badge badge-listed">already marked live</span>
        ) : (
          <button
            type="button"
            className="pill"
            disabled={pending || !allCopied}
            onClick={() =>
              startTransition(async () => {
                await markListed(listingId);
                router.refresh();
              })
            }
          >
            {allCopied ? "I've posted it" : "Copy every field first"}
          </button>
        )}
      </div>
    </>
  );
}
