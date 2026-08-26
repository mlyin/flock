"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/account-actions";

/**
 * Account deletion, from inside the product.
 *
 * Apple's Guideline 5.1.1(v) requires this of any app that lets people create
 * an account, and names "contact us to delete" as insufficient. It should have
 * existed regardless — "we'll delete it if you ask" is not a deletion feature.
 *
 * Behind a disclosure, because it is not something to put a button for next to
 * Export. Typed confirmation rather than a second click: this is the only
 * action in Flock that nobody can undo afterwards, including us.
 */
export default function DeleteAccount({ hasSubscription }: { hasSubscription: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const armed = confirmation.trim().toLowerCase() === "delete my account";

  return (
    <details className="disclose">
      <summary>Delete my account</summary>

      <div className="notice notice-bad">
        <strong>This cannot be undone</strong>
        <p>
          Every garment, listing, sale, photo and message is deleted, and we cannot restore any
          of it afterwards. Your listings on Depop, Vinted and anywhere else are{" "}
          <strong>not</strong> touched — they live in your marketplace accounts, not here, and
          you would need to take those down yourself.
        </p>
        <p>
          {hasSubscription
            ? "Your subscription is cancelled first. If that fails, nothing is deleted and you'll be told."
            : "You have no active subscription, so there is nothing to cancel."}
        </p>
        <p className="muted">
          Want the data first? <a href="/api/export" className="link">Export everything as CSV</a>{" "}
          — it takes a second and it is the only copy you will get.
        </p>
      </div>

      {error && (
        <div className="notice notice-bad">
          <strong>Nothing was deleted</strong>
          <p>{error}</p>
        </div>
      )}

      <label className="field">
        <span className="field-label">
          Type <code>delete my account</code> to confirm
        </span>
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="delete my account"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="qrow-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="button"
          disabled={!armed || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const outcome = await deleteAccount(confirmation);
              // A successful delete redirects, so reaching here means it failed.
              if (outcome && !outcome.ok) setError(outcome.error);
            })
          }
        >
          {pending ? "Deleting…" : "Delete my account permanently"}
        </button>
      </div>
    </details>
  );
}
