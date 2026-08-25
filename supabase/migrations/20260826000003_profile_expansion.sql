-- Expands profiles with the remaining cricket-relevant fields from the product
-- brief (playing role, formats, training frequency, experience, current focus).
-- Deliberately batting-only in scope: no bowling/fielding-specific columns yet
-- (see plan notes) — current_focus_sub_skill_id already constrains to the
-- existing sub_skills taxonomy, which today only seeds "front_foot_drive".

alter table public.profiles
  add column playing_role text
    check (playing_role in ('batter', 'bowler', 'all_rounder', 'wicketkeeper')),
  add column preferred_formats text[] not null default '{}'
    constraint profiles_preferred_formats_valid
    check (preferred_formats <@ array['test', 'odi', 't20', 'other']::text[]),
  add column training_frequency_per_week int
    check (training_frequency_per_week >= 0 and training_frequency_per_week <= 21),
  add column experience_level text
    check (experience_level in ('beginner', 'intermediate', 'advanced', 'elite')),
  add column current_focus_sub_skill_id uuid references public.sub_skills (id);

create index profiles_current_focus_sub_skill_id_idx
  on public.profiles (current_focus_sub_skill_id);
