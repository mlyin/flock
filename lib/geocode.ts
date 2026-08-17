/**
 * Address lookup.
 *
 * Deliberately behind one function so the provider is a swap, not a rewrite.
 * Photon is OpenStreetMap-backed, needs no API key, and is built for
 * as-you-type search — right for now.
 *
 * Before real volume, move to a paid provider (Google Places, Mapbox, Radar).
 * Photon's public instance is a courtesy service with no uptime guarantee and a
 * fair-use expectation; the only thing that should need changing is `search()`.
 */

export type AddressHit = {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

type PhotonFeature = {
  properties: {
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

const clean = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" ").trim();

export async function search(query: string, signal?: AbortSignal): Promise<AddressHit[]> {
  if (query.trim().length < 3) return [];

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");

  const response = await fetch(url, {
    signal,
    // Photon's usage policy asks callers to identify themselves.
    headers: { "User-Agent": "Threader/0.1 (getthreader.com)" },
  });

  if (!response.ok) throw new Error(`Address lookup failed (${response.status})`);

  const data = (await response.json()) as { features?: PhotonFeature[] };

  return (data.features ?? [])
    .map((feature, index): AddressHit => {
      const p = feature.properties;
      const line1 = clean([p.housenumber, p.street ?? p.name]);
      const city = p.city ?? p.town ?? p.village ?? p.district ?? "";

      return {
        id: String(p.osm_id ?? index),
        label: [line1, city, p.state, p.postcode, p.country].filter(Boolean).join(", "),
        line1,
        city,
        state: p.state ?? "",
        postcode: p.postcode ?? "",
        country: p.country ?? "",
      };
    })
    // A hit with no street line can't fill a shipping form.
    .filter((hit) => hit.line1.length > 0);
}
