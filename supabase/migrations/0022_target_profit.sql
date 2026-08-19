-- What you want to clear on this garment, so the ask can be worked backwards.
--
-- `cost_basis` already records what you paid. This is the other half of the
-- sentence sellers actually say: "I paid thirty for it and I want forty out of
-- it." From the pair, lib/fees.askForNet derives the list price on every
-- channel — which differs by more than people expect, because Vinted takes
-- nothing from a seller and Poshmark takes a fifth of the same ask.
--
-- Deliberately a PROFIT over cost, not a target net proceeds. Sellers think in
-- what they made, not in what landed in the account before subtracting what
-- they spent, and storing the number they typed means the field still reads
-- correctly after the cost basis is corrected.
--
-- Nullable: most items never get one, and a default of zero would be a claim
-- that the seller wants to break even.
alter table items add column if not exists target_profit numeric(10,2);

comment on column items.target_profit is
  'Profit the seller wants over cost_basis, in dollars. Null means no target set. Drives the per-channel ask in lib/fees.askForNet — never a price itself.';
