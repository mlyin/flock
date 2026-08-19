-- The SKU becomes the seller's field, not a counter we impose.
--
-- `sku` held an auto-generated CL-0001, CL-0002, … which carried meaning it
-- hadn't earned. Two problems with that:
--
--   1. The real identifier already exists. items.id is a uuid and always was;
--      nothing in the app looks a garment up by sku. It was decoration on top
--      of a key that already worked.
--   2. Garments have real SKUs and style codes. Occupying the field called
--      `sku` with a generated counter means there is nowhere to put the actual
--      one — and StockX and GOAT are keyed on style code, so that field is a
--      prerequisite for those channels, not a nicety.
--
-- So: nullable, and free for the seller to type the manufacturer's code into.
-- The generated value stays as a default for the common case where a garment
-- has no code worth recording, because a short human handle is genuinely useful
-- when you're holding the thing and looking for its row.
alter table items alter column sku drop not null;

comment on column items.sku is
  'The seller''s reference. Defaults to a generated CL-0001 style counter, but is meant to be overwritten with the garment''s real SKU or style code when it has one. Never used to look an item up — items.id is the identifier.';

-- The uniqueness constraint has to tolerate nulls and duplicates now: two
-- unrelated garments can legitimately carry the same manufacturer style code,
-- and a seller who clears the field should not be blocked by a second blank.
alter table items drop constraint if exists items_user_id_sku_key;
