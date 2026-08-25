-- subscriptions: placeholder table reserved for future payments (docs/13-technology-decisions.md §9).
-- No v1 code path writes to this table.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  plan text not null,
  created_at timestamptz not null default now()
);

create index subscriptions_player_id_idx on public.subscriptions (player_id);
