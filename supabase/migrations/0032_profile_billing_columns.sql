-- Stop sellers being able to write their own plan.
--
-- `profiles` carries plan, beta and stripe_customer_id alongside the seller's
-- own display name and address. Its policy is
--
--   for all using (auth.uid() = id) with check (auth.uid() = id)
--
-- and `authenticated` held table-level UPDATE, so every column was writable by
-- its owner from the browser with the publishable key:
--
--   supabase.from("profiles").update({ beta: true }).eq("id", myId)
--
-- lib/plan.ts reads exactly plan and beta to decide the tier and the listing
-- cap, and beta maps straight to the top tier. So that one line was a complete
-- billing bypass. Verified against this database as the `authenticated` role
-- with a forged request.jwt.claims, then rolled back: the update succeeded.
--
-- Hardening the Stripe webhook, as I did earlier, is beside the point when the
-- client can write the column the webhook exists to set.
--
-- Nothing in the app has ever written profiles from the browser. Every write
-- to plan and stripe_customer_id goes through the webhook under the service
-- role, which bypasses RLS and is unaffected by these grants. So the fix costs
-- no functionality: revoke the writes, then hand back only the columns a
-- seller genuinely owns.
revoke insert, update, delete, truncate, references, trigger on profiles from authenticated;

-- What a seller may legitimately change about themselves. The ship_* columns
-- that used to live here moved to `addresses` in 0008, so display_name is the
-- whole list. Everything else -- plan, beta, stripe_customer_id, id, email,
-- created_at -- is set by the server or by the signup trigger and stays
-- unwritable from a session.
grant update (display_name) on profiles to authenticated;

-- A signed-out client has no profile to read or write. RLS already returns
-- nothing here (auth.uid() is null, so `auth.uid() = id` matches no row), but
-- a billing column should not rest on one layer.
revoke all on profiles from anon;

comment on column profiles.plan is
  'Set by the Stripe webhook under the service role. NOT writable by the seller''s own session -- see the grants in 0032.';
comment on column profiles.beta is
  'Permanent top tier, granted by hand. Same rule as plan: server-side writes only.';

-- extension_tokens stores a SHA-256 of the bearer token, never the token
-- itself, so reading it authenticates nobody. It is still a credential-shaped
-- column with no client reader -- PairedDevices selects id, label, created_at
-- and last_used_at -- so there is no reason for a session to see it. INSERT
-- stays, because issueToken writes the hash through the seller's own session.
revoke select (token_hash) on extension_tokens from authenticated;
revoke all on extension_tokens from anon;

-- plans is a read-only reference table: its policy grants SELECT and nothing
-- else, so writes were already refused. Drop the grants that suggested
-- otherwise.
revoke insert, update, delete, truncate on plans from authenticated;
revoke insert, update, delete, truncate on plans from anon;
