"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { analyzePhotos, deleteInboxPhoto } from "@/app/actions";
import type { IdentifyOutcome } from "@/lib/intake";

export type InboxPhoto = { id: string; url: string; bytes: number | null };

const kb = (bytes: number | null) =>
  bytes ? `${Math.round(bytes / 1024).toLocaleString()} KB` : "";

export default function InboxClient({ photos }: { photos: InboxPhoto[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<IdentifyOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const analyze = () => {
    setResult(null);
    startTransition(async () => {
      const outcome = await analyzePhotos(selected);
      setResult(outcome);
      if (outcome.ok) {
        setSelected([]);
        router.refresh();
      }
    });
  };

  const discard = (id: string) =>
    startTransition(async () => {
      await deleteInboxPhoto(id);
      setSelected((current) => current.filter((x) => x !== id));
      router.refresh();
    });

  return (
    <>
      <div className="selectbar">
        <div>
          <strong>{selected.length || "No"}</strong> {selected.length === 1 ? "photo" : "photos"} selected
          {selected.length > 1 && <span className="muted"> — treated as one garment</span>}
        </div>
        <div className="selectbar-actions">
          {selected.length > 0 && (
            <button type="button" className="pill" onClick={() => setSelected([])} disabled={pending}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="button"
            onClick={analyze}
            disabled={pending || selected.length === 0}
          >
            {pending ? "Reading photos…" : "Identify garment"}
          </button>
        </div>
      </div>

      {result?.ok === false && (
        <div className="notice notice-bad">
          <strong>That didn&apos;t work</strong>
          <p>{result.error}</p>
        </div>
      )}

      {result?.ok && (
        <div className="notice notice-good">
          <strong>
            {result.sku} drafted{" "}
            <Link href={`/items/${result.itemId}`} className="link">
              — review it
            </Link>
          </strong>
          <p>
            {result.questions.length > 0
              ? `${result.questions.length} thing${result.questions.length === 1 ? "" : "s"} it couldn't tell from the photos. They're waiting on the item page.`
              : "It was confident about everything. Still worth a look before you list."}
          </p>
        </div>
      )}

      <div className="shots">
        {photos.map((photo) => {
          const on = selected.includes(photo.id);
          const order = selected.indexOf(photo.id) + 1;
          return (
            <div key={photo.id} className={on ? "shot shot-on" : "shot"}>
              <button
                type="button"
                className="shot-hit"
                onClick={() => toggle(photo.id)}
                disabled={pending}
                aria-pressed={on}
                aria-label={on ? `Deselect photo ${order}` : "Select photo"}
              >
                <img src={photo.url} alt="" />
              </button>
              {on && <span className="shot-order">{order}</span>}
              <span className="shot-meta">
                <span className="shot-name">{kb(photo.bytes)}</span>
                <button
                  type="button"
                  className="shot-discard"
                  onClick={() => discard(photo.id)}
                  disabled={pending}
                >
                  Discard
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
