-- Undo 0015's trigger. It could never have worked.
--
-- The idea was a deferred constraint: insert the item, attach its photos, and
-- let the check run at COMMIT. That holds only if both happen in one
-- transaction, and they don't — supabase-js issues each statement over
-- PostgREST, which commits every one on its own. "End of transaction" is
-- therefore the end of the INSERT, before a single photo has been attached, so
-- the trigger rejected every new garment with "Item CL-0002 has no photos".
--
-- Enforcing this in the database would mean moving intake into one function
-- that takes the item and its photo ids together. That's a real option, but it
-- moves application logic into SQL for an invariant the application can already
-- guarantee: photos are claimed with an `is("item_id", null)` filter, the claim
-- reports how many it actually took, and an item that gets none is deleted
-- immediately. That's the fix for the race that produced the empty row; this
-- trigger was only ever a backstop, and a broken backstop is worse than none.
drop trigger if exists items_require_photo on items;
drop function if exists item_has_photo();
