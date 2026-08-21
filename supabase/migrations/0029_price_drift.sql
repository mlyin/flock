-- What the marketplace actually shows, next to what Flock thinks it shows.
--
-- Every net figure in the product is computed from listings.price. Nothing
-- ever checked that number against the marketplace, and there are two ways
-- for them to part company, both silent:
--
--   1. The seller drops a price in Flock. Flock cannot write to a marketplace
--      form, so the listing keeps its old price for buyers while the dashboard
--      projects proceeds from the new one.
--   2. The seller edits the price on Depop directly. Flock never hears, and
--      goes on judging offers against a floor derived from a price that has
--      not existed for a week.
--
-- The shop read already carries the marketplace's price, so both cases are
-- detectable for free on a sync we already do. Recording it here rather than
-- in a tasks table means the queue is a query -- a listing leaves it the
-- moment a later read shows the two agreeing, with nothing to clean up.
--
-- Flock does not guess which side is right. It says they disagree and asks.
alter table listings add column if not exists market_price numeric(10,2);
alter table listings add column if not exists market_price_at timestamptz;

-- The market price the seller has already looked at and accepted. Cleared by
-- the marketplace moving again: a seller who deliberately runs a different
-- number on one channel should be asked once, not every sync -- but if that
-- number changes, it is a new fact and worth raising again.
alter table listings add column if not exists price_drift_ack numeric(10,2);

comment on column listings.market_price is
  'Last price seen on the marketplace itself, from a shop read. Null means never read. Disagreeing with listings.price is what raises a drift question -- see lib/drift.ts.';

create index if not exists listings_price_drift_idx
  on listings (user_id)
  where status = 'live' and market_price is not null;
