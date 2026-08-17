-- What's already live out there.
--
-- Distinct from `listings`, and deliberately so. A `listing` is something
-- Threader created from an item it knows about. An `external_listing` is
-- something we found on a marketplace — it may predate Threader entirely, may
-- never match an item, and may be someone's decade-old closet.
--
-- Keeping them apart means the item/listing model stays clean while still
-- letting the dashboard answer "what do I actually have live, everywhere?".
-- Matching is a separate, reversible step: item_id starts null.

create table external_listings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  channel       channel not null,

  -- The marketplace's own id. Together with channel this is the natural key —
  -- re-importing updates rather than duplicating.
  external_id   text not null,
  url           text,
  title         text,
  price         numeric(10, 2),
  currency      text default 'USD',
  photo_url     text,

  -- active | sold | ended — normalised by the scraper, since every platform
  -- words it differently.
  status        text not null default 'active',

  -- Set once matched to a Threader item, by hand or by the matcher.
  item_id       uuid references items (id) on delete set null,
  matched_at    timestamptz,

  -- Whatever else the scraper saw. Platforms differ too much to model up front,
  -- and throwing it away means re-scraping to answer a new question later.
  raw           jsonb,

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  unique (user_id, channel, external_id)
);

create index external_listings_user_channel_idx on external_listings (user_id, channel, status);
create index external_listings_unmatched_idx on external_listings (user_id) where item_id is null;

alter table external_listings enable row level security;

create policy "own external listings" on external_listings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- When each channel was last read, so the UI can say "synced 2 hours ago"
-- rather than leaving the seller guessing whether the number is current.
create table channel_syncs (
  user_id      uuid not null references auth.users (id) on delete cascade,
  channel      channel not null,
  last_sync_at timestamptz not null default now(),
  found        integer not null default 0,
  error        text,

  primary key (user_id, channel)
);

alter table channel_syncs enable row level security;

create policy "own channel syncs" on channel_syncs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
