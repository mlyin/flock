"use client";

import { useState, useTransition } from "react";
import { openBillingPortal } from "@/app/actions";

/**
 * The cancel path the pricing page promises.
 *
 * openBillingPortal has existed with no button wired to it, while /pricing
 * answered "Can I cancel?" with "Yes — in the app, no email to write." That
 * made the FAQ untrue for every paying subscriber, which is exactly the kind
 * of overclaiming the rest of this product is careful to avoid.
 *
 * Stripe's portal owns cancellation, payment method and invoices, so this is
 * one button rather than a billing screen we would have to keep correct.
 */
export default function BillingCard({ planLabel, paid }: { planLabel: string; paid: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await openBillingPortal();
      if (outcome.ok) window.location.href = outcome.url;
      else setError(outcome.error);
    });

  return (
    <div className="billingcard">
      <div>
        <strong>{planLabel}</strong>
        <p>
          {paid
            ? "Change or cancel any time. You keep the plan until the end of the period you've paid for."
            : "You're on the free plan. Nothing to manage — upgrade from Pricing when the cap starts to bite."}
        </p>
        {error && <p className="billingcard-error">{error}</p>}
      </div>

      {paid && (
        <button type="button" className="pill" onClick={open} disabled={pending}>
          {pending ? "Opening…" : "Manage billing"}
        </button>
      )}
    </div>
  );
}
