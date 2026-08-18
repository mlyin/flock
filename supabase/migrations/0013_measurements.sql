-- Measurements, because every marketplace asks and none of them had anywhere
-- to read one from.
--
-- Vinted's form has Shoulder Width and Length. Grailed's own copy convention is
-- to state pit-to-pit and length, and the generated Grailed description already
-- writes "[pit to pit: __]" placeholders for the seller to fill in by hand.
-- Depop and Poshmark buyers ask in messages, which is a conversation per item
-- that a number in the listing would have prevented.
--
-- jsonb rather than a column per measurement: which ones matter depends on the
-- garment. A pullover needs pit-to-pit, length and sleeve; jeans need waist,
-- inseam and rise; a dress needs none of those. Fifteen mostly-null columns
-- would be a wide table describing a narrow fact.
--
-- Inches, always. Vinted's fields are labelled "in", and a unit stored per item
-- is a unit somebody eventually forgets to convert.
alter table items add column if not exists measurements jsonb not null default '{}'::jsonb;

comment on column items.measurements is
  'Garment measurements in INCHES, keyed by name: pit_to_pit, length, shoulder, sleeve, waist, inseam, rise, hem. Only the ones that apply. Never inferred from a photo — a wrong measurement is worse than a missing one, because a buyer acts on it.';

-- Finding items that still need measuring is a real question once there are
-- more than a handful, and '{}' is the "not measured" state.
create index if not exists items_unmeasured_idx
  on items (user_id)
  where measurements = '{}'::jsonb;
