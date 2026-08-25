-- Audit gap: processing_jobs and drill_root_causes never had RLS enabled
-- in the original rls_helpers/rls_player_data/rls_catalogue migrations.

alter table public.processing_jobs enable row level security;
alter table public.drill_root_causes enable row level security;

-- processing_jobs: a player can watch their own video's pipeline progress.
create policy "players can view own processing jobs"
  on public.processing_jobs for select
  using (public.owns_video(video_id));

-- The one client-writable case: confirm-upload queues the first 'validate'
-- stage for a video the player owns. Every later stage (extract_frames
-- onward) is written exclusively by the pipeline worker (service role) —
-- this policy does not open general write access, only that one narrow case.
create policy "players can queue validation for own video"
  on public.processing_jobs for insert
  with check (stage = 'validate' and public.owns_video(video_id));

-- drill_root_causes: catalogue/join data, same public-read pattern as its
-- sibling tables (drills, skills, sub_skills, root_causes).
create policy "authenticated users can read drill_root_causes"
  on public.drill_root_causes for select
  using (auth.role() = 'authenticated');
