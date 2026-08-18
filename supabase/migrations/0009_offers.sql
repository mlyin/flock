-- Offers you can actually answer, in one place, across every channel.
--
-- Offers already arrived as `messages` rows with kind='offer'. That was enough
-- to *see* them; it isn't enough to *work* them. An offer has a lifecycle a
-- message doesn't — it's open until you accept, decline, counter, or it lapses —
-- and answering it needs a link back to the exact page on the marketplace where
-- the accept button lives.
--
-- These are additive columns on `messages` rather than a new table on purpose:
-- an offer *is* a message on every one of these platforms (Depop threads the
-- offer into the conversation), and splitting them would mean reassembling the
-- thread on read.

-- open | accepted | declined | countered | expired | withdrawn
-- Null for kind='message' rows. Null on a kind='offer' row means "not yet
-- answered", same as 'open' — the default keeps old rows meaningful.
alter table messages add column if not exists offer_status text default 'open';

-- What we sent back, when we counter. Distinct from offer_amount, which is
-- always what the buyer asked for.
alter table messages add column if not exists counter_amount numeric(10, 2);

-- When the seller answered, and how. 'threader' means answered in-app;
-- 'platform' means we observed the resolution on a later sync.
alter table messages add column if not exists responded_at timestamptz;
alter table messages add column if not exists responded_via text;

-- Most platforms expire offers. Sorting by "expires soonest" is the single most
-- useful ordering in an offers queue.
alter table messages add column if not exists expires_at timestamptz;

-- The deep link to the offer on the marketplace — e.g.
-- https://www.depop.com/sellinghub/offers/871729473/?variantId=5
--
-- Threader never accepts an offer server-side. It shows the maths and sends you
-- to the page where you click, for the same reason the extension fills forms but
-- never submits them: it's someone else's account, and the click should come
-- from a real browser and a real person.
alter table messages add column if not exists offer_url text;

-- The listing the message hangs off, so unmatched messages can still be matched
-- to an item later by URL rather than by guesswork.
alter table messages add column if not exists product_url text;

-- The buyer's stable handle, where the platform gives one. `sender` is display
-- text and changes; this doesn't.
alter table messages add column if not exists buyer_handle text;

-- The offers queue: open offers, soonest to lapse first.
create index if not exists messages_open_offers_idx
  on messages (user_id, expires_at)
  where kind = 'offer' and (offer_status is null or offer_status = 'open');

-- Per-product message history — the whole point of grouping by garment.
create index if not exists messages_item_thread_idx
  on messages (item_id, received_at);
