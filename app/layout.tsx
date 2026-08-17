import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { currentUser, supabaseConfigured } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threader",
  description: "Inventory, listings, and what you actually netted.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  // The login page renders bare. In local SQLite mode there's no auth at all,
  // so the shell stays up regardless.
  const showShell = !supabaseConfigured() || Boolean(user);

  return (
    <html lang="en">
      <body>
        {showShell ? (
          <div className="shell">
            <Nav email={user?.email ?? null} />
            {children}
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
