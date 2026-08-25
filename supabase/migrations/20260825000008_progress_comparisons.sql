-- progress_comparisons (docs/04-database.md §1-2, SR-PROG-002)

create table public.progress_comparisons (
  id uuid primary key default gen_random_uuid(),
  original_issue_id uuid not null references public.issues (id) on delete cascade,
  followup_video_id uuid not null references public.videos (id) on delete cascade,
  followup_measurement_id uuid not null references public.measurements (id) on delete cascade,
  verdict text not null check (
    verdict in ('improved', 'no_material_change', 'regressed', 'inconclusive_low_confidence')
  ),
  -- Null when verdict is inconclusive.
  delta_value numeric,
  confidence numeric not null check (confidence >= 0.0 and confidence <= 1.0),
  formula_version_mismatch boolean not null default false,
  created_at timestamptz not null default now()
);

create index progress_comparisons_original_issue_id_idx on public.progress_comparisons (original_issue_id);
