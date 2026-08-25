-- Enable RLS on every table holding player data, and define one reusable ownership
-- helper so downstream policies don't each repeat a multi-table join.
-- RLS is the primary authorisation boundary (docs/04-database.md §5, docs/11-security.md §2) —
-- Coordinator API's own checks are defence-in-depth, not a substitute.

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.analyses enable row level security;
alter table public.measurements enable row level security;
alter table public.issues enable row level security;
alter table public.drill_prescriptions enable row level security;
alter table public.drill_completions enable row level security;
alter table public.progress_comparisons enable row level security;
alter table public.drills enable row level security;
alter table public.skills enable row level security;
alter table public.sub_skills enable row level security;
alter table public.root_causes enable row level security;
alter table public.subscriptions enable row level security;

-- True if the calling user (auth.uid()) owns the video identified by target_video_id.
-- SECURITY DEFINER so it can read `videos` regardless of the caller's own row-level
-- grants on that table; STABLE since it only reads within a single statement.
create or replace function public.owns_video(target_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.videos
    where id = target_video_id
      and player_id = auth.uid()
  );
$$;
