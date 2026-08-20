import Link from "next/link";
import AddressBook from "@/components/AddressBook";
import BillingCard from "@/components/BillingCard";
import ListingDefaultsForm from "@/components/ListingDefaultsForm";
import { getListingDefaults } from "@/app/actions";
import { standing } from "@/lib/plan";
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

  const where = await standing();
  const listingDefaults = await getListingDefaults();

  return (
    <>
      <div className="pagehead">
        <h1>Settings</h1>
        <p>Addresses, the browser extension, and the fee table every net figure rests on.</p>
      </div>

      {where && <BillingCard planLabel={where.plan.label} paid={where.plan.monthly > 0} />}

      {/* Fees and the extension used to be top-level nav items. They're
          reference and one-time setup, so they live here now. */}
      <div className="settingslinks">
        <Link href="/connect" className="settingslink">
          <strong>Browser extension</strong>
          <span>Pair Chrome so Flock can fill marketplace forms for you</span>
        </Link>
        <Link href="/import" className="settingslink">
          <strong>Bring your closet in</strong>
          <span>Read what you already have live on Depop and adopt it</span>
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
        <h2>Standing listing text</h2>
        <p>Written once, added to every listing you draft</p>
      </div>
      <ListingDefaultsForm defaults={listingDefaults} />


      <div className="sectionhead">
        <h2>Ship-from addresses</h2>
        <p>Every marketplace asks for one — store them here</p>
      </div>

      <AddressBook addresses={(data ?? []) as AddressRow[]} />
    </>
  );
}
