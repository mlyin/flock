import Link from "next/link";
import AddressBook from "@/components/AddressBook";
import type { AddressRow } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at");

  return (
    <>
      <div className="pagehead">
        <h1>Settings</h1>
        <p>Addresses, the browser extension, and the fee table every net figure rests on.</p>
      </div>

      {/* Fees and the extension used to be top-level nav items. They're
          reference and one-time setup, so they live here now. */}
      <div className="settingslinks">
        <Link href="/connect" className="settingslink">
          <strong>Browser extension</strong>
          <span>Pair Chrome so Flock can fill marketplace forms for you</span>
        </Link>
        <a href="/api/export" className="settingslink">
          <strong>Export everything (CSV)</strong>
          <span>Every garment, listing and sale — fee-adjusted, for bookkeeping</span>
        </a>
        <Link href="/fees" className="settingslink">
          <strong>Fee table</strong>
          <span>What each channel takes. Every rate is still unverified</span>
        </Link>
      </div>

      <div className="sectionhead">
        <h2>Ship-from addresses</h2>
        <p>Every marketplace asks for one — store them here</p>
      </div>

      <AddressBook addresses={(data ?? []) as AddressRow[]} />
    </>
  );
}
