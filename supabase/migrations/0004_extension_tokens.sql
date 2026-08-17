-- Pairing tokens for the browser extension.
--
-- The extension can't use the site's session cookie: it runs on its own origin,
-- and SameSite rules mean the cookie won't travel. So the user pairs once with a
-- code and the extension sends a bearer token thereafter.
--
-- Only the SHA-256 of the token is stored. A database dump therefore doesn't
-- yield anything you can authenticate with — same reasoning as password hashing.

create table extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index extension_tokens_user_idx on extension_tokens (user_id) where revoked_at is null;

alter table extension_tokens enable row level security;

-- The owner can list and revoke their own tokens. Verification happens through
-- the secret-key client, which bypasses RLS — a caller holding only a bearer
-- token has no session, so there's no auth.uid() to match against.
create policy "own extension tokens" on extension_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Where a listing actually ended up, once the extension reports back.
alter table listings add column if not exists posted_via text;
