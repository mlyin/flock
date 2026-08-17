-- Facts the marketplaces demand that no photo can tell you.
--
-- Depop and Mercari both require a package size before they'll accept a
-- listing, and it's a property of the physical parcel, not the garment. Without
-- it stored here the form can never be completed unattended.
alter table items add column if not exists package_size text;
alter table items add column if not exists depop_category text;
