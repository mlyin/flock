"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks the extension to read a marketplace inbox.
 *
 * Each platform needs its own reader — the message pages have nothing in
 * common — but they all land in the same table, which is the point of a shared
 * inbox. Depop is the only one written so far.
 */
export default function SyncMessages() {
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "threader-extension") return;
      if (data.type === "ready") check();

      if (data.type === "messages-synced") {
        setBusy(false);
        setNote({
          ok: Boolean(data.ok),
          text: data.error
            ? data.error
            : `${data.imported} conversation${data.imported === 1 ? "" : "s"} read, ${data.matched} matched to a garment.`,
        });
        if (data.ok) router.refresh();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  if (!installed) {
    return (
      <div className="notice">
        <strong>The extension reads your messages</strong>
        <p>
          Marketplaces don&apos;t offer a messages API, so this runs in your own browser
          session. Install and pair the extension to sync them.
        </p>
      </div>
    );
  }

  const sync = () => {
    setNote(null);
    setBusy(true);
    window.postMessage(
      { source: "threader-page", type: "sync-messages", channel: "depop" },
      window.location.origin
    );
  };

  return (
    <>
      <div className="review-actions" style={{ margin: "0 0 18px" }}>
        <button type="button" className="button" onClick={sync} disabled={busy}>
          {busy ? "Reading Depop…" : "Sync Depop messages"}
        </button>
        <span className="muted">
          Opens each conversation to find which garment it&apos;s about. Takes a few seconds
          per thread.
        </span>
      </div>

      {note && (
        <div className={note.ok ? "notice notice-good" : "notice notice-bad"}>
          <strong>{note.ok ? "Synced" : "Couldn't sync"}</strong>
          <p>{note.text}</p>
        </div>
      )}
    </>
  );
}
