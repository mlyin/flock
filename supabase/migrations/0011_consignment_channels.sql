-- TheRealReal and Facebook Marketplace join the channel list.
--
-- Two new values, and one new idea: custody.
--
-- Every channel so far has been non-exclusive. You list the same jacket on
-- Depop, Vinted and Grailed at once, the first buyer wins, and you pull the
-- rest down. That works because the jacket is in your closet the whole time.
--
-- TheRealReal is consignment: you physically ship the item to them, they
-- authenticate, photograph, price and sell it. While it's in their warehouse
-- you cannot fulfil a sale anywhere else — there is nothing to post. Listing a
-- consigned item on another channel isn't a bad idea, it's an oversell, and the
-- seller finds out when a Depop buyer pays for something 2,000 miles away.
--
-- So custody is a property of the item, not of a listing.
alter type channel add value if not exists 'therealreal';
alter type channel add value if not exists 'facebook';

-- Where the garment physically is.
--
--   'hand'      in your closet, free to list anywhere        (default)
--   'consigned' shipped to a consignor, not yours to sell
--   'returned'  came back unsold, free again
--
-- Nullable-free with a default, because every existing row is in hand by
-- definition — nothing has been consigned before this migration exists.
alter table items add column if not exists custody text not null default 'hand';

alter table items drop constraint if exists items_custody_check;
alter table items add constraint items_custody_check
  check (custody in ('hand', 'consigned', 'returned'));

comment on column items.custody is
  'hand | consigned | returned. Anything but hand means the item is not physically here, so it must not be listed on a channel that requires you to ship it.';

-- Which consignor holds it, and since when. Null unless custody = consigned.
alter table items add column if not exists consigned_to channel;
alter table items add column if not exists consigned_at timestamptz;

comment on column items.consigned_to is
  'The consignment channel currently holding this item. Null when custody is hand.';

-- Finding everything currently out on consignment is a question the inbox and
-- inventory both ask, and it should not be a sequential scan once there are a
-- few hundred items.
create index if not exists items_consigned_idx
  on items (user_id, consigned_to)
  where custody = 'consigned';
