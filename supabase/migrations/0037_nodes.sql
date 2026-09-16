-- A browser that runs for the seller while their laptop is shut.
--
-- The extension has lived in the seller's own Chrome, which is the safest
-- place for it and also the one that stops working the moment the lid closes.
-- A node is that same extension in a Chromium container on a host Flock runs,
-- holding the seller's marketplace SESSIONS -- signed in by the seller, by
-- hand, inside the node's own screen -- and never their passwords.
--
-- One node per seller in v1 (unique user_id). A second node later is a
-- dropped constraint, not a redesign.
--
-- password_enc is the login for the node's screen, AES-256-GCM under
-- CHANNEL_TOKEN_KEY via lib/secrets.ts, shown to the seller exactly once at
-- creation like a pairing code. Same column-grant shape as channel_accounts
-- (0030, 0031): the browser can see that a node exists, open it, and pause
-- it; it cannot read the credential.
create type node_status as enum ('provisioning', 'ready', 'paused', 'error', 'retired');

create table if not exists nodes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  -- Which host the container lives on, e.g. nodes-1.sellonflock.com. One host
  -- in v1; a hosts table with capacity counts is the change when it fills.
  host           text not null,
  -- Path segment under the host: short and random, never derived from the
  -- email. https://nodes.sellonflock.com/n/<slug>/
  slug           text not null unique,
  url            text not null,
  port           integer not null,
  password_enc   text,
  -- host:port of a residential exit for this seller, or null for the host's
  -- own address. Facebook and Mercari score datacenter ranges; see docs/NODES.md.
  proxy          text,
  -- Server-side source of truth. Applied per job by /api/ext/jobs and never
  -- for mercari or facebook, whatever this says -- lib/nodes.ts decides.
  auto_submit    boolean not null default false,
  -- The pairing token minted for this node, so the jobs route can tell a node
  -- from a laptop: a laptop's token has no node row and gets no jobs.
  token_id       uuid references extension_tokens (id) on delete set null,
  status         node_status not null default 'provisioning',
  error          text,
  created_at     timestamptz not null default now(),
  last_opened_at timestamptz
);

alter table nodes enable row level security;

create policy "own node" on nodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The credential column is not selectable from a session. Inserts happen
-- server-side (app/node-actions.ts, under the service role) because that is
-- where the password is encrypted; the seller's own session may read the
-- listed columns and flip the two settings that are theirs to flip.
--
-- `status` is deliberately NOT in the update grant. createNode() treats a
-- row in 'error' as re-provisionable, so a session that could write status
-- could mint containers on the shared host at will. Pause and resume go
-- through the service role with the transition checked (setNodePaused).
revoke all on nodes from anon;
revoke all on nodes from authenticated;

grant select (id, user_id, host, slug, url, port, proxy, auto_submit, token_id, status, error, created_at, last_opened_at)
  on nodes to authenticated;

grant update (auto_submit, last_opened_at) on nodes to authenticated;

comment on table nodes is
  'One always-on Chromium per seller, running the Flock extension on a host Flock operates. Holds marketplace sessions the seller signed in by hand; never a marketplace password. See docs/NODES.md.';
comment on column nodes.password_enc is
  'AES-256-GCM ciphertext from lib/secrets.ts: the login for the node''s own screen. Not selectable by the authenticated role -- shown once at creation, server-side only after that.';
comment on column nodes.auto_submit is
  'Whether fills on this node may press the marketplace''s submit button. Only ever applied to depop, vinted and grailed (lib/nodes.ts AUTO_SUBMIT_CHANNELS); Facebook and Mercari always wait for a person.';
