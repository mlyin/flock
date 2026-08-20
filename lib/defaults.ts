import type { Channel } from "./fees";

/**
 * Standing listing text — the boilerplate a seller writes once.
 *
 * Kept as a pure function so it is testable without a database: the caller
 * fetches the row, this decides what the description becomes. Every rule here
 * is about ORDER, and order is the whole point — a buyer must read what the
 * garment IS before they read your shipping terms.
 */

export type ListingDefaults = {
  footer: string | null;
  preamble: string | null;
  /** Channel-keyed overrides; a present key replaces the global for that channel. */
  per_channel: Partial<Record<Channel, { footer?: string | null; preamble?: string | null }>>;
};

export const EMPTY_DEFAULTS: ListingDefaults = { footer: null, preamble: null, per_channel: {} };

/** Coerce whatever the database hands back into the shape above. */
export function parseDefaults(row: unknown): ListingDefaults {
  if (!row || typeof row !== "object") return EMPTY_DEFAULTS;
  const r = row as Record<string, unknown>;
  const per = r.per_channel;
  return {
    footer: typeof r.footer === "string" && r.footer.trim() ? r.footer : null,
    preamble: typeof r.preamble === "string" && r.preamble.trim() ? r.preamble : null,
    per_channel:
      per && typeof per === "object" && !Array.isArray(per)
        ? (per as ListingDefaults["per_channel"])
        : {},
  };
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Wrap a garment's description in the seller's standing text.
 *
 * A channel override REPLACES the global rather than adding to it — a Depop
 * footer and an eBay footer are alternatives, and concatenating them would put
 * both on the same listing, which is never what anyone meant.
 */
export function applyDefaults(
  description: string,
  defaults: ListingDefaults,
  channel: Channel
): string {
  const override = defaults.per_channel?.[channel];

  // `in` rather than truthiness: an override explicitly set to empty string is
  // a deliberate "no footer on this channel", and must beat the global.
  const preamble = clean(
    override && "preamble" in override ? override.preamble : defaults.preamble
  );
  const footer = clean(override && "footer" in override ? override.footer : defaults.footer);

  return [preamble, description.trim(), footer].filter(Boolean).join("\n\n");
}
