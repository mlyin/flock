-- What the marketplace form actually looked like after a fill.
--
-- Every failure this project has hit was diagnosed the same way: the seller
-- screenshots a red error, sends it over, and someone reads the DOM by hand.
-- Depop's "Brand new with tags" (a label Depop does not have), the eleven
-- photos against an eight-photo cap, "42" against a US-only size scale — each
-- cost a round trip through a human describing what they saw.
--
-- The form already knows. This stores what it said: every visible control, its
-- label, whether it was filled, and the validation text sitting next to it.
--
-- Deliberately NOT a submission log. The extension still never posts a listing
-- by itself, and this table exists so that diagnosis stops needing a person,
-- not so that retrying does.
create table if not exists fill_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  channel channel not null,
  created_at timestamptz not null default now(),

  -- What the filler believed it did.
  filled text[] not null default '{}',
  missing text[] not null default '{}',
  blocked text[] not null default '{}',

  -- What the page actually showed: [{id, label, kind, value, required, error}]
  controls jsonb not null default '[]'::jsonb,
  -- Validation messages, verbatim. These are the sentences a seller screenshots.
  errors text[] not null default '{}',
  url text
);

alter table fill_reports enable row level security;

create policy "own fill reports" on fill_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists fill_reports_listing_idx on fill_reports (listing_id, created_at desc);

comment on table fill_reports is
  'Post-fill snapshot of a marketplace form: what filled, what did not, and the validation text shown. Written by the extension via /api/ext/fill-report so that diagnosing a broken fill does not require the seller to describe what they saw.';
