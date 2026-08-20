"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokePairing } from "@/app/actions";
import { shortDate } from "@/lib/money";

export type PairedToken = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
};

export default function PairedDevices({ tokens }: { tokens: PairedToken[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const router = useRouter();

  const revoke = (id: string) =>
    startTransition(async () => {
      setError(null);
      const outcome = await revokePairing(id);
      if (!outcome.ok) setError(outcome.error ?? "Couldn't revoke it.");
      else {
        setConfirming(null);
        router.refresh();
      }
    });

  return (
    <>
      {error && (
        <div className="notice notice-bad">
          <strong>Couldn&apos;t revoke that pairing</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="inboxlist">
        {tokens.map((token) => (
          <div key={token.id} className="inboxrow">
            <span className="inboxrow-name">{token.label ?? "Extension"}</span>
            <span className="inboxrow-meta">
              paired {shortDate(token.created_at)}
              {token.last_used_at ? ` · last used ${shortDate(token.last_used_at)}` : " · never used"}
            </span>

            {confirming === token.id ? (
              <span className="rowactions">
                <button
                  type="button"
                  className="pill"
                  onClick={() => setConfirming(null)}
                  disabled={pending}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="pill pill-danger"
                  onClick={() => revoke(token.id)}
                  disabled={pending}
                >
                  {pending ? "Revoking…" : "Yes, revoke"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="pill"
                onClick={() => setConfirming(token.id)}
                disabled={pending}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
