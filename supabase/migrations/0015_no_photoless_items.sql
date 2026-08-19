-- A garment in the inventory must have at least one photo.
--
-- CL-0003 was an Oakley tee with zero photos: two identify calls read the inbox
-- at the same moment, both saw the same free photos, both created an item, and
-- only one of them won the photos. The loser stayed in the inventory as a
-- garment that could never be listed anywhere, because every marketplace
-- requires an image.
--
-- The application now claims photos atomically and rolls back an item that got
-- none. This is the backstop for that: a check in the database means no future
-- code path — a new intake route, a script, a manual insert — can reintroduce
-- the same row.
--
-- Deferred to the end of the transaction, because the item is inserted before
-- its photos are attached and both happen in one unit of work.
create or replace function item_has_photo() returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from photos where item_id = new.id) then
    raise exception 'Item % has no photos. Every marketplace requires at least one image, so a garment without one cannot be listed.', new.sku
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_require_photo on items;

create constraint trigger items_require_photo
  after insert on items
  deferrable initially deferred
  for each row
  execute function item_has_photo();

-- Clean up what the race already produced. Only items with no photos at all,
-- and only ones that were never listed anywhere — an item with a live listing
-- is a real thing in the world whatever its photo count, and deleting it here
-- would just make Flock forget about something still for sale.
delete from items i
where not exists (select 1 from photos p where p.item_id = i.id)
  and not exists (select 1 from listings l where l.item_id = i.id and l.status <> 'draft');
