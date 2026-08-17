-- Closet — multi-tenant schema.
--
-- Two things changed moving off SQLite, and both are deliberate:
--
--   1. Every domain row carries user_id, and row-level security is ON everywhere.
--      Isolation is enforced by Postgres, not by remembering to write WHERE clauses.
--      A query that forgets the filter returns nothing rather than someone else's closet.
--
--   2. Money is numeric(10,2), never a float. SQLite's REAL was fine for fixtures;
--      it is not fine for a ledger people trust.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type item_status   as enum ('draft', 'listed', 'sold', 'donated');
create type review_state  as enum ('unreviewed', 'confirmed');
create type item_condition as enum ('nwt', 'excellent', 'good', 'fair');
create type channel       as enum ('ebay', 'poshmark', 'depop', 'mercari', 'vinted');
create type listing_status as enum ('draft', 'live', 'sold', 'ended', 'error');
create type photo_role    as enum ('hero', 'tag', 'flaw', 'detail');
create type fee_kind      as enum ('commission', 'payment', 'shipping', 'promo');

-- ---------------------------------------------------------------- profiles

-- Mirrors auth.users so we can hang app data off it and expose a display name
-- without granting the client access to the auth schema.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- items

create table items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  sku          text not null,
  title        text not null,
  brand        text,
  category     text not null default 'Other',
  size         text,
  color        text,
  swatch       text,
  material     text,
  condition    item_condition not null default 'good',
  flaws        jsonb not null default '[]'::jsonb,
  measurements jsonb,
  cost_basis   numeric(10, 2) not null default 0,
  acquired_at  date,
  source       text,
  status       item_status not null default 'draft',
  review_state review_state not null default 'confirmed',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- SKUs are per-seller. Two users both having CL-0001 is correct.
  unique (user_id, sku)
);

create index items_user_status_idx on items (user_id, status);
create index items_user_review_idx on items (user_id, review_state);

-- ---------------------------------------------------------------- photos

create table photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    uuid references items (id) on delete cascade,
  -- Object-storage key, not a filesystem path. Null item_id = uploaded but
  -- not yet identified: the inbox is now a query, not a folder.
  storage_path text not null,
  role       photo_role not null default 'hero',
  sort_order integer not null default 0,
  bytes      integer,
  created_at timestamptz not null default now()
);

create index photos_item_idx on photos (item_id, sort_order);
create index photos_unassigned_idx on photos (user_id, created_at) where item_id is null;

-- ---------------------------------------------------------------- listings

create table listings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  item_id        uuid not null references items (id) on delete cascade,
  channel        channel not null,
  external_id    text,
  url            text,
  title          text,
  description    text,
  price          numeric(10, 2) not null,
  shipping_price numeric(10, 2) not null default 0,
  status         listing_status not null default 'draft',
  error          text,
  posted_at      timestamptz,
  last_synced_at timestamptz,

  unique (item_id, channel)
);

create index listings_user_channel_idx on listings (user_id, channel, status);

-- ---------------------------------------------------------------- sales & fees

create table sales (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  listing_id         uuid not null references listings (id) on delete cascade,
  sold_price         numeric(10, 2) not null,
  shipping_collected numeric(10, 2) not null default 0,
  shipping_cost      numeric(10, 2) not null default 0,
  sold_at            timestamptz not null
);

create index sales_user_idx on sales (user_id, sold_at desc);

create table fees (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sale_id uuid not null references sales (id) on delete cascade,
  kind    fee_kind not null,
  label   text not null,
  amount  numeric(10, 2) not null
);

create index fees_sale_idx on fees (sale_id);

-- ---------------------------------------------------------------- inferences

-- Kept forever. When a brand comes back wrong this is the receipt, and a year of
-- these is how you judge whether the model is any good at your inventory.
create table inferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_id      uuid references items (id) on delete set null,
  model        text not null,
  fields       jsonb not null,
  confidence   jsonb,
  raw          text,
  input_tokens integer,
  output_tokens integer,
  created_at   timestamptz not null default now()
);

create index inferences_item_idx on inferences (item_id, created_at desc);

-- ---------------------------------------------------------------- channel accounts

-- OAuth tokens for channels that have a real API (eBay today). Deliberately NOT
-- readable by the browser client: the RLS policy below grants the owner select on
-- metadata, but tokens are only ever touched server-side via the service role.
--
-- TODO before real users: encrypt refresh_token at rest with a key held outside
-- the database, so a Postgres dump alone is not enough to act as a seller.
create table channel_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  channel       channel not null,
  external_user text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text,
  connected_at  timestamptz not null default now(),

  unique (user_id, channel)
);

-- ---------------------------------------------------------------- row-level security

alter table profiles         enable row level security;
alter table items            enable row level security;
alter table photos           enable row level security;
alter table listings         enable row level security;
alter table sales            enable row level security;
alter table fees             enable row level security;
alter table inferences       enable row level security;
alter table channel_accounts enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- One policy shape, applied to every user-scoped table.
do $$
declare t text;
begin
  foreach t in array array['items', 'photos', 'listings', 'sales', 'fees', 'inferences']
  loop
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end;
$$;

-- Tokens are the exception: the owner may see that a channel is connected and
-- disconnect it, but the row is only ever read in full by the service role,
-- which bypasses RLS.
create policy "own channel accounts" on channel_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- housekeeping

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- Per-user sequential SKUs. Called inside the insert path rather than a default so
-- it can see the caller's existing numbering.
create or replace function next_sku(p_user uuid)
returns text language sql stable as $$
  select 'CL-' || lpad((
    coalesce(max(nullif(regexp_replace(sku, '\D', '', 'g'), '')::int), 0) + 1
  )::text, 4, '0')
  from items where user_id = p_user;
$$;
