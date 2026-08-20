-- Sale detection.
--
-- Double-selling is the failure that keeps sellers off cross-listers, and every
-- competitor leads with the fix. The interesting part is that the market leader's
-- version is also their loudest complaint: it delists things that did not sell.
-- So the design constraint here is not "detect sales" — it is "never take down a
-- listing that is still good."
--
-- Flock detects disappearance, which is NOT the same as a sale. A listing can
-- vanish from a seller's shop because it sold, because they deleted it, because
-- the marketplace hid it, or because the page half-loaded when we read it. Only
-- the seller knows which. So absence produces a QUESTION, not a state change.
--
-- Two guards do the real work, and both live in lib/vanished.ts:
--   * an empty read is never evidence — a scrape returning zero listings is
--     overwhelmingly a failed page load, not a closet that sold out at once;
--   * one miss is never enough — a listing must be absent on consecutive reads.

create table sale_candidates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references items (id) on delete cascade,
  listing_id  uuid not null references listings (id) on delete cascade,
  channel     channel not null,

  detected_at timestamptz not null default now(),
  -- How many consecutive reads it was missing from when we asked. Shown to the
  -- seller, because "missing twice" and "missing for a week" deserve different
  -- levels of confidence from them.
  misses      integer not null default 1,

  -- open      → we've asked, they haven't answered
  -- sold      → confirmed; the sale is recorded and other channels queued to delist
  -- removed   → they took it down themselves; listing ends, nothing to delist
  -- still_up  → we were wrong; stop asking about this one
  state       text not null default 'open',
  resolved_at timestamptz,

  unique (listing_id)
);

create index sale_candidates_open_idx on sale_candidates (user_id, detected_at desc)
  where state = 'open';

alter table sale_candidates enable row level security;

create policy "own sale candidates" on sale_candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Consecutive reads this listing has been missing from its channel's shop.
-- Reset to 0 the moment it is seen again.
alter table listings add column if not exists absent_streak integer not null default 0;
