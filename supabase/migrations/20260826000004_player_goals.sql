create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  sub_skill_id uuid references public.sub_skills (id),
  description text not null,
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_goals_player_id_idx on public.player_goals (player_id);

create trigger player_goals_set_updated_at
  before update on public.player_goals
  for each row
  execute function public.set_updated_at();

alter table public.player_goals enable row level security;

create policy "players can view own goals"
  on public.player_goals for select
  using (player_id = auth.uid());

create policy "players can insert own goals"
  on public.player_goals for insert
  with check (player_id = auth.uid());

create policy "players can update own goals"
  on public.player_goals for update
  using (player_id = auth.uid());

create policy "players can delete own goals"
  on public.player_goals for delete
  using (player_id = auth.uid());
