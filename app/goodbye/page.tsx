import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account deleted — Flock",
  description: "Your Flock account and everything in it has been deleted.",
};

/**
 * Where deleteAccount lands.
 *
 * Public, because by the time someone reaches it they have no account and the
 * middleware would bounce them to /login — which reads as the delete having
 * failed.
 */
export default function GoodbyePage() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <strong>Flock</strong>
          <span>Account deleted</span>
        </div>

        <p className="gate-pitch">
          Everything is gone — garments, listings, sales, photos and messages. Any subscription
          was cancelled before the account was removed.
        </p>

        <p className="gate-fine">
          Your listings on Depop, Vinted and everywhere else are untouched; those live in your
          own marketplace accounts. If you installed the browser extension, remove it at{" "}
          <code>chrome://extensions</code> — its pairing token no longer works, but the
          extension itself is still there.
        </p>

        <p className="gate-fine">
          Changed your mind? <Link href="/login" className="link">Sign in</Link> starts a
          completely new account. Nothing from the old one comes back.
        </p>
      </div>
    </div>
  );
}
