"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNEL_LABEL, type Channel } from "@/lib/fees";

type Result = { ok: boolean; error: string | null; missing: string[]; blocked: string[] };

/**
 * Triggers the extension from the page, so posting starts where you're already
 * looking rather than from the toolbar icon.
 *
 * Talks to the extension's content script over window.postMessage. An unpacked
 * extension has a different random id on every install, so there's no stable id
 * for the page to address directly.
 */
export default function FillButton({
  listingId,
  channel,
}: {
  listingId: string;
  channel: Channel;
}) {
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const router = useRouter();

  useEffect(() => {
    // The bridge stamps the document as soon as it loads; check both in case it
    // landed before we mounted.
    const check = () => setInstalled(document.documentElement.hasAttribute("data-threader-extension"));
    check();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "threader-extension") return;

      if (data.type === "ready") check();
      if (data.type === "filled" && data.listingId === listingId) {
        setPending(false);
        setResult({
          ok: data.ok,
          error: data.error,
          missing: data.missing ?? [],
          blocked: data.blocked ?? [],
        });
        if (data.ok) router.refresh();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [listingId, router]);

  if (!installed) return null;

  const fill = () => {
    setResult(null);
    setPending(true);
    window.postMessage(
      { source: "threader-page", type: "fill", listingId },
      window.location.origin
    );
  };

  return (
    <>
      <button type="button" className="button fillbtn" onClick={fill} disabled={pending}>
        {pending ? "Filling…" : `Fill on ${CHANNEL_LABEL[channel]}`}
      </button>

      {result && (
        <div className={result.ok ? "notice notice-good" : "notice notice-bad"}>
          <strong>
            {result.ok
              ? `Filled on ${CHANNEL_LABEL[channel]}`
              : `Couldn't fill ${CHANNEL_LABEL[channel]}`}
          </strong>
          <p>
            {result.error ??
              [
                result.missing.length ? `Left blank: ${result.missing.join(", ")}.` : null,
                result.blocked.length ? `${CHANNEL_LABEL[channel]} still wants: ${result.blocked.join(" · ")}.` : null,
                !result.missing.length && !result.blocked.length
                  ? "Everything went in. Review it and publish."
                  : "The window is open — finish it there.",
              ]
                .filter(Boolean)
                .join(" ")}
          </p>
        </div>
      )}
    </>
  );
}
