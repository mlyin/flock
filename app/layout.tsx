import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import PushSetup from "@/components/PushSetup";
import { currentUser } from "@/lib/supabase/server";
import { standing } from "@/lib/plan";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flock",
  description: "Inventory, listings, and what you actually netted.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // Added to the home screen on iOS, Flock runs without Safari chrome. iOS
  // ignores the manifest for this and reads these tags instead, so both have
  // to be present or it opens in a browser tab like any bookmark.
  appleWebApp: {
    capable: true,
    title: "Flock",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the page reach under the notch and home indicator; globals.css pays
  // that back with safe-area padding so nothing lands under the hardware.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F1" },
    { media: "(prefers-color-scheme: dark)", color: "#12140D" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  // Null when signed out or before Supabase is configured; the chip simply
  // does not render rather than the shell failing to.
  const where = user ? await standing() : null;

  // The login page and the signed-out landing page render bare.
  const showShell = Boolean(user);

  return (
    /* suppressHydrationWarning is for our OWN extension: bridge.js stamps
       data-threader-extension on <html> before React hydrates, so the server
       markup and the client tree differ by one attribute and React logs a
       hydration mismatch on every page load. Suppression applies to this
       element only — a real mismatch anywhere inside still reports. */
    <html lang="en" suppressHydrationWarning>
      <body>
        {showShell ? (
          <div className="shell">
            <PushSetup vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
            <Nav
              email={user?.email ?? null}
              // Google sends full_name/name and picture/avatar_url; Apple
              // sends a name only on first authorisation. Read both spellings
              // rather than assuming one provider's.
              name={
                (user?.user_metadata?.full_name as string | undefined) ??
                (user?.user_metadata?.name as string | undefined) ??
                null
              }
              avatar={
                (user?.user_metadata?.avatar_url as string | undefined) ??
                (user?.user_metadata?.picture as string | undefined) ??
                null
              }
              plan={
                where
                  ? {
                      label: where.plan.label,
                      beta: where.beta,
                      active: where.active,
                      remaining: where.remaining,
                    }
                  : null
              }
            />
            {children}
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
