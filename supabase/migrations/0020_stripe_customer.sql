-- Stripe's id for this seller.
--
-- Needed to reopen the billing portal without asking Stripe to search by email:
-- emails change, and two Stripe customers sharing an address is an ordinary
-- thing that would otherwise silently pick the wrong subscription.
alter table profiles add column if not exists stripe_customer_id text;

create index if not exists profiles_stripe_customer_idx
  on profiles (stripe_customer_id)
  where stripe_customer_id is not null;
