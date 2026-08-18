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
 * Photos taken more than this far apart are treated as different garments.
 *
 * You photograph a piece and then its care tag, seconds apart, then move to the
 * next garment. Ninety seconds is comfortably longer than the first gap and
 * shorter than the second. It's a guess, not a law — which is why every group
 * can be split and merged by hand, and why nothing is identified until you say
 * so.
 */
const GAP_MS = 90_000;

type Group = { id: string; photos: InboxPhoto[] };

/**
 * Group by when they were taken, then let the seller correct it.
 *
 * The old screen was one flat wall of photos: with four photos of two garments
 * you had to remember which was which and tick the right boxes. That doesn't
 * survive a real session where twenty photos land at once.
 */
function autoGroup(photos: InboxPhoto[]): Group[] {
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: Group[] = [];

  for (const photo of sorted) {
    const last = groups[groups.length - 1];
    const previous = last?.photos[last.photos.length - 1];
    const apart = previous
      ? new Date(photo.createdAt).getTime() - new Date(previous.createdAt).getTime()
      : Infinity;

    if (last && apart < GAP_MS) last.photos.push(photo);
    else groups.push({ id: photo.id, photos: [photo] });
  }

  return groups;
}

export default function InboxClient({ photos }: { photos: InboxPhoto[] }) {
  const auto = useMemo(() => autoGroup(photos), [photos]);

  // Overrides live as a photo-id -> group-id map, so a correction survives the
  // list changing underneath it. Empty means "the automatic grouping is right",
  // which it usually is.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ groupId: string; outcome: IdentifyOutcome } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const groups = useMemo(() => {
    if (Object.keys(moved).length === 0) return auto;

    const byId = new Map<string, Group>();
    for (const group of auto) byId.set(group.id, { id: group.id, photos: [] });

    for (const group of auto) {
      for (const photo of group.photos) {
        const target = moved[photo.id] ?? group.id;
        if (!byId.has(target)) byId.set(target, { id: target, photos: [] });
        byId.get(target)!.photos.push(photo);
      }
    }

    return [...byId.values()].filter((g) => g.photos.length > 0);
  }, [auto, moved]);

  const run = (group: Group, action: (ids: string[]) => Promise<IdentifyOutcome>) => {
    setResult(null);
    setBusy(group.id);
    startTransition(async () => {
      const outcome = await action(group.photos.map((p) => p.id));
      setBusy(null);
      setResult({ groupId: group.id, outcome });
      if (outcome.ok) router.refresh();
    });
  };

  const discard = (id: string) =>
    startTransition(async () => {
      await deleteInboxPhoto(id);
      router.refresh();
    });

  /** Pull one photo out into a garment of its own. */
  const split = (photo: InboxPhoto) =>
    setMoved((m) => ({ ...m, [photo.id]: `own-${photo.id}` }));

  /** Fold a whole group into the one above it. */
  const mergeUp = (group: Group, index: number) => {
    const above = groups[index - 1];
    if (!above) return;
    setMoved((m) => {
      const next = { ...m };
      for (const photo of group.photos) next[photo.id] = above.id;
      return next;
    });
  };

  if (photos.length === 0) return null;

  return (
    <div className="garments">
      {groups.map((group, index) => {
        const isBusy = busy === group.id;
        const note = result?.groupId === group.id ? result.outcome : null;

        return (
          <section key={group.id} className="garment">
            <header className="garment-head">
              <div>
                <strong>Garment {index + 1}</strong>
                <span className="muted">
                  {" "}
                  · {group.photos.length} photo{group.photos.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="garment-acts">
                {index > 0 && (
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => mergeUp(group, index)}
                    disabled={pending}
                  >
                    Merge up
                  </button>
                )}
                <button
                  type="button"
                  className="button button-sm button-quiet"
                  onClick={() => run(group, addItemByHand)}
                  disabled={pending}
                >
                  Add without AI
                </button>
                <button
                  type="button"
                  className="button button-sm"
                  onClick={() => run(group, analyzePhotos)}
                  disabled={pending}
                >
                  {isBusy ? "Reading…" : "Identify garment"}
                </button>
              </div>
            </header>

            <div className="garment-shots">
              {group.photos.map((photo) => (
                <figure key={photo.id} className="garment-shot">
                  <img src={photo.url} alt="" />
                  <figcaption>
                    <span className="muted">{kb(photo.bytes)}</span>
                    <span className="garment-shot-acts">
                      {group.photos.length > 1 && (
                        <button type="button" className="linkish" onClick={() => split(photo)}>
                          Separate
                        </button>
                      )}
                      <button type="button" className="linkish" onClick={() => discard(photo.id)}>
                        Discard
                      </button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>

            {note && (
              <p className={note.ok ? "chipnote chipnote-ok" : "chipnote chipnote-bad"}>
                {note.ok ? "Identified — it's in your inventory as a draft." : note.error}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
