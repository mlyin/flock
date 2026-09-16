-- The unit of work a node claims: fill this listing's form on this marketplace.
--
-- A listing stays `draft` until the marketplace itself shows it live -- the
-- posted route is the only thing that flips it. The job records what happened
-- in between, which is the "Pending" every cross-lister has and Flock did not:
--
--   queued        the seller asked; no node has picked it up yet
--   running       a node opened the sell page and is filling it
--   filled        submit was pressed; the marketplace has not yet shown a listing
--   needs_seller  a person has to press something -- Facebook's second screen,
--                 Mercari's List button, Grailed's typed designer, or any field
--                 the filler could not settle
--   published     the marketplace navigated to a live listing and it was recorded
--   failed        the filler crashed or the form never rendered
--   cancelled     the seller withdrew it
--
-- `needs_seller` is neither success nor failure, and the dashboard never
-- describes it as either. FILLING A FORM IS NOT PUBLISHING A LISTING: a job is
-- `published` only on the marketplace's own word, via the posted route, which
-- also closes any open job for that listing.
create type fill_job_status as enum ('queued', 'running', 'filled', 'needs_seller', 'published', 'failed', 'cancelled');

create table if not exists fill_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  listing_id    uuid not null references listings (id) on delete cascade,
  channel       channel not null,
  status        fill_job_status not null default 'queued',
  node_id       uuid references nodes (id) on delete set null,
  attempts      integer not null default 0,
  -- What the node was told for THIS attempt, so the evidence says what was
  -- actually tried rather than what the setting is today.
  auto_submit   boolean not null default false,
  -- The form's own account of the fill, via /api/ext/fill-report.
  report_id     uuid references fill_reports (id) on delete set null,
  -- {ok, filled, missing, blocked, error, publishedUrl}: per-market evidence,
  -- kept even when the report insert failed.
  outcome       jsonb,
  error         text,
  requested_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  -- When the node last reported on it, or when the marketplace confirmed it.
  finished_at   timestamptz
);

-- A job names a listing the same seller owns. RLS scopes what a session can
-- SEE, not what it can point at: without this, a seller could insert a job
-- against another seller's listing id and, through the unique index below,
-- stop that seller queueing their own listing. The check runs under the
-- caller's role, so under RLS a stranger's listing is simply not there.
create or replace function fill_jobs_listing_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from listings l where l.id = new.listing_id and l.user_id = new.user_id
  ) then
    raise exception 'fill_jobs.listing_id must belong to fill_jobs.user_id';
  end if;
  return new;
end;
$$;

create trigger fill_jobs_listing_owner
  before insert or update of listing_id, user_id on fill_jobs
  for each row execute function fill_jobs_listing_owner();

-- One open job per listing, and `filled` counts as open: submit was pressed
-- and the marketplace has not answered, so a second fill now is a second
-- listing. Queueing again is a no-op; the seller dismisses the filled job
-- first if they are sure it did not go through.
create unique index if not exists fill_jobs_one_open_per_listing
  on fill_jobs (listing_id) where status in ('queued', 'running', 'filled');

create index if not exists fill_jobs_user_open_idx
  on fill_jobs (user_id, requested_at)
  where status in ('queued', 'running', 'filled', 'needs_seller', 'failed');

alter table fill_jobs enable row level security;

create policy "own fill jobs" on fill_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A session may ask (insert the three columns that name the ask) and read.
-- It may not set status, attempts, node_id, outcome or anything else: those
-- are the node's and the server's to write, through the service role. A
-- browser that could write status could call a filled form published.
revoke all on fill_jobs from anon;
revoke all on fill_jobs from authenticated;
grant select on fill_jobs to authenticated;
grant insert (user_id, listing_id, channel) on fill_jobs to authenticated;

-- Atomic claim for the node's poll. SKIP LOCKED means two polls can never take
-- the same job. The join means a job queued before the seller published by
-- hand is never run against a listing that is already live -- the second
-- listing a duplicate fill would create is exactly the double-sale this
-- product exists to prevent.
--
-- A `running` job whose node went quiet for half an hour is reclaimed: the
-- worker was killed mid-fill, or its report never arrived. Half an hour is
-- well past any fill (90s ceiling plus a 45s wait) and past Chrome's
-- five-minute cap on the worker, so a reclaim never races a live fill. The
-- attempt cap (lib/nodes.ts MAX_ATTEMPTS, 3) stops a node that dies every
-- time from looping on the same listing forever; what it leaves behind, the
-- seller can cancel.
--
-- auto_submit is set HERE, in the same statement as the claim, from the
-- node's setting and the channels the server allows it on (lib/nodes.ts
-- AUTO_SUBMIT_CHANNELS). One write, so the evidence of what the node was
-- told can never disagree with what it was told.
create or replace function claim_fill_jobs(
  p_user uuid,
  p_node uuid,
  p_limit integer,
  p_auto_submit boolean,
  p_auto_channels channel[]
)
returns setof fill_jobs
language sql
as $$
  update fill_jobs
     set status = 'running',
         node_id = p_node,
         claimed_at = now(),
         attempts = attempts + 1,
         auto_submit = (p_auto_submit and channel = any (p_auto_channels))
   where id in (
     select j.id
       from fill_jobs j
       join listings l on l.id = j.listing_id
      where j.user_id = p_user
        and (
          j.status = 'queued'
          or (j.status = 'running' and j.claimed_at < now() - interval '30 minutes')
        )
        and j.attempts < 3
        and l.status = 'draft'
      order by j.requested_at
      limit p_limit
        for update of j skip locked
   )
  returning *;
$$;

-- Only the bearer route, under the service role, may claim. A session that
-- could call this would be able to mark its own jobs running from the browser
-- and confuse the node about what it has been handed.
revoke all on function claim_fill_jobs(uuid, uuid, integer, boolean, channel[]) from public;
revoke all on function claim_fill_jobs(uuid, uuid, integer, boolean, channel[]) from anon;
revoke all on function claim_fill_jobs(uuid, uuid, integer, boolean, channel[]) from authenticated;
grant execute on function claim_fill_jobs(uuid, uuid, integer, boolean, channel[]) to service_role;

comment on table fill_jobs is
  'One row per request to fill a listing''s form on a node. Published only when the marketplace showed a live listing (posted route); needs_seller when a person must press something. Written by app/node-actions.ts and /api/ext/jobs.';
