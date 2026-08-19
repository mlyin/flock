-- Which plan a seller is on, and what it lets them do.
--
-- The cap is on **concurrent active listings**, not on items ever created. That
-- distinction is the whole design: a free tier that stops you at five garments
-- forever is a trial with the word "free" on it, and a seller works that out
-- within a week. Five live at once is a real tool for clearing your own
-- wardrobe, and stops being enough exactly when you're running stock — which is
-- when paying for it is obviously worth it.
--
-- Named from the real sheep lifecycle: a lamb is under a year, a hogget one to
-- two, mutton older than that. It reads as a ladder because it is one.
create table if not exists plans (
  id              text primary key,
  label           text not null,
  active_listings int,            -- null means no limit
  monthly_cents   int not null default 0,
  sort_order      int not null
);

insert into plans (id, label, active_listings, monthly_cents, sort_order) values
  ('lamb',   'Lamb',   5,    0,    1),
  ('hogget', 'Hogget', 100,  1200, 2),
  ('mutton', 'Mutton', null, 2900, 3)
on conflict (id) do update
  set label = excluded.label,
      active_listings = excluded.active_listings,
      monthly_cents = excluded.monthly_cents,
      sort_order = excluded.sort_order;

-- profiles already exists from 0001, keyed on `id` (= auth.users.id). Extend it
-- rather than introducing a second table about the same person.
alter table profiles add column if not exists plan text not null default 'lamb';
alter table profiles add column if not exists beta boolean not null default false;

alter table profiles drop constraint if exists profiles_plan_fkey;
alter table profiles add constraint profiles_plan_fkey
  foreign key (plan) references plans(id);

comment on column profiles.plan is
  'lamb | hogget | mutton. Everyone starts a lamb, including existing sellers — nobody is grandfathered by accident.';

-- A closed-beta seller keeps the top tier permanently. Recorded as its own fact
-- rather than by setting plan = 'mutton', so a future billing system can tell
-- "paid for mutton" from "was here first". They need different handling at
-- renewal, and collapsing them into one column loses that difference forever.
comment on column profiles.beta is
  'Closed-beta seller. Grants the top tier permanently, and is deliberately separate from plan.';

-- plans is a price list, not user data: readable by anyone, writable through the
-- API by nobody.
alter table plans enable row level security;

drop policy if exists "plans are readable" on plans;
create policy "plans are readable" on plans for select using (true);
