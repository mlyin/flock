-- Photo storage.
--
-- Every object lives under a path that starts with the owner's user id:
--
--     {user_id}/inbox/{uuid}.jpg        uploaded, not yet identified
--     {user_id}/{item_id}/{uuid}.jpg    filed against a garment
--
-- The policies below compare that first path segment to auth.uid(), so a user
-- physically cannot read or write another user's photos even with a crafted key.
-- The bucket is private: images are served through signed URLs, not public links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  20971520, -- 20 MB; phone photos land well under this after client-side resize
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "read own photos" on storage.objects
  for select using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "upload own photos" on storage.objects
  for insert with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "update own photos" on storage.objects
  for update using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own photos" on storage.objects
  for delete using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
