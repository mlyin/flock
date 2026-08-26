-- A subscribable calendar feed, and the credential that gates it.
--
-- Calendar.app, Google Calendar and iOS all subscribe to a URL and none of
-- them can hold a session — there is no login step in "add a subscribed
-- calendar". So the URL itself is the credential, which makes three things
-- non-negotiable:
--
--   * it must be long and random, because it will be fetched hourly forever
--     and it ends up in logs, proxies and sync services;
--   * it must be revocable without disturbing anything else the seller uses;
--   * it must be SEPARATE from the extension's bearer token, because the two
--     have very different blast radii. An extension token reaches the whole
--     API. A leaked calendar URL exposes garment titles and dates, which is
--     bad but bounded — conflating them would raise the calendar's blast
--     radius to the API's for no reason.
--
-- Only the hash is stored, same as extension_tokens: a database dump must not
-- hand someone a working feed URL.
create table if not exists calendar_feeds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  token_hash  text not null unique,
  label       text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

create index if not exists calendar_feeds_user_idx
  on calendar_feeds (user_id) where revoked_at is null;

alter table calendar_feeds enable row level security;

-- The owner may list and revoke their own feeds. Verification happens through
-- the secret-key client, because a calendar client carries no session and so
-- has no auth.uid() for RLS to match.
create policy "own calendar feeds" on calendar_feeds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Same lesson as 0030-0033: RLS is ROW level and cannot hide a column, so the
-- credential column needs a GRANT. Revoke the table-level SELECT first — a
-- column-level revoke cannot carve a hole out of a table-level grant, which is
-- the mistake 0032 made and 0033 had to fix.
revoke all on calendar_feeds from anon;
revoke select on calendar_feeds from authenticated;

grant select (id, user_id, label, created_at, last_used_at, revoked_at)
  on calendar_feeds to authenticated;

-- Insert and update stay, so the seller can create a feed and revoke it from
-- their own session.
grant insert, update on calendar_feeds to authenticated;

comment on column calendar_feeds.token_hash is
  'SHA-256 of the feed token. The token itself is shown once, at creation, and never stored. Not selectable by the authenticated role -- see the grants above.';
