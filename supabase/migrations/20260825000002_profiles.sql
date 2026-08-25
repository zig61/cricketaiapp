-- profiles: extends auth.users (docs/04-database.md §1, SR-PROF-001)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  date_of_birth date,
  age_band text check (age_band in ('under_13', '13_17', '18_plus')),
  batting_hand text check (batting_hand in ('left', 'right')),
  playing_level text check (playing_level in ('junior_club', 'senior_club', 'school', 'other')),
  -- Under-18 = under_13 or 13_17; drives privacy defaults per SR-AUTH-004.
  is_minor boolean generated always as (age_band in ('under_13', '13_17')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
