-- When one channel sells it, the others have to come down.
--
-- This is the single worst failure mode in cross-listing and every competitor
-- treats it as the headline feature. A garment listed on five marketplaces is
-- one physical object: the moment it sells on Depop, the Vinted and Grailed
-- listings are promises the seller can no longer keep. A second buyer pays,
-- waits, and gets a cancellation — which on most platforms costs the seller a
-- defect, a rating hit, or account standing.
--
-- Flock cannot take the listings down itself. Delisting is a destructive
-- action inside someone else's account, and the extension's whole boundary is
-- that it fills forms and never commits. What it CAN do is know, immediately
-- and per channel, exactly what is now a lie — and keep asking until each one
-- is dealt with.
--
-- Hence a queue rather than a flag. A flag is a thing you notice; a queue is a
-- thing you finish.
create table if not exists delist_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  channel channel not null,

  -- Which sale triggered this, so the queue can say WHY a listing must go.
  sold_on channel not null,
  created_at timestamptz not null default now(),

  -- 'open' until the seller confirms it's down. 'gone' when they have.
  -- 'skipped' when they deliberately left it up — a seller with two identical
  -- pieces is not making a mistake, and the queue must not nag them forever.
  state text not null default 'open',
  resolved_at timestamptz,

  unique (listing_id)
);

alter table delist_tasks enable row level security;

create policy "own delist tasks" on delist_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists delist_tasks_open_idx
  on delist_tasks (user_id, state, created_at desc);

comment on table delist_tasks is
  'One row per still-live listing of an item that has sold elsewhere. Created when a sale is recorded; cleared when the seller confirms the listing is down. Flock never delists by itself — that is a destructive action in the seller''s own marketplace account.';
