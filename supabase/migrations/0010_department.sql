-- Who the garment is cut for.
--
-- Its absence is why category matching is dangerous. Every marketplace's
-- taxonomy is rooted at Women / Men / Kids, and Mercari's own suggestions for a
-- single pullover came back containing BOTH "Women > Sweaters > Crewneck" and
-- "Men > Sweats & hoodies > Sweatshirt, pullover". With nothing in the item to
-- discriminate, picking the first plausible option is a coin flip — which is
-- exactly how a women's Alo pullover previously landed under Men's on Depop.
--
-- Nullable, and null means "we don't know". A matcher that doesn't know the
-- department must refuse to choose rather than guess, so this is not defaulted.
alter table items add column if not exists department text;

comment on column items.department is
  'women | men | unisex | kids | null. Null means unknown — matchers must not guess a gendered category.';
