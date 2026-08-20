"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker, and — separately — offers notifications.
 *
 * The two are deliberately not the same step. Offline caching should just
 * happen; notifications are a permission you only get to ask for once, and
 * asking on page load is how people say no forever. So the prompt appears as a
 * dismissible strip, and only where it can actually work: iOS refuses
 * Notification.requestPermission() outside a home-screen install, so on iPhone
 * this stays hidden until Flock has been added to the home screen.
 */

const DISMISSED = "flock.push.dismissed";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushSetup({ vapidKey }: { vapidKey: string | null }) {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      if (!vapidKey || !("PushManager" in window)) return;
      if (Notification.permission !== "default") return;
      if (localStorage.getItem(DISMISSED)) return;

      // iOS only allows the permission prompt from a home-screen install.
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // Safari's own flag, which predates the standard media query.
        (window.navigator as { standalone?: boolean }).standalone === true;
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      if (isIOS && !standalone) return;

      const existing = await registration.pushManager.getSubscription();
      if (!existing) setOffer(true);
    });
  }, [vapidKey]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setOffer(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't save it.");
      setOffer(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!offer) return null;

  return (
    <div className="pushbar">
      <div>
        <strong>Get told when a buyer messages</strong>
        <p>
          {error ?? "One notification per conversation, not per message. Nothing else."}
        </p>
      </div>
      <div className="pushbar-actions">
        <button
          type="button"
          className="pill"
          onClick={() => {
            localStorage.setItem(DISMISSED, "1");
            setOffer(false);
          }}
        >
          Not now
        </button>
        <button type="button" className="button" onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Turn on"}
        </button>
      </div>
    </div>
  );
}
