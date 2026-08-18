"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteItem } from "@/app/actions";

/**
 * Delete a garment and its photos.
 *
 * Two-step on purpose. This is the only destructive control in the app and it
 * takes the photos with it — there is no undo, and a mis-click on a row you
 * spent time photographing is a bad trade for saving one click.
 *
 * It refuses while anything is live, and the server enforces that rather than
 * this component: deleting the record does NOT take a listing down, it just
 * means Flock stops knowing about something still for sale.
 */
export default function DeleteItem({ itemId, sku }: { itemId: string; sku: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <button
        type="button"
        className="linkish linkish-danger"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Delete garment
      </button>
    );
  }

  return (
    <span className="deleteconfirm">
      <span className="muted">Delete {sku} and its photos?</span>
      <button
        type="button"
        className="button button-sm button-danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const outcome = await deleteItem(itemId);
            if (outcome.ok) {
              router.push("/");
              router.refresh();
            } else {
              setError(outcome.error);
              setConfirming(false);
            }
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" className="linkish" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      {error && <span className="chipnote chipnote-bad">{error}</span>}
    </span>
  );
}
