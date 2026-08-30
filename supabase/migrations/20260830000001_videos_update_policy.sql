-- Real gap found running the actual pipeline end-to-end against a live
-- project: videos only had SELECT and INSERT RLS policies, no UPDATE. The
-- web app's own session (not service-role) needs to update its own video
-- rows twice in the normal flow — setting storage_path right after creating
-- the row, and flipping status to 'validating' on confirm-upload. Without
-- this policy, both updates silently matched zero rows (RLS, not an error
-- PostgREST surfaces) while the routes reported success regardless.

create policy "players can update own videos"
  on public.videos for update
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
