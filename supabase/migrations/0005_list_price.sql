-- What the seller wants for the garment.
--
-- Distinct from cost_basis, which is what they paid. The AI path suggested a
-- price; the manual path had nowhere to put one, so listings came out at zero.
alter table items add column if not exists list_price numeric(10, 2);
