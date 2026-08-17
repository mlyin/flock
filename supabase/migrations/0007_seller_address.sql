-- The seller's ship-from address.
--
-- Every marketplace asks for the same thing, so it belongs on the profile
-- rather than being retyped per site. Row-level security already restricts
-- profiles to their owner.
alter table profiles add column if not exists ship_name      text;
alter table profiles add column if not exists ship_line1     text;
alter table profiles add column if not exists ship_line2     text;
alter table profiles add column if not exists ship_city      text;
alter table profiles add column if not exists ship_state     text;
alter table profiles add column if not exists ship_postcode  text;
alter table profiles add column if not exists ship_country   text;
alter table profiles add column if not exists ship_phone     text;
