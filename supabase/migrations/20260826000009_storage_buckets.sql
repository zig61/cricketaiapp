-- Storage architecture. All buckets are PRIVATE — no user video, derived
-- output, thumbnail, or profile image is ever publicly readable. Access is
-- via the owning user's own authenticated session (RLS below) or signed
-- URLs generated server-side.
--
-- Path convention (enforced by RLS, not just documentation): every object's
-- path starts with the owning user's auth.uid(), e.g.
--   player-videos/{auth.uid()}/{video_id}/{filename}
-- storage.foldername(name) returns the path split into folder segments
-- (excluding the filename), so (storage.foldername(name))[1] is that
-- leading auth.uid() segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('player-videos', 'player-videos', false, 524288000,
    array['video/mp4', 'video/quicktime', 'video/x-m4v']),
  ('analysis-outputs', 'analysis-outputs', false, 52428800,
    array['application/json']),
  ('thumbnails', 'thumbnails', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('profile-images', 'profile-images', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']);

-- player-videos: owner read/write/delete under their own uid prefix.
create policy "players can read own videos in storage"
  on storage.objects for select
  using (bucket_id = 'player-videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can upload own videos to storage"
  on storage.objects for insert
  with check (bucket_id = 'player-videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can delete own videos from storage"
  on storage.objects for delete
  using (bucket_id = 'player-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- analysis-outputs and thumbnails: derived from a player's own videos by the
-- pipeline (service role writes them) — owner may read, no client writes.
create policy "players can read own analysis outputs in storage"
  on storage.objects for select
  using (bucket_id = 'analysis-outputs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can read own thumbnails in storage"
  on storage.objects for select
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

-- profile-images: owner read/write/delete under their own uid prefix.
create policy "players can read own profile image in storage"
  on storage.objects for select
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can upload own profile image to storage"
  on storage.objects for insert
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can update own profile image in storage"
  on storage.objects for update
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "players can delete own profile image from storage"
  on storage.objects for delete
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
