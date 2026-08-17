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
      <div className="sectionhead">
        <h2>Ship-from addresses</h2>
        <p>Every marketplace asks for one — store them here</p>
      </div>

      <AddressBook addresses={(data ?? []) as AddressRow[]} />
    </>
  );
}
