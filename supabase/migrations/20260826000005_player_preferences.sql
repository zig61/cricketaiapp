-- 1:1 with profiles. Coaching-relevant preferences, distinct from user_settings
-- (app-level settings) in the next migration.

create table public.player_preferences (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  preferred_training_days text[] not null default '{}'
    constraint player_preferences_training_days_valid
    check (
      preferred_training_days <@ array[
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
      ]::text[]
    ),
  reminder_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger player_preferences_set_updated_at
  before update on public.player_preferences
  for each row
  execute function public.set_updated_at();

alter table public.player_preferences enable row level security;

create policy "players can view own preferences"
  on public.player_preferences for select
  using (player_id = auth.uid());

create policy "players can insert own preferences"
  on public.player_preferences for insert
  with check (player_id = auth.uid());

create policy "players can update own preferences"
  on public.player_preferences for update
  using (player_id = auth.uid());
