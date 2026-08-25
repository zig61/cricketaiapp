-- issues (docs/04-database.md §1-2, SR-COACH-001/002/003)

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  measurement_id uuid not null references public.measurements (id) on delete cascade,
  root_cause_id uuid not null references public.root_causes (id),
  severity numeric not null check (severity >= 0.0 and severity <= 1.0),
  confidence numeric not null check (confidence >= 0.0 and confidence <= 1.0),
  is_primary boolean not null default false,
  -- LLM-generated, populated only for the primary issue (SR-COACH-005).
  explanation_text text,
  created_at timestamptz not null default now()
);

create index issues_analysis_id_idx on public.issues (analysis_id);

-- The core invariant: exactly one primary issue per analysis.
-- Enforced by the database, not application code — a partial unique index, not a plain
-- unique/check constraint (docs/04-database.md §4, docs/05-api.md implementation notes).
create unique index issues_one_primary_per_analysis
  on public.issues (analysis_id)
  where is_primary = true;

-- Close the circular FK dependency: videos.linked_issue_id -> issues.id, now that
-- `issues` exists (see comment in the videos_and_jobs migration).
alter table public.videos
  add constraint videos_linked_issue_id_fkey
  foreign key (linked_issue_id) references public.issues (id) on delete cascade;
