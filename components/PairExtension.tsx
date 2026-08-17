"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPairingCode } from "@/app/actions";

export default function PairExtension({ existing }: { existing: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const generate = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await createPairingCode();
      if (outcome.ok) {
        setCode(outcome.token);
        router.refresh();
      } else {
        setError(outcome.error);
      }
    });

  return (
    <>
      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t generate a code</strong>
          <p>{error}</p>
        </div>
      )}

      {code ? (
        <div className="pairing">
          <span className="field-label">Paste this into the extension</span>
          <code className="pairing-code">{code}</code>
          <div className="review-actions">
            <button
              type="button"
              className="button"
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <span className="muted">
              Shown once. Only its hash is stored, so we can&apos;t show it again — generate a
              new one if you lose it.
            </span>
          </div>
        </div>
      ) : (
        <div className="review-actions" style={{ margin: "18px 0" }}>
          <button type="button" className="button" onClick={generate} disabled={pending}>
            {pending ? "Generating…" : existing > 0 ? "Pair another device" : "Generate pairing code"}
          </button>
        </div>
      )}
    </>
  );
}
