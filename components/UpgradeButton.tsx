"use client";

import { useState, useTransition } from "react";
import { startCheckout } from "@/app/actions";

/**
 * Sends a signed-in seller to Stripe Checkout; sends everyone else to sign in
 * first, because a checkout needs a user id to attach the subscription to.
 */
export default function UpgradeButton({
  plan,
  label,
  primary,
}: {
  plan: "hogget" | "mutton";
  label: string;
  primary?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        className={primary ? "button" : "button button-quiet"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const outcome = await startCheckout(plan);
            if (outcome.ok) {
              // Stripe's own page, not an embedded form: card details never
              // touch this origin, which is the whole reason to use Checkout.
              window.location.href = outcome.url;
            } else if (/signed out/i.test(outcome.error)) {
              window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
            } else {
              setError(outcome.error);
            }
          })
        }
      >
        {pending ? "Opening…" : label}
      </button>
      {error && <p className="chipnote chipnote-bad">{error}</p>}
    </>
  );
}
