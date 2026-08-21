-- Finish what 0032 tried to do to extension_tokens.token_hash.
--
-- 0032 said `revoke select (token_hash) ... from authenticated` and it did
-- nothing, because a column-level revoke cannot carve a hole out of a
-- table-level grant: SELECT on the table already covers every column, and
-- Postgres has no notion of a column-shaped exception to it. I only caught
-- this because I re-ran the probe afterwards instead of trusting that
-- "migration applied" meant "column protected" -- the revoke returned success.
--
-- The working order is the one 0030 used on channel_accounts: revoke the
-- table-level grant, then hand back the columns individually.
--
-- Low stakes on its own -- the column holds a SHA-256 of the bearer token,
-- never the token, so reading it authenticates nobody, and it is the seller's
-- own row either way. It is here because no client code reads it (PairedDevices
-- selects id, label, created_at, last_used_at) and a credential-shaped column
-- with no reader should not be selectable.
revoke select on extension_tokens from authenticated;

grant select (id, user_id, label, created_at, last_used_at, revoked_at)
  on extension_tokens to authenticated;

-- INSERT and UPDATE stay as they were: issueToken writes token_hash and
-- revokeToken sets revoked_at, both through the seller's own session.
