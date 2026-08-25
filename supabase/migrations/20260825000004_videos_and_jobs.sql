-- videos / processing_jobs (docs/04-database.md §1-2, SR-VID-*)
--
-- NOTE on `linked_issue_id`: videos.linked_issue_id references issues.id, but issues
-- transitively references videos (issues -> analyses -> videos) — a circular FK dependency.
-- Resolved by creating the column here with no FK constraint, then attaching the FK
-- constraint via ALTER TABLE in the issues migration once the `issues` table exists.

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text,
  kind text not null check (kind in ('initial', 'followup')),
  linked_issue_id uuid,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validating', 'rejected', 'analysing', 'complete', 'failed')),
  rejection_reason text,
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  constraint videos_followup_requires_linked_issue
    check (kind <> 'followup' or linked_issue_id is not null),
  constraint videos_rejected_requires_reason
    check (status <> 'rejected' or rejection_reason is not null)
);

create index videos_player_id_idx on public.videos (player_id);
create index videos_linked_issue_id_idx on public.videos (linked_issue_id);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  stage text not null check (
    stage in (
      'validate', 'extract_frames', 'pose_estimate', 'measure',
      'diagnose', 'explain', 'match_drill', 'persist'
    )
  ),
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  error text,
  attempt_count int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  unique (video_id, stage)
);

create index processing_jobs_status_idx on public.processing_jobs (status);
