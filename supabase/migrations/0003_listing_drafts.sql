-- Channel-specific listing extras that don't deserve their own columns:
-- eBay item specifics and category path, Depop tags, and the price reasoning.
-- Shape differs per channel by design, so it lives as jsonb rather than a union
-- of mostly-null columns.

alter table listings add column if not exists draft jsonb;

-- Where the copy came from, so a bad listing can be traced back to a model run
-- the same way a bad identification can.
alter table listings add column if not exists drafted_by text;
alter table listings add column if not exists drafted_at timestamptz;
