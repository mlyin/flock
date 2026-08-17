import { saveShippingAddress } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FIELDS = [
  { name: "ship_name", label: "Full name", span: 2 },
  { name: "ship_line1", label: "Address line 1", span: 2 },
  { name: "ship_line2", label: "Address line 2", span: 2 },
  { name: "ship_city", label: "City" },
  { name: "ship_state", label: "State / region" },
  { name: "ship_postcode", label: "ZIP / postcode" },
  { name: "ship_country", label: "Country" },
  { name: "ship_phone", label: "Phone", span: 2 },
] as const;

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle();

  const value = (key: string) => (profile as Record<string, string> | null)?.[key] ?? "";
  const complete = Boolean(profile?.ship_line1 && profile?.ship_city && profile?.ship_postcode);

  return (
    <>
      <div className="sectionhead">
        <h2>Ship-from address</h2>
        <p>Every marketplace asks for this — store it once</p>
      </div>

      <div className={complete ? "notice notice-good" : "notice notice-warn"}>
        <strong>{complete ? "Address saved" : "Not set yet"}</strong>
        <p>
          {complete
            ? "The extension fills this into Depop and Mercari when they ask for a shipping address."
            : "Depop and Mercari both block a listing until a ship-from address exists on the account. Fill this in and the extension enters it for you."}
        </p>
      </div>

      <form action={saveShippingAddress} className="review">
        <div className="fieldgrid">
          {FIELDS.map((field) => (
            <label
              key={field.name}
              className="field"
              htmlFor={field.name}
              style={"span" in field && field.span === 2 ? { gridColumn: "span 2" } : undefined}
            >
              <span className="field-label">{field.label}</span>
              <input id={field.name} name={field.name} defaultValue={value(field.name)} />
            </label>
          ))}
        </div>

        <div className="review-actions">
          <button type="submit" className="button">
            Save address
          </button>
          <span className="muted">
            Stored on your profile and visible only to you. Used to fill marketplace forms —
            never shared anywhere else.
          </span>
        </div>
      </form>
    </>
  );
}
