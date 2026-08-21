-- What garments like this one actually sold for.
--
-- Every price in Flock has been a language model's opinion. The prompt says so
-- out loud -- "you have no sold-comp data, only the garment and your own sense
-- of the resale market" -- which is honest, but the seller still prices a real
-- garment by it. CLAUDE.md has listed "pricing is an admitted model guess with
-- no sold comps" as a known gap since the beginning, blocked on eBay's
-- developer approval, which was rejected.
--
-- It turns out not to need approval. eBay publishes completed sales on a
-- public search page (&LH_Sold=1&LH_Complete=1). The extension reads it the
-- same way it reads the seller's Depop shop.
--
-- Stored on the item rather than recomputed because a comp read opens a tab
-- and takes a few seconds, and because comps_at is what tells a seller whether
-- they are looking at this week's market or last quarter's.
alter table items add column if not exists comps jsonb;
alter table items add column if not exists comps_at timestamptz;

comment on column items.comps is
  'Summary of completed eBay sales for this garment: {n, median, p25, p75, low, high, discarded, query, reportedTotal}. Written by lib/comps.ts via the extension. Null means nobody has looked yet -- which is different from "nothing sells", and the UI must say which.';
comment on column items.comps_at is
  'When the comps were read. eBay keeps roughly 90 days of completed sales, so a stale read describes a market that no longer exists.';
