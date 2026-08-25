-- RLS policies for catalogue/reference data (public read, service-role write) and
-- the subscriptions placeholder (select own, no client writes).

create policy "authenticated users can read drills"
  on public.drills for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can read skills"
  on public.skills for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can read sub_skills"
  on public.sub_skills for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can read root_causes"
  on public.root_causes for select
  using (auth.role() = 'authenticated');

-- No insert/update/delete policies on any of the above: writes are service-role only,
-- bypassing RLS by design (drill/taxonomy content is managed by the coaching team, not players).

create policy "players can view own subscription"
  on public.subscriptions for select
  using (player_id = auth.uid());

-- No write policy: subscriptions is an unused v1 placeholder (docs/13-technology-decisions.md §9).
