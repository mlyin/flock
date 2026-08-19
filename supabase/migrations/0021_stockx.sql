-- StockX joins the channel list, and items learn their style code.
--
-- StockX is a third shape of channel (docs/CHANNELS.md): not a listing you
-- write but a CATALOG MATCH you place an ask against. The entire listing is
-- (catalog product, size, ask) — no copy, no photos for deadstock condition.
--
-- The join key is the manufacturer's style code, printed on the garment's
-- inner tag (e.g. "FOA404323" on Oakley, "CV1738-100" on Nike). Without it
-- there is no reliable catalog match, and a wrong match isn't cosmetic — it's
-- shipping the wrong product to an authenticator, which ends with a failed
-- sale and a penalty fee.
alter type channel add value if not exists 'stockx';

alter table items add column if not exists style_code text;

comment on column items.style_code is
  'Manufacturer style/model code from the inner tag. The catalog join key for StockX and GOAT. Read from tag photos when legible, never inferred — a wrong code ships the wrong product to an authenticator.';
