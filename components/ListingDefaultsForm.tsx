"use client";

import { useState } from "react";
import { saveListingDefaults, type ListingDefaultsRow } from "@/app/actions";

/**
 * The paragraphs a seller repeats on every garment — shipping terms, returns,
 * a sign-off. Written once here instead of retyped two hundred times.
 *
 * Deliberately not a template library. What sellers actually repeat is one
 * block of standing terms; a list of named templates is another thing to
 * manage, and every competitor that ships one has made the seller curate it.
 */
export default function ListingDefaultsForm({ defaults }: { defaults: ListingDefaultsRow }) {
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        await saveListingDefaults(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }}
      className="defaultsform"
    >
      <label className="field" htmlFor="preamble">
        <span className="field-label">Opening line — optional</span>
        <textarea
          id="preamble"
          name="preamble"
          rows={2}
          defaultValue={defaults.preamble ?? ""}
          placeholder="Ships same day · Bundle 3+ for 15% off"
        />
      </label>

      <label className="field" htmlFor="footer">
        <span className="field-label">Standing terms — added under every listing</span>
        <textarea
          id="footer"
          name="footer"
          rows={4}
          defaultValue={defaults.footer ?? ""}
          placeholder={"Ships within 2 business days from Seattle.\nSmoke-free home. Measurements on request.\nNo returns — please ask anything before buying."}
        />
      </label>

      <div className="review-actions">
        <button type="submit" className="button">
          {saved ? "Saved" : "Save standing text"}
        </button>
        <span className="muted">
          Applies to listings drafted from here on. Existing drafts keep the copy they
          already have.
        </span>
      </div>
    </form>
  );
}
