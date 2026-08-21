"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isStale } from "@/lib/extension";

/**
 * Says so when the installed extension is older than the one this build expects.
 *
 * Loaded-unpacked extensions never auto-update, so an install can sit months
 * behind. When it does, a filler missing a fix looks identical to the
 * marketplace having changed its form — and the seller reports a bug against
 * code that was already fixed.
 */
export default function ExtensionVersion({
  current,
  showCurrent = false,
}: {
  current: string;
  showCurrent?: boolean;
}) {
  const [installed, setInstalled] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const read = () => {
      setInstalled(document.documentElement.getAttribute("data-threader-extension"));
      setChecked(true);
    };
    read();

    // bridge.js stamps the attribute at document_idle, which can land after
    // React hydrates. Re-read on its ready message rather than polling.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source === "threader-extension" && event.data.type === "ready") read();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!checked) return null;

  // Not installed at all is a different page's problem — every surface that
  // needs the extension already prompts for it.
  if (!installed) return showCurrent ? <p className="muted">Latest version: {current}</p> : null;

  // "1" is what builds before 0.3.0 stamped, so we know it is old but not how
  // old. Say the honest thing rather than inventing a version number.
  const unknown = installed === "1";

  if (unknown || isStale(installed, current)) {
    return (
      <div className="notice notice-warn">
        <strong>Your extension is out of date</strong>
        <p>
          {unknown
            ? "The installed build is older than 0.3.0"
            : `You have ${installed} installed`}
          , and this app expects {current}. Fixes to the marketplace fillers ship in the
          extension, so an old build can fail on a form that already works.{" "}
          <Link href="/install" className="link">
            Download the current zip
          </Link>{" "}
          and reload it at <code>chrome://extensions</code>.
        </p>
      </div>
    );
  }

  return showCurrent ? (
    <p className="muted">Extension {installed} — up to date.</p>
  ) : null;
}
