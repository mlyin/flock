-- Marketplace-shaped values alongside the human ones.
--
-- The model was asked for prose, and prose is what it gave: "faded black",
-- "British tan", "cotton blend". Good listing copy, useless for filling a form
-- — Vinted's colour list has "Cream" and no "Ivory", its material list has
-- "Cotton" and no "Cotton blend". So every fill left colour and material empty,
-- and Vinted refuses to publish without a colour at all.
--
-- Rather than teach each filler to guess at prose, record BOTH: the descriptive
-- value a buyer reads, and a normalised value a dropdown can match. The
-- descriptive one stays authoritative for copy; the normalised one exists only
-- to be matched against a fixed list.
alter table items add column if not exists color_primary text;
alter table items add column if not exists material_primary text;

comment on column items.color_primary is
  'Single normalised colour from a fixed vocabulary, for matching marketplace dropdowns. items.color stays the descriptive one used in listing copy.';

comment on column items.material_primary is
  'Single normalised material, same purpose as color_primary.';

-- department already exists (0010) but nothing ever populated it: it was added
-- as a column the seller could set, and inference never produced one. Every
-- Grailed fill therefore refused the category outright — correctly, since
-- guessing Menswear vs Womenswear is a coin flip on the most visible field in
-- the listing — and Vinted's category search returned mostly men's rows for a
-- women's garment. Inference fills it from 19 Aug 2026; this index is for the
-- filtering both fillers now do.
create index if not exists items_department_idx on items (user_id, department);
