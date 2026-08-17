-- Grailed joins the channel list.
--
-- Only the enum value is added here. Postgres won't let a new enum value be
-- *used* in the transaction that creates it, and migrate.mjs wraps each file in
-- one — so anything that writes 'grailed' has to be a later migration or, as
-- here, ordinary runtime inserts.

alter type channel add value if not exists 'grailed';
