-- Make the custody rule a fact about the database, not a habit of the callers.
--
-- 0011 introduced items.custody with a clear comment: an item that is not
-- physically here must not be listed on a channel that requires shipping it.
-- Then nothing read the column. The rule has been documented and unenforced
-- ever since, and there are now several paths that create listings --
-- prepareListings, createBasicListings, adoptExternalListing, bulkDraftListings
-- -- so "remember to check" has four places to be forgotten and will grow a
-- fifth.
--
-- This is the same reasoning as row-level security doing tenant isolation:
-- put the invariant where forgetting it fails loudly, rather than where
-- forgetting it silently does the wrong thing. An oversell is not a validation
-- error the seller sees, it is a buyer paying for a garment 2,000 miles away
-- and a cancellation days later.
create or replace function guard_consigned_listing()
returns trigger
language plpgsql
as $$
declare
  item_custody text;
  holder       text;
begin
  select custody, consigned_to::text into item_custody, holder
  from items where id = new.item_id;

  if item_custody is distinct from 'consigned' then
    return new;
  end if;

  -- Listing it with the consignor holding it IS the consignment.
  if holder is not null and new.channel::text = holder then
    return new;
  end if;

  raise exception
    'Item % is out on consignment with %; it cannot be listed on %.',
    new.item_id, coalesce(holder, 'a consignor'), new.channel
    using errcode = 'check_violation',
          hint = 'Mark it returned once the consignor sends it back.';
end;
$$;

-- Insert AND update: moving an existing draft onto a different channel is the
-- same oversell as creating one there.
drop trigger if exists listings_respect_custody on listings;
create trigger listings_respect_custody
  before insert or update of channel, item_id on listings
  for each row execute function guard_consigned_listing();

-- The other direction. Consigning an item that is already live somewhere is
-- equally an oversell -- the box goes to the warehouse while a Depop listing
-- stays up. Catch it at the moment custody changes rather than letting the
-- two states quietly disagree.
create or replace function guard_custody_change()
returns trigger
language plpgsql
as $$
declare
  live_elsewhere text;
begin
  if new.custody is not distinct from old.custody then
    return new;
  end if;

  if new.custody = 'consigned' then
    select string_agg(distinct channel::text, ', ') into live_elsewhere
    from listings
    where item_id = new.id
      and status = 'live'
      and channel::text is distinct from new.consigned_to::text;

    if live_elsewhere is not null then
      raise exception
        'Item % is still live on %; take those down before consigning it.',
        new.id, live_elsewhere
        using errcode = 'check_violation',
              hint = 'A consigned garment cannot be shipped to a buyer elsewhere.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists items_custody_change on items;
create trigger items_custody_change
  before update of custody on items
  for each row execute function guard_custody_change();

comment on function guard_consigned_listing() is
  'Refuses a listing on any channel other than the consignor currently holding the item. See lib/custody.ts for the same rule in app code, which exists to give a readable error before the database gives an unreadable one.';
