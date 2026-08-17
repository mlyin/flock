-- Ship-from addresses.
--
-- Started as columns on profiles, which only ever allowed one. Sellers ship
-- from home, from storage, from a partner's place — so it's a table.

create table addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text,
  name       text,
  line1      text not null,
  line2      text,
  city       text,
  state      text,
  postcode   text,
  country    text,
  phone      text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index addresses_user_idx on addresses (user_id, is_default desc, created_at);

alter table addresses enable row level security;
create policy "own addresses" on addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Exactly one default per seller, enforced by the database rather than by
-- remembering to clear the others.
create unique index addresses_one_default on addresses (user_id) where is_default;

-- Carry over anything already entered on the profile.
insert into addresses (user_id, label, name, line1, line2, city, state, postcode, country, phone, is_default)
select id, 'Home', ship_name, ship_line1, ship_line2, ship_city, ship_state,
       ship_postcode, ship_country, ship_phone, true
from profiles
where ship_line1 is not null and ship_line1 <> '';

alter table profiles
  drop column if exists ship_name,
  drop column if exists ship_line1,
  drop column if exists ship_line2,
  drop column if exists ship_city,
  drop column if exists ship_state,
  drop column if exists ship_postcode,
  drop column if exists ship_country,
  drop column if exists ship_phone;
