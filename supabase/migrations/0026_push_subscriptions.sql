-- Web push endpoints, one row per installed browser or home-screen app.
--
-- A person legitimately has several: phone home screen, laptop Chrome, desktop.
-- Each gets its own endpoint and its own keys, so notifying someone means
-- sending to every row they own, not to "their device".

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  -- Push services return 404/410 once an endpoint is dead. Recording that
  -- rather than deleting immediately makes "why did notifications stop"
  -- answerable instead of a mystery.
  failed_at    timestamptz,
  fail_reason  text
);

create index push_subscriptions_user_idx on push_subscriptions (user_id) where failed_at is null;

alter table push_subscriptions enable row level security;

create policy "own push subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sending happens server-side from the message ingest, which authenticates by
-- bearer token and therefore has no auth.uid() — it reads through the secret
-- key client and scopes by user_id by hand.

-- Which messages have already produced a notification, so a re-sync of the
-- same Depop thread doesn't buzz the phone again.
alter table messages add column if not exists notified_at timestamptz;
