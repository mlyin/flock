-- Every size system on the tag, and how the garment is cut.
--
-- `size` holds one string, as printed. Real tags print several: "XL" beside
-- "US 42" beside "EU 54", and a Japanese brand's L is not an American L. A
-- single string forces a choice at read time and throws the rest away — then
-- the filler meets Vinted's list of "L / US 12-14" or Grailed's numeric sizes
-- and has to guess back the system it discarded.
--
-- So keep them all. `size` stays as the human answer to "what does the tag
-- say"; `sizes` is the machine one.
alter table items add column if not exists sizes jsonb not null default '{}'::jsonb;

comment on column items.sizes is
  'Every size system legible on the tag, keyed by system: intl (XS/S/M/L/XL), us, uk, eu, jp, numeric (waist, 34x32, bust). Only the ones actually printed — an inferred conversion is a guess, and a buyer ordering on a guessed size returns it.';

-- How it's cut, which is not the same question as what size it is.
--
-- An oversized M and a slim M fit differently enough that a buyer asks before
-- buying, and "boxy" is the single most common word in those messages. It also
-- belongs in listing copy on every channel, where the description currently
-- has nothing to say about it.
alter table items add column if not exists fit text;

alter table items drop constraint if exists items_fit_check;
alter table items add constraint items_fit_check
  check (fit is null or fit in ('slim', 'regular', 'relaxed', 'oversized', 'boxy', 'cropped', 'tailored'));

comment on column items.fit is
  'slim | regular | relaxed | oversized | boxy | cropped | tailored. Null when it cannot be told from the photos — a fit claim is one a buyer acts on.';
