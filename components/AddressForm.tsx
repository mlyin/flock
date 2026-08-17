"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAddress, type AddressRow } from "@/app/actions";
import type { AddressHit } from "@/lib/geocode";

/**
 * Address entry with a typeahead.
 *
 * Every field also carries its standard `autocomplete` token, so Chrome's own
 * saved-address autofill works whether or not the lookup does. That costs
 * nothing and covers the case where the provider is down.
 */
export default function AddressForm({
  address,
  onDone,
}: {
  address?: AddressRow;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState(address?.line1 ?? "");
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [fields, setFields] = useState({
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    postcode: address?.postcode ?? "",
    country: address?.country ?? "",
  });
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced so typing an address is a handful of requests, not one per key.
  useEffect(() => {
    if (query.trim().length < 3 || query === address?.line1) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const response = await fetch(`/api/address/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setHits(data.results ?? []);
        setOpen(true);
      } catch {
        // An aborted or failed lookup just means no suggestions; typing still works.
      } finally {
        setLooking(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, address?.line1]);

  // Clicking away closes the suggestions.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (hit: AddressHit) => {
    setQuery(hit.line1);
    setFields((current) => ({
      ...current,
      city: hit.city || current.city,
      state: hit.state || current.state,
      postcode: hit.postcode || current.postcode,
      country: hit.country || current.country,
    }));
    setOpen(false);
  };

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      action={async (formData) => {
        await saveAddress(formData);
        router.refresh();
        onDone?.();
      }}
      className="review"
    >
      {address && <input type="hidden" name="id" value={address.id} />}

      <div className="fieldgrid">
        <label className="field" htmlFor="label">
          <span className="field-label">Nickname</span>
          <input id="label" name="label" defaultValue={address?.label ?? ""} placeholder="Home" />
        </label>

        <label className="field" htmlFor="name">
          <span className="field-label">Full name</span>
          <input id="name" name="name" defaultValue={address?.name ?? ""} autoComplete="name" />
        </label>

        <div className="field typeahead" ref={box} style={{ gridColumn: "span 2" }}>
          <label className="field-label" htmlFor="line1">
            Address
            {looking && <span className="muted">searching…</span>}
          </label>
          <input
            id="line1"
            name="line1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => hits.length > 0 && setOpen(true)}
            autoComplete="address-line1"
            placeholder="Start typing and pick a match"
            required
          />
          {open && hits.length > 0 && (
            <ul className="suggestions">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" onClick={() => choose(hit)}>
                    <strong>{hit.line1}</strong>
                    <span>{[hit.city, hit.state, hit.postcode, hit.country].filter(Boolean).join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="field" htmlFor="line2" style={{ gridColumn: "span 2" }}>
          <span className="field-label">Apartment, unit, floor</span>
          <input
            id="line2"
            name="line2"
            value={fields.line2}
            onChange={set("line2")}
            autoComplete="address-line2"
          />
        </label>

        <label className="field" htmlFor="city">
          <span className="field-label">City</span>
          <input id="city" name="city" value={fields.city} onChange={set("city")} autoComplete="address-level2" />
        </label>

        <label className="field" htmlFor="state">
          <span className="field-label">State / region</span>
          <input id="state" name="state" value={fields.state} onChange={set("state")} autoComplete="address-level1" />
        </label>

        <label className="field" htmlFor="postcode">
          <span className="field-label">ZIP / postcode</span>
          <input
            id="postcode"
            name="postcode"
            value={fields.postcode}
            onChange={set("postcode")}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </label>

        <label className="field" htmlFor="country">
          <span className="field-label">Country</span>
          <input id="country" name="country" value={fields.country} onChange={set("country")} autoComplete="country-name" />
        </label>

        <label className="field" htmlFor="phone" style={{ gridColumn: "span 2" }}>
          <span className="field-label">Phone</span>
          <input id="phone" name="phone" defaultValue={address?.phone ?? ""} autoComplete="tel" inputMode="tel" />
        </label>
      </div>

      <label className="checkline" htmlFor="is_default">
        <input
          type="checkbox"
          id="is_default"
          name="is_default"
          defaultChecked={address?.is_default ?? true}
        />
        Use this as my default ship-from address
      </label>

      <div className="review-actions">
        <button type="submit" className="button">
          {address ? "Save changes" : "Add address"}
        </button>
        {onDone && (
          <button type="button" className="pill" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
