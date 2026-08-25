-- 1:1 with profiles. App-level settings, distinct from player_preferences
-- (coaching-relevant preferences) in the previous migration.

create table public.user_settings (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  notifications_enabled boolean not null default true,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row
  execute function public.set_updated_at();

alter table public.user_settings enable row level security;

create policy "players can view own settings"
  on public.user_settings for select
  using (player_id = auth.uid());

create policy "players can insert own settings"
  on public.user_settings for insert
  with check (player_id = auth.uid());

create policy "players can update own settings"
  on public.user_settings for update
  using (player_id = auth.uid());
