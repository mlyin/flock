-- Stop the browser being able to read its own OAuth tokens.
--
-- 0001_init.sql claims, in a comment, that "the row is only ever read in full
-- by the service role". That was not true. The policy is
--
--   for all using (auth.uid() = user_id)
--
-- and row-level security is exactly that: ROW level. It decides which rows you
-- may touch, never which columns. So any signed-in seller could select
-- access_token and refresh_token straight out of PostgREST with the
-- publishable key -- and so could anything running in their page: an XSS, a
-- malicious browser extension, a compromised npm dependency.
--
-- Their own tokens, so this was never a cross-tenant leak. It is worse in a
-- different direction: a marketplace refresh token lists, delists, reprices
-- and reads orders on the seller's real account, and unlike a password it
-- never prompts for a second factor.
--
-- Column-level grants are the mechanism RLS does not provide. The owner keeps
-- seeing that a channel is connected and keeps being able to disconnect it.
-- The secrets stop being selectable at all.
revoke all on channel_accounts from authenticated;

grant select (id, user_id, channel, external_user, expires_at, scopes, connected_at)
  on channel_accounts to authenticated;

-- Disconnecting is the one write a seller does themselves. Insert and update
-- stay revoked: tokens are written by the OAuth callback, which runs
-- server-side under the service role, and a client that could UPDATE this
-- table could point a seller's channel at someone else's token.
grant delete on channel_accounts to authenticated;

comment on column channel_accounts.access_token is
  'AES-256-GCM ciphertext from lib/secrets.ts, never plaintext. Not selectable by the authenticated role -- read server-side only.';
comment on column channel_accounts.refresh_token is
  'AES-256-GCM ciphertext from lib/secrets.ts, never plaintext. Worth more than a password: it acts on the seller''s marketplace account without a second factor.';
