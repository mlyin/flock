import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline — Flock" };

/**
 * Served by the service worker when a navigation fails. Public in middleware,
 * because someone offline can't be authenticated either.
 */
export default function OfflinePage() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <strong>No connection</strong>
          <span>Flock</span>
        </div>
        <p className="gate-pitch">
          Photos you&apos;ve already taken are safe on your phone — nothing is lost. Sourcing in a
          basement with no signal is normal; open Flock again once you&apos;re back in range and
          carry on where you stopped.
        </p>
        <p className="gate-fine">Pages you&apos;ve already opened will still load from cache.</p>
      </div>
    </div>
  );
}
