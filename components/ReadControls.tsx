"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllMessagesRead, markMessageRead } from "@/app/offer-actions";

/**
 * Clears the unread badge.
 *
 * Deliberately not "mark everything read the moment you open the inbox": the
 * badge is the only thing that says a buyer is waiting on you, and opening a
 * tab is not the same as having dealt with them. You say when it's handled.
 */
export function MarkAllRead({ unread }: { unread: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (unread === 0) return null;

  return (
    <button
      type="button"
      className="pill"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllMessagesRead();
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : `Mark ${unread} read`}
    </button>
  );
}

/** Per-message, for clearing one without touching the rest. */
export function MarkRead({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="linkbutton"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markMessageRead(messageId);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Mark read"}
    </button>
  );
}
