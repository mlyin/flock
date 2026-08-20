import ImportClient from "@/components/ImportClient";
import { getExternalListings } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Onboarding for a seller who already has a closet online.
 *
 * The alternative — "re-photograph two hundred garments" — is why sellers
 * bounce off cross-listers on day one.
 */
export default async function ImportPage() {
  const listings = await getExternalListings();

  return (
    <>
      <div className="pagehead">
        <h1>Bring your closet in</h1>
        <p>
          Read what you already have live on Depop and turn it into Flock garments, with the
          listing URLs already attached — so sale detection works from the first sync.
        </p>
      </div>

      <ImportClient listings={listings} depopUsername="" />
    </>
  );
}
