import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { currentUser, supabaseConfigured } from "@/lib/supabase/server";
import { standing } from "@/lib/plan";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flock",
  description: "Inventory, listings, and what you actually netted.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  // Null when signed out or before Supabase is configured; the chip simply
  // does not render rather than the shell failing to.
  const where = user ? await standing() : null;

  // The login page renders bare. In local SQLite mode there's no auth at all,
  // so the shell stays up regardless.
  const showShell = !supabaseConfigured() || Boolean(user);

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
            <Nav
              email={user?.email ?? null}
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
