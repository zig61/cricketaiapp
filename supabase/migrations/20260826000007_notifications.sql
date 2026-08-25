create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('analysis_ready', 'drill_reminder', 'system')),
  title text not null,
  body text not null,
  related_video_id uuid references public.videos (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_player_id_idx on public.notifications (player_id);
create index notifications_player_id_unread_idx
  on public.notifications (player_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "players can view own notifications"
  on public.notifications for select
  using (player_id = auth.uid());

-- Owner may update their own notifications (in practice: marking read).
-- No INSERT/DELETE policy — notifications are created by the server (service
-- role) when something actually happens; a client can't fabricate its own.
create policy "players can update own notifications"
  on public.notifications for update
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
