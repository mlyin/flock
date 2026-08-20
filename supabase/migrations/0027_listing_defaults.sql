-- Listing defaults: the boilerplate a seller writes once instead of on every
-- garment. Shipping terms, returns policy, a sign-off — the paragraphs that are
-- identical across a whole closet and are pure tedium to retype.
--
-- One row per seller, not a library of named templates. Every competitor ships
-- "templates" as a list you manage, and managing a list of templates is itself
-- a chore; the thing sellers actually repeat is one block of standing terms.
-- A library can come later if anyone asks for a second one.

create table listing_defaults (
  user_id     uuid primary key references auth.users (id) on delete cascade,

  -- Appended after the garment's own details, so the specific always precedes
  -- the generic — a buyer reads what this piece IS before your terms.
  footer      text,

  -- Prepended, for sellers who lead with a shop line ("Ships same day ·
  -- Bundle 3+ for 15% off"). Rarely used; offered because Depop sellers do.
  preamble    text,

  -- Per-channel overrides, keyed by channel. Depop wants lowercase and short;
  -- eBay tolerates a policy paragraph. jsonb rather than ten columns because
  -- the channel list moves.
  per_channel jsonb not null default '{}'::jsonb,

  updated_at  timestamptz not null default now()
);

alter table listing_defaults enable row level security;

create policy "own listing defaults" on listing_defaults
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
