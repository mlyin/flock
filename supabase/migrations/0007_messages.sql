-- Buyer messages, and the number you'll actually take.

-- What you'd accept rather than keep carrying it. Distinct from cost_basis
-- (what you paid) and list_price (what you're asking) — this is the walk-away
-- number, and having it written down is what stops a lowball being answered
-- from memory at 11pm.
alter table items add column if not exists floor_price numeric(10, 2);

-- Messages from every channel in one place.
--
-- item_id is nullable and starts null: a message arrives attached to a
-- marketplace listing, and matching that back to a Threader item is a separate
-- step. A message shown against the wrong garment is worse than one shown
-- against none.
create table messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  channel      channel not null,

  item_id      uuid references items (id) on delete set null,
  listing_id   uuid references listings (id) on delete set null,

  -- The platform's own ids, so re-syncing updates rather than duplicating.
  external_id  text not null,
  thread_id    text,

  direction    text not null default 'incoming', -- incoming | outgoing
  sender       text,
  body         text,

  -- 'offer' rows carry offer_amount; 'message' rows don't. Offers are the ones
  -- you need a floor price to answer.
  kind         text not null default 'message',  -- message | offer
  offer_amount numeric(10, 2),

  received_at  timestamptz not null default now(),
  read_at      timestamptz,
  raw          jsonb,

  unique (user_id, channel, external_id)
);

create index messages_user_received_idx on messages (user_id, received_at desc);
create index messages_item_idx on messages (item_id, received_at desc);
create index messages_unread_idx on messages (user_id) where read_at is null;

alter table messages enable row level security;

create policy "own messages" on messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
