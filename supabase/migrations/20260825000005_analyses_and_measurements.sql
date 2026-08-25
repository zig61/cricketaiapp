-- analyses / measurements (docs/04-database.md §1-2, SR-CV-*)

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.videos (id) on delete cascade,
  -- Raw per-frame pose landmarks JSON lives in Storage, not Postgres (SR-CV-004).
  landmarks_storage_path text,
  measurement_formula_version text not null,
  created_at timestamptz not null default now()
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  marker_key text not null check (
    marker_key in (
      'head_stability', 'balance_weight_transfer', 'backlift_alignment',
      'front_elbow_height', 'base_width', 'follow_through_shape'
    )
  ),
  value numeric not null,
  unit text not null,
  confidence numeric not null check (confidence >= 0.0 and confidence <= 1.0),
  created_at timestamptz not null default now()
);

create index measurements_analysis_id_marker_key_idx on public.measurements (analysis_id, marker_key);
