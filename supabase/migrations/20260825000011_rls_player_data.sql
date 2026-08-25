-- RLS policies for player-owned data.
--
-- Tables with NO write policy at all (analyses, measurements, issues, drill_prescriptions,
-- progress_comparisons) rely on RLS's default-deny: only the Coordinator API's service-role
-- connection (which bypasses RLS entirely) writes them. Clients may only insert `videos`
-- (their own submission) and `drill_completions` (marking their own prescription complete).

-- profiles: select/update own row only.
create policy "players can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "players can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- videos: own rows, direct ownership (no join needed).
create policy "players can view own videos"
  on public.videos for select
  using (player_id = auth.uid());

create policy "players can insert own videos"
  on public.videos for insert
  with check (player_id = auth.uid());

-- analyses: owned via videos (one join hop).
create policy "players can view own analyses"
  on public.analyses for select
  using (public.owns_video(video_id));

-- measurements: owned via analyses -> videos.
create policy "players can view own measurements"
  on public.measurements for select
  using (
    exists (
      select 1 from public.analyses
      where analyses.id = measurements.analysis_id
        and public.owns_video(analyses.video_id)
    )
  );

-- issues: owned via analyses -> videos.
create policy "players can view own issues"
  on public.issues for select
  using (
    exists (
      select 1 from public.analyses
      where analyses.id = issues.analysis_id
        and public.owns_video(analyses.video_id)
    )
  );

-- drill_prescriptions: owned via issues -> analyses -> videos.
create policy "players can view own drill prescriptions"
  on public.drill_prescriptions for select
  using (
    exists (
      select 1 from public.issues
      join public.analyses on analyses.id = issues.analysis_id
      where issues.id = drill_prescriptions.issue_id
        and public.owns_video(analyses.video_id)
    )
  );

-- drill_completions: owned via drill_prescriptions -> issues -> analyses -> videos.
-- Clients may mark their own prescription complete (insert), per SR-DRILL-002.
create policy "players can view own drill completions"
  on public.drill_completions for select
  using (
    exists (
      select 1 from public.drill_prescriptions
      join public.issues on issues.id = drill_prescriptions.issue_id
      join public.analyses on analyses.id = issues.analysis_id
      where drill_prescriptions.id = drill_completions.prescription_id
        and public.owns_video(analyses.video_id)
    )
  );

create policy "players can mark own prescriptions complete"
  on public.drill_completions for insert
  with check (
    exists (
      select 1 from public.drill_prescriptions
      join public.issues on issues.id = drill_prescriptions.issue_id
      join public.analyses on analyses.id = issues.analysis_id
      where drill_prescriptions.id = drill_completions.prescription_id
        and public.owns_video(analyses.video_id)
    )
  );

-- progress_comparisons: followup_video_id is a direct FK to videos, no extra join needed.
create policy "players can view own progress comparisons"
  on public.progress_comparisons for select
  using (public.owns_video(followup_video_id));
