"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addItemByHand, analyzePhotos, deleteInboxPhoto } from "@/app/actions";
import type { IdentifyOutcome } from "@/lib/intake";

export type InboxPhoto = {
  id: string;
  url: string;
  bytes: number | null;
  createdAt: string;
};

const kb = (bytes: number | null) =>
  bytes ? `${Math.round(bytes / 1024).toLocaleString()} KB` : "";

/**
 * Photos taken close together are OFFERED as one garment, never assumed to be.
 *
 * An earlier version grouped by this gap and then identified each group
 * automatically. It produced five items from four photos — an Oakley tee and
 * its own care tag became two separate garments — because the gap is a decent
 * hint and a terrible decision-maker. Someone photographing six angles of one
 * jacket over a few minutes breaks it completely.
 *
 * So it now only pre-selects. Nothing is created until you say which photos are
 * one garment and press the button.
 */
const GAP_MS = 90_000;

function suggestFirstGarment(photos: InboxPhoto[]): string[] {
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const picked: string[] = [];

  for (const photo of sorted) {
    const previous = sorted[picked.length - 1];
    if (!previous) {
      picked.push(photo.id);
      continue;
    }
    const apart = new Date(photo.createdAt).getTime() - new Date(previous.createdAt).getTime();
    if (apart > GAP_MS) break;
    picked.push(photo.id);
  }

  return picked;
}

export default function InboxClient({ photos }: { photos: InboxPhoto[] }) {
  const suggestion = useMemo(() => suggestFirstGarment(photos), [photos]);
  const [selected, setSelected] = useState<string[]>(suggestion);
  const [result, setResult] = useState<IdentifyOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const run = (action: (ids: string[]) => Promise<IdentifyOutcome>) => {
    if (selected.length === 0) return;
    setResult(null);
    startTransition(async () => {
      const outcome = await action(selected);
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

  if (photos.length === 0) return null;

  const ordered = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <>
      <div className="selectbar">
        <div>
          <strong>{selected.length || "No"}</strong>{" "}
          {selected.length === 1 ? "photo" : "photos"} selected
          {selected.length > 0 && <span className="muted"> — these become one garment</span>}
        </div>
        <div className="selectbar-actions">
          <button
            type="button"
            className="pill"
            onClick={() => setSelected(ordered.map((p) => p.id))}
            disabled={pending}
          >
            Select all
          </button>
          {selected.length > 0 && (
            <button type="button" className="pill" onClick={() => setSelected([])} disabled={pending}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="button button-sm button-quiet"
            onClick={() => run(addItemByHand)}
            disabled={pending || selected.length === 0}
          >
            Add without AI
          </button>
          <button
            type="button"
            className="button button-sm"
            onClick={() => run(analyzePhotos)}
            disabled={pending || selected.length === 0}
          >
            {pending
              ? "Reading…"
              : `Identify ${selected.length || ""} as one garment`.replace("  ", " ")}
          </button>
        </div>
      </div>

      {result && (
        <p className={result.ok ? "chipnote chipnote-ok" : "chipnote chipnote-bad"}>
          {result.ok ? "Identified — it's in your inventory as a draft." : result.error}
        </p>
      )}

      <div className="shots shots-pick">
        {ordered.map((photo) => {
          const on = selected.includes(photo.id);
          return (
            <div key={photo.id} className={`pickshot ${on ? "pickshot-on" : ""}`}>
              <button
                type="button"
                className="pickshot-hit"
                onClick={() => toggle(photo.id)}
                aria-pressed={on}
                aria-label={on ? "Deselect photo" : "Select photo"}
              >
                <img src={photo.url} alt="" />
                <span className="pickshot-tick" aria-hidden>
                  {on ? "✓" : ""}
                </span>
              </button>
              <div className="pickshot-meta">
                <span className="muted">{kb(photo.bytes)}</span>
                <button type="button" className="linkish" onClick={() => discard(photo.id)}>
                  Discard
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
