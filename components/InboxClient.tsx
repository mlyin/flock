"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

  /**
   * Identify new photos without being asked.
   *
   * Uploading and then pressing a button on each card is two steps where one
   * would do — the answer to 'what is this' is wanted every time.
   *
   * This terminates on its own: identifying a group assigns those photos to
   * an item, so they leave the unassigned inbox and can't come round again.
   * Groups are done one at a time rather than at once, because a dozen photos
   * dropped in together would otherwise fire a dozen concurrent reads.
   */
  const [autoIdentify, setAutoIdentify] = useState(true);
  const attempted = useRef(new Set<string>());
  const [running, setRunning] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

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

  const identify = useCallback(
    async (group: Group) => {
      setRunning(group.id);
      const outcome = await analyzePhotos(group.photos.map((p) => p.id));
      setRunning(null);
      setResult({ groupId: group.id, outcome });
      if (outcome.ok) router.refresh();
    },
    [router]
  );

  useEffect(() => {
    // Not mid-drag: the seller is still saying what this garment is.
    if (!autoIdentify || running || pending || dragging) return;

    const next = groups.find((g) => !attempted.current.has(g.id));
    if (!next) return;

    // Marked before the call, not after: a read that fails should not be
    // retried forever against a photo the model can't use.
    attempted.current.add(next.id);
    void identify(next);
  }, [autoIdentify, groups, running, pending, dragging, identify]);

  const discard = (id: string) =>
    startTransition(async () => {
      await deleteInboxPhoto(id);
      router.refresh();
    });

  /**
   * Move a photo into a garment.
   *
   * Dropping onto the strip at the bottom gives it a garment of its own,
   * keyed on the photo's own id so it can't collide with an existing group.
   */
  const move = (photoId: string, groupId: string) => {
    setMoved((m) => ({ ...m, [photoId]: groupId }));
    // A group whose contents just changed deserves a fresh read.
    attempted.current.delete(groupId);
    setDragging(null);
    setOver(null);
  };

  const dropProps = (groupId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== groupId) setOver(groupId);
    },
    onDragLeave: () => setOver((current) => (current === groupId ? null : current)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      // dataTransfer is the real source; `dragging` covers browsers that
      // don't hand the payload back on drop.
      const photoId = e.dataTransfer.getData("text/plain") || dragging;
      if (photoId) move(photoId, groupId);
    },
  });
  if (photos.length === 0) return null;

  return (
    <>
      <div className="selectbar">
        <label>
          <input
            type="checkbox"
            checked={autoIdentify}
            onChange={(e) => setAutoIdentify(e.target.checked)}
          />{" "}
          Identify new photos automatically
        </label>
        <span className="muted">
          {running
            ? "Reading a garment…"
            : "Drag a photo between garments if the grouping is wrong."}
        </span>
      </div>

      <div className="garments">
      {groups.map((group, index) => {
        const isBusy = busy === group.id || running === group.id;
        const note = result?.groupId === group.id ? result.outcome : null;

        return (
          <section
            key={group.id}
            className={`garment ${over === group.id ? "garment-over" : ""}`}
            {...dropProps(group.id)}
          >
            <header className="garment-head">
              <div>
                <strong>Garment {index + 1}</strong>
                <span className="muted">
                  {" "}
                  · {group.photos.length} photo{group.photos.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="garment-acts">
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
                <figure
                  key={photo.id}
                  className={`garment-shot ${dragging === photo.id ? "garment-shot-dragging" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", photo.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(photo.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  {/* draggable={false} on the img so the browser drags the
                      whole card rather than a ghost of the image alone. */}
                  <img src={photo.url} alt="" draggable={false} />
                  <figcaption>
                    <span className="muted">{kb(photo.bytes)}</span>
                    <button type="button" className="linkish" onClick={() => discard(photo.id)}>
                      Discard
                    </button>
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

      {/* Only while dragging — the rest of the time it's a box asking to be
          ignored. */}
      {dragging && (
        <div
          className={`garment-new ${over === `own-${dragging}` ? "garment-over" : ""}`}
          {...dropProps(`own-${dragging}`)}
        >
          Drop here to make this its own garment
        </div>
      )}
      </div>
    </>
  );
}
